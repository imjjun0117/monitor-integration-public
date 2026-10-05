package com.hermes.monitoring.center.certificate;

import java.sql.Timestamp;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 인증서 검사 결과 및 이력 저장
@Component
final class CertificateResultStore {
    private static final String UPSERT =
            """
        insert into certificate_latest(
          certificate_target_id,subject,issuer,serial_number,not_before,not_after,
          days_remaining,chain_valid,hostname_valid,signature_algorithm,status,message,checked_at)
        select t.certificate_target_id,?,?,?,?,?,?,?,?,?,?,?,?
        from certificate_targets t
        where t.certificate_target_id=? and t.target_version=? and t.project_id=?
          and t.hostname=? and t.port=? and t.sni_hostname=?
        for key share of t
        on conflict(certificate_target_id) do update set
          subject=excluded.subject,issuer=excluded.issuer,serial_number=excluded.serial_number,
          not_before=excluded.not_before,not_after=excluded.not_after,
          days_remaining=excluded.days_remaining,chain_valid=excluded.chain_valid,
          hostname_valid=excluded.hostname_valid,
          signature_algorithm=excluded.signature_algorithm,status=excluded.status,
          message=excluded.message,checked_at=excluded.checked_at
        """;

    private final JdbcTemplate db;
    private final Clock clock;

    @Autowired
    CertificateResultStore(JdbcTemplate db) {
        this(db, Clock.systemUTC());
    }

    CertificateResultStore(JdbcTemplate db, Clock clock) {
        this.db = db;
        this.clock = clock;
    }

    boolean success(CertificateCheckService.Target target, CertificateChecker.Result result) {
        return db.update(
                        UPSERT,
                        result.subject(),
                        result.issuer(),
                        result.serialNumber(),
                        Timestamp.from(result.notBefore()),
                        Timestamp.from(result.notAfter()),
                        result.daysRemaining(),
                        result.chainValid(),
                        result.hostnameValid(),
                        result.signatureAlgorithm(),
                        result.status(),
                        "TLS_CHECK_SUCCEEDED",
                        Timestamp.from(clock.instant()),
                        target.id(),
                        target.version(),
                        target.projectId(),
                        target.hostname(),
                        target.port(),
                        target.sniHostname())
                > 0;
    }

    boolean failure(CertificateCheckService.Target target) {
        return failure(target, "TLS_CHECK_FAILED");
    }

    boolean failure(CertificateCheckService.Target target, String code) {
        Object[] values = {
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "DOWN",
            code,
            Timestamp.from(clock.instant()),
            target.id(),
            target.version(),
            target.projectId(),
            target.hostname(),
            target.port(),
            target.sniHostname()
        };
        return db.update(UPSERT, values) > 0;
    }
}
