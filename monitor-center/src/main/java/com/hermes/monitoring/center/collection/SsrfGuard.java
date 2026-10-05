package com.hermes.monitoring.center.collection;

import java.net.InetAddress;
import java.net.IDN;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

// 접속 URL 및 DNS 응답의 허용 범위 검증
public final class SsrfGuard {
    private final List<Cidr> allowedCidrs;
    private final Set<String> allowedHosts;
    private final Resolver resolver;
    private final Path allowlistFile;

    public SsrfGuard(String csv) {
        this(csv, "", InetAddress::getAllByName);
    }

    public SsrfGuard(String cidrs, String hosts) {
        this(cidrs, hosts, InetAddress::getAllByName);
    }

    public SsrfGuard(String cidrs, String hosts, String file) {
        this(
                cidrs,
                hosts,
                InetAddress::getAllByName,
                file == null || file.isBlank() ? null : Path.of(file));
    }

    SsrfGuard(String csv, Resolver resolver) {
        this(csv, "", resolver);
    }

    SsrfGuard(String csv, String hosts, Resolver resolver) {
        this(csv, hosts, resolver, null);
    }

    SsrfGuard(String csv, String hosts, Resolver resolver, Path allowlistFile) {
        this.resolver = resolver;
        this.allowlistFile = allowlistFile;
        this.allowedCidrs = new ArrayList<>();
        this.allowedHosts = new HashSet<>();
        if (allowlistFile != null) {
            AgentAllowlist.read(allowlistFile, resolver);
            return;
        }
        if (csv != null) {
            for (String value : csv.split(",")) {
                if (!value.isBlank()) {
                    allowedCidrs.add(Cidr.parse(value.trim()));
                }
            }
        }
        if (hosts != null) {
            for (String value : hosts.split(",")) {
                if (!value.isBlank()) {
                    allowedHosts.add(normalizeAllowedHost(value.trim()));
                }
            }
        }
    }

