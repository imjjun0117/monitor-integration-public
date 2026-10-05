package com.hermes.monitoring.center.collection;

import java.net.InetAddress;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SsrfGuardAllowedHostsTest {
    private static final InetAddress PUBLIC = address("93.184.216.34");

    @Test
    void exactAllowedPublicHttpsHostnameSucceedsWithoutCidr() {
        SsrfGuard guard = guard("Example.COM", PUBLIC);
        assertEquals(PUBLIC, guard.resolve("https://example.com:8443").address());
        assertEquals(
                PUBLIC,
                guard("BÜCHER.example", PUBLIC).resolve("https://xn--bcher-kva.example").address());
    }

    @Test
    void allowedHostnameRequiresHttps() {
        assertThrows(
                IllegalArgumentException.class,
                () -> guard("example.com", PUBLIC).resolve("http://example.com"));
    }

    @Test
    void allowedHostnameFailsClosedWhenAnyAnswerIsNotGlobal() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        guard("example.com", PUBLIC, address("10.0.0.1"))
                                .resolve("https://example.com"));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        guard("example.com", PUBLIC, address("169.254.169.254"))
                                .resolve("https://example.com"));
    }

    @Test
    void unlistedPublicHostnameIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () -> guard("allowed.example", PUBLIC).resolve("https://other.example"));
    }

    @Test
    void hostEntriesRejectIpLiteralsWildcardsUserinfoAndMalformedIdn() {
        for (String invalid :
                new String[] {
                    "127.0.0.1",
                    "::1",
                    "*.example.com",
                    "user@example.com",
                    "bad host",
                    "\ud800.example"
                }) {
            assertThrows(IllegalArgumentException.class, () -> new SsrfGuard("", invalid), invalid);
        }
    }

    @Test
    void allowedHostnameOverHttpCannotFallBackToAllowedCidr() {
        SsrfGuard guard =
                new SsrfGuard(
                        "10.0.0.7/32",
                        "internal.example",
                        host -> new InetAddress[] {address("10.0.0.7")});
        assertThrows(
                IllegalArgumentException.class,
                () -> guard.resolve("http://internal.example:8080"));
    }

    @Test
    void cidrPathStillPermitsExplicitInternalHostOverHttp() {
        SsrfGuard guard =
                new SsrfGuard("10.0.0.7/32", "", host -> new InetAddress[] {address("10.0.0.7")});
        assertEquals(
                "10.0.0.7",
                guard.resolve("http://internal.example:8080").address().getHostAddress());
    }

    @Test
    void allowedHostnameRejectsNonGlobalAndSpecialPurposeIpv6Answers() {
        String[] rejected = {
            "::",
            "::1",
            "::ffff:10.0.0.1",
            "64:ff9b::10.0.0.1",
            "100::1",
            "fc00::1",
            "fd00::1",
            "fe80::1",
            "2001::1",
            "2001:2::1",
            "2001:10::1",
            "2001:20::1",
            "2001:db8::1",
            "2002::1",
            "3fff::1",
            "5f00::1",
            "ff00::1"
        };
        for (String value : rejected) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> guard("example.com", address(value)).resolve("https://example.com"),
                    value);
        }
    }

    @Test
    void allowedHostnameAcceptsOrdinaryGlobalIpv6Answer() {
        InetAddress global = address("2606:2800:220:1:248:1893:25c8:1946");
        assertEquals(global, guard("example.com", global).resolve("https://example.com").address());
    }

    @Test
    void hostEntriesRejectEveryNumericIpv4LiteralSyntaxWithoutDnsLookup() {
        String[] rejected = {
            "1572395042",
            "0x5db8d822",
            "013355433042",
            "93.184.55330",
            "93.120442",
            "0x5d.0xb8.0xd8.0x22",
            "0135.0270.0330.0042"
        };
        for (String value : rejected) {
            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            new SsrfGuard(
                                    "",
                                    value,
                                    host -> {
                                        throw new AssertionError(
                                                "allowed-host construction must not resolve DNS");
                                    }),
                    value);
        }
    }

    @Test
    void digitContainingDnsHostnameRemainsValid() {
        InetAddress publicAddress = address("93.184.216.34");
        assertEquals(
                publicAddress,
                guard("agent123.example", publicAddress)
                        .resolve("https://agent123.example")
                        .address());
    }

    private SsrfGuard guard(String hosts, InetAddress... answers) {
        return new SsrfGuard("", hosts, ignored -> answers);
    }

    private static InetAddress address(String value) {
        try {
            return InetAddress.getByName(value);
        } catch (Exception error) {
            throw new AssertionError(error);
        }
    }
}
