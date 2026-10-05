package com.monitoring.agent.certificate;

import com.monitoring.agent.metric.ThresholdResolver;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.springframework.stereotype.Component;

// TLS 연결로 인증서 체인·호스트명·만료일 검증
@Component
public class CertificateChecker {
    private final Clock clock;

    public CertificateChecker() {
        this(Clock.systemUTC());
    }

    CertificateChecker(Clock clock) {
        this.clock = clock;
    }

    public Result check(String host, int port, String sni, ThresholdResolver.Limits limits)
            throws Exception {
        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        try (Socket connection = new Socket()) {
            connection.connect(new InetSocketAddress(host, port), 5000);
            try (SSLSocket socket = (SSLSocket) factory.createSocket(connection, sni, port, true)) {
                socket.setSoTimeout(5000);
                SSLParameters parameters = socket.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                parameters.setServerNames(List.of(new SNIHostName(sni)));
                socket.setSSLParameters(parameters);
                socket.startHandshake();
                X509Certificate certificate =
                        (X509Certificate) socket.getSession().getPeerCertificates()[0];
                Instant checkedAt = clock.instant();
                certificate.checkValidity(Date.from(checkedAt));
                Instant notBefore = certificate.getNotBefore().toInstant();
                Instant notAfter = certificate.getNotAfter().toInstant();
                long days = Duration.between(checkedAt, notAfter).toDays();
                String algorithm = certificate.getSigAlgName();
                String status = status(days, algorithm, limits);
                return new Result(
                        certificate.getSubjectX500Principal().getName(),
                        certificate.getIssuerX500Principal().getName(),
                        certificate.getSerialNumber().toString(16),
                        notBefore,
                        notAfter,
                        days,
                        true,
                        true,
                        algorithm,
                        status);
            }
        }
    }

    String status(long daysRemaining, String signatureAlgorithm, ThresholdResolver.Limits limits) {
        if (daysRemaining <= limits.critical()) {
            return "DOWN";
        }
        if (daysRemaining <= limits.warning()
                || signatureAlgorithm.toUpperCase(Locale.ROOT).contains("SHA1")) {
            return "WARN";
        }
        return "UP";
    }

    public record Result(
            String subject,
            String issuer,
            String serialNumber,
            Instant notBefore,
            Instant notAfter,
            long daysRemaining,
            boolean chainValid,
            boolean hostnameValid,
            String signatureAlgorithm,
            String status) {}
}