    // DNS를 한 번 조회하고 모든 응답 주소 검증 후 허용된 주소 반환
    // 호출자는 호스트명을 다시 조회하지 않고 반환된 IP로 연결
    public ResolvedTarget resolve(String base) {
        if (allowlistFile != null) {
            return AgentAllowlist.read(allowlistFile, resolver).resolve(base);
        }
        try {
            URI uri = new URI(base);
            validateUri(uri);
            String host = normalizeUriHost(uri.getHost());
            boolean hostAllowed = allowedHosts.contains(host);
            if (hostAllowed && !"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException("AGENT_URL_REJECTED");
            }
            boolean secureHostPath = hostAllowed && "https".equalsIgnoreCase(uri.getScheme());
            InetAddress[] answers = resolver.resolve(host);
            if (answers == null || answers.length == 0) {
                throw new IllegalArgumentException("DNS_EMPTY");
            }
            for (InetAddress address : answers) {
                validateAddress(address, secureHostPath);
            }
            return new ResolvedTarget(uri, List.copyOf(Arrays.asList(answers)));
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (UnknownHostException error) {
            throw new IllegalArgumentException("DNS_ERROR", error);
        } catch (Exception error) {
            throw new IllegalArgumentException("AGENT_URL_REJECTED");
        }
    }

    // 설정 검증만 필요한 호출에 URI 반환
    public URI validate(String base) {
        return resolve(base).uri();
    }

    private void validateUri(URI uri) {
        boolean validScheme =
                "http".equalsIgnoreCase(uri.getScheme())
                        || "https".equalsIgnoreCase(uri.getScheme());
        boolean validPath = uri.normalize().getPath().equals(uri.getPath());
        if (!validScheme
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null
                || !validPath) {
            throw new IllegalArgumentException("AGENT_URL_REJECTED");
        }
        int port = uri.getPort();
        if (port == 0 || port > 65_535) {
            throw new IllegalArgumentException("AGENT_URL_REJECTED");
        }
    }

    private void validateAddress(InetAddress address, boolean secureHostPath) {
        if (address.isAnyLocalAddress()
                || address.isMulticastAddress()
                || address.isLinkLocalAddress()
                || isMetadataAddress(address)) {
            throw new IllegalArgumentException("ADDRESS_NOT_ALLOWED");
        }
        if (secureHostPath) {
            if (address.isLoopbackAddress() || address.isSiteLocalAddress() || !isGlobal(address)) {
                throw new IllegalArgumentException("ADDRESS_NOT_ALLOWED");
            }
            return;
        }
        for (Cidr cidr : allowedCidrs) {
            if (!cidr.contains(address)) {
                continue;
            }
            if (address.isLoopbackAddress() && !cidr.isExactHost()) {
                throw new IllegalArgumentException("ADDRESS_NOT_ALLOWED");
            }
            return;
        }
        throw new IllegalArgumentException("ADDRESS_NOT_ALLOWED");
    }

    private String normalizeAllowedHost(String value) {
        if (value.contains("*")
                || value.contains("@")
                || value.contains(":")
                || value.startsWith("[")
                || value.endsWith(".")) {
            throw new IllegalArgumentException("HOST_INVALID");
        }
        String host = normalizeHost(value);
        if (isNumericIpv4Literal(host)) {
            throw new IllegalArgumentException("HOST_INVALID");
        }
        return host;
    }

    private boolean isNumericIpv4Literal(String host) {
        String component = "(?:0[xX][0-9a-fA-F]+|[0-9]+)";
        return host.matches(component + "(?:\\." + component + "){0,3}");
    }

    private String normalizeUriHost(String value) {
        if (value == null || value.contains(":")) {
            return value == null ? "" : value.toLowerCase(Locale.ROOT);
        }
        return normalizeHost(value);
    }

    private String normalizeHost(String value) {
        try {
            String ascii = IDN.toASCII(value, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
            if (ascii.isEmpty()
                    || ascii.length() > 253
                    || ascii.startsWith(".")
                    || ascii.endsWith(".")) {
                throw new IllegalArgumentException("HOST_INVALID");
            }
            return ascii;
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("HOST_INVALID");
        }
    }

    private boolean isGlobal(InetAddress address) {
        byte[] b = address.getAddress();
        if (b.length == 4) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            return first != 0
                    && first != 10
                    && first != 127
                    && first < 224
                    && !(first == 100 && second >= 64 && second <= 127)
                    && !(first == 169 && second == 254)
                    && !(first == 172 && second >= 16 && second <= 31)
                    && !(first == 192 && (second == 0 || second == 168))
                    && !(first == 192 && second == 88 && (b[2] & 0xff) == 99)
                    && !(first == 198 && (second == 18 || second == 19))
                    && !(first == 198 && second == 51 && (b[2] & 0xff) == 100)
                    && !(first == 203 && second == 0 && (b[2] & 0xff) == 113);
        }
        int first = b[0] & 0xff;
        int second = b[1] & 0xff;
        int third = b[2] & 0xff;
        int fourth = b[3] & 0xff;
        boolean globalUnicast = (first & 0xe0) == 0x20;
        boolean ianaSpecial2001 = first == 0x20 && second == 0x01 && third <= 0x01;
        boolean documentation2001 =
                first == 0x20 && second == 0x01 && third == 0x0d && fourth == 0xb8;
        boolean sixToFour = first == 0x20 && second == 0x02;
        boolean documentation3fff = first == 0x3f && (second & 0xf0) == 0xf0;
        return globalUnicast
                && !ianaSpecial2001
                && !documentation2001
                && !sixToFour
                && !documentation3fff;
    }

    private boolean isMetadataAddress(InetAddress address) {
        String normalized = address.getHostAddress().toLowerCase();
        return "169.254.169.254".equals(normalized)
                || "fd00:ec2:0:0:0:0:0:254".equals(normalized)
                || "fd00:ec2::254".equals(normalized);
    }

    @FunctionalInterface
    interface Resolver {
        InetAddress[] resolve(String hostname) throws UnknownHostException;
    }

    public record ResolvedTarget(URI uri, List<InetAddress> addresses) {
        public InetAddress address() {
            return addresses.get(0);
        }
    }

    private record Cidr(byte[] network, int bits) {
        static Cidr parse(String value) {
            try {
                String[] parts = value.split("/", -1);
                if (parts.length != 2) {
                    throw new IllegalArgumentException("CIDR_INVALID");
                }
                boolean ipv4Literal = parts[0].matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}");
                boolean ipv6Literal = parts[0].contains(":");
                if (!ipv4Literal && !ipv6Literal) {
                    throw new IllegalArgumentException("CIDR_INVALID");
                }
                byte[] network = InetAddress.getByName(parts[0]).getAddress();
                int bits = Integer.parseInt(parts[1]);
                if (bits < 0 || bits > network.length * 8) {
                    throw new IllegalArgumentException("CIDR_INVALID");
                }
                return new Cidr(network, bits);
            } catch (IllegalArgumentException error) {
                throw error;
            } catch (Exception error) {
                throw new IllegalArgumentException("CIDR_INVALID");
            }
        }

        boolean contains(InetAddress address) {
            byte[] candidate = address.getAddress();
            if (candidate.length != network.length) {
                return false;
            }
            int completeBytes = bits / 8;
            int remainingBits = bits % 8;
            for (int index = 0; index < completeBytes; index++) {
                if (candidate[index] != network[index]) {
                    return false;
                }
            }
            if (remainingBits == 0) {
                return true;
            }
            int mask = 0xff << (8 - remainingBits);
            return (candidate[completeBytes] & mask) == (network[completeBytes] & mask);
        }

        boolean isExactHost() {
            return bits == network.length * 8;
        }
    }
}
