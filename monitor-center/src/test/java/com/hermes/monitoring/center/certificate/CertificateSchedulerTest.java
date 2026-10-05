package com.hermes.monitoring.center.certificate;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CertificateSchedulerTest {
    @Test
    void dueScanRunsEveryMinuteSoMinuteBasedTargetIntervalsAreHonored() throws Exception {
        Method method = CertificateScheduler.class.getMethod("checkDueTargets");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);
        assertEquals(
                "${hermes.certificate-scheduler-delay-ms:60000}", scheduled.fixedDelayString());
        try (java.io.InputStream migration =
                getClass().getClassLoader().getResourceAsStream("db/migration/V1__baseline.sql")) {
            String sql = new String(migration.readAllBytes(), StandardCharsets.UTF_8);
            org.junit.jupiter.api.Assertions.assertTrue(
                    sql.matches("(?s).*check_interval_minutes integer NOT NULL DEFAULT 360.*"));
        }
    }

    @Test
    void dueQueryCarriesTheFullVersionedTargetIdentity() {
        org.springframework.jdbc.core.JdbcTemplate db =
                org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        CertificateCheckService checks = org.mockito.Mockito.mock(CertificateCheckService.class);
        new CertificateScheduler(db, checks).checkDueTargets();

        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(db).queryForList(sql.capture());
        for (String column :
                new String[] {"project_id", "hostname", "port", "sni_hostname", "target_version"}) {
            assertTrue(sql.getValue().contains(column), column);
        }
        assertTrue(sql.getValue().contains("l.checked_at is null"));
    }
}
