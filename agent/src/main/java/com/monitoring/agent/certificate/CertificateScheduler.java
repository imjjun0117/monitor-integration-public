package com.monitoring.agent.certificate;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 검사 주기가 지난 인증서 작업 등록
@Component
public final class CertificateScheduler {
    private final JdbcTemplate db;
    private final CertificateCheckService checks;

    CertificateScheduler(JdbcTemplate db, CertificateCheckService checks) {
        this.db = db;
        this.checks = checks;
    }

    @Scheduled(fixedDelayString = "${hermes.certificate-scheduler-delay-ms:60000}")
    public void checkDueTargets() {
        List<Map<String, Object>> targets =
                db.queryForList(
                        """
            select t.certificate_target_id,t.project_id,t.hostname,t.port,t.sni_hostname,
              t.target_version
            from certificate_targets t
            left join certificate_latest l using(certificate_target_id)
            where t.enabled and (l.checked_at is null
              or l.checked_at < now()-(t.check_interval_minutes * interval '1 minute'))
            """);
        for (Map<String, Object> target : targets) {
            checks.submit(CertificateCheckService.Target.from(target));
        }
    }
}
