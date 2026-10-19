package com.monitoring.agent.setting;

import com.monitoring.agent.metric.ThresholdResolver;
import com.monitoring.agent.security.ProjectAccess;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 인스턴스 임계값과 담당 이메일 설정 처리. 실제 메일 발송은 별도 구성
@RestController
@RequestMapping("/api/v1/projects/{projectId}/instances/{instanceId}/thresholds")
public class InstanceThresholdController {
    private static final List<String> METRICS =
            List.of(
                    "SYSTEM_CPU",
                    "PHYSICAL_MEMORY",
                    "JVM_HEAP",
                    "DISK",
                    "DB_POOL",
                    "API_LATENCY_MS",
                    "CERTIFICATE_DAYS");
    private final JdbcTemplate db;
    private final ThresholdResolver resolver;
    private final ObjectMapper json;

    InstanceThresholdController(JdbcTemplate db, ThresholdResolver resolver, ObjectMapper json) {
        this.db = db;
        this.resolver = resolver;
        this.json = json;
    }

    @GetMapping
    Settings get(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId) {
        Map<String, Object> instance = instance(projectId, instanceId);
        var defaults = resolver.resolve(projectId, null);
        var resolved = resolver.resolve(projectId, instanceId);
        Set<String> overrides = Set.copyOf(db.queryForList(
                """
                select metric_key
                from thresholds
                where
                    scope = 'INSTANCE'
                    and project_id = ?
                    and instance_id = ?
                """,
                String.class,
                projectId,
                instanceId));
        var contacts = db.queryForList(
                """
                select
                    recipient_emails
                    ,metric_emails
                from instance_threshold_contacts
                where
                    project_id = ?
                    and instance_id = ?
                """,
                projectId,
                instanceId);
        JsonNode emails = contacts.isEmpty() ? json.readTree("[]")
                : json.readTree(contacts.getFirst().get("recipient_emails").toString());
        JsonNode metricEmails = contacts.isEmpty() ? json.readTree("{}")
                : json.readTree(contacts.getFirst().get("metric_emails").toString());
        var certificate = linkedCertificate(projectId, instanceId);
        List<Metric> metrics = new ArrayList<>();
        for (String key : METRICS) {
            if (!overrides.contains(key)) {
                continue;
            }
            var value = resolved.get(key);
            var baseline = defaults.get(key);
            metrics.add(new Metric(
                    key,
                    value.warning(),
                    value.critical(),
                    baseline.warning(),
                    baseline.critical(),
                    !overrides.contains(key),
                    emails(metricEmails.path(key)),
                    "CERTIFICATE_DAYS".equals(key) && certificate != null ? certificate.id() : null,
                    "CERTIFICATE_DAYS".equals(key) && certificate != null ? certificate.label() : null));
        }
        return new Settings(
                instance.get("project_name").toString(),
                instance.get("instance_name").toString(),
                emails(emails),
                metrics);
    }

    @GetMapping("/certificates")
    List<CertificateChoice> certificates(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId) {
        instance(projectId, instanceId);
        return db.query(
                """
                select
                    t.certificate_target_id
                    ,t.hostname
                    ,t.port
                from certificate_targets t
                left join instance_certificate_thresholds b using(certificate_target_id)
                where
                    t.project_id = ?
                    and t.enabled
                    and (b.instance_id is null or b.instance_id = ?)
                order by t.hostname, t.port
                """,
                (row, index) -> new CertificateChoice(
                        row.getLong("certificate_target_id"),
                        row.getString("hostname") + ":" + row.getInt("port")),
                projectId,
                instanceId);
    }

    @PutMapping
    @Transactional
    Settings put(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestBody Write value) {
        instance(projectId, instanceId);
        if (value == null || value.metrics() == null || value.metrics().size() > METRICS.size()) {
            throw new IllegalArgumentException("INSTANCE_THRESHOLD_INVALID");
        }

        // 같은 인스턴스의 목록 갱신 직렬화 및 SSL 대상 연결 보호
        db.queryForList(
                """
                select instance_id
                from instances
                where
                    project_id = ?
                    and instance_id = ?
                for update
                """,
                projectId,
                instanceId);
        var previousCertificate = linkedCertificate(projectId, instanceId);
        Long selectedCertificateId = null;
        List<String> recipients = validateEmails(value.recipientEmails());
        Set<String> seen = new LinkedHashSet<>();
        Map<String, List<String>> metricEmails = new LinkedHashMap<>();

        // 전체 항목 검증 후 저장. 중복 항목과 사용률 100% 초과 차단
        for (MetricWrite metric : value.metrics()) {
            if (metric == null
                    || metric.metricKey() == null
                    || !METRICS.contains(metric.metricKey())
                    || !seen.add(metric.metricKey())) {
                throw new IllegalArgumentException("INSTANCE_THRESHOLD_INVALID");
            }
            boolean certificate = "CERTIFICATE_DAYS".equals(metric.metricKey());
            boolean ascending = !certificate;
            if (!metric.useDefault()
                    && (!Double.isFinite(metric.warningValue())
                        || !Double.isFinite(metric.criticalValue())
                        || metric.warningValue() < 0
                        || metric.criticalValue() < 0
                        || (ascending && metric.warningValue() > metric.criticalValue())
                        || (certificate && (metric.warningValue() < metric.criticalValue()
                            || metric.warningValue() != Math.rint(metric.warningValue())
                            || metric.criticalValue() != Math.rint(metric.criticalValue())))
                        || (!certificate && !"API_LATENCY_MS".equals(metric.metricKey())
                            && metric.criticalValue() > 1))) {
                throw new IllegalArgumentException("INSTANCE_THRESHOLD_INVALID");
            }
            if (certificate && !metric.useDefault()) {
                selectedCertificateId = metric.certificateTargetId();
                validateCertificate(projectId, instanceId, selectedCertificateId);
            }
            metricEmails.put(metric.metricKey(), validateEmails(metric.recipientEmails()));
        }

        // 요청 목록에서 제외한 항목만 삭제. 다른 서버와 인증서 기준 유지
        for (String key : METRICS) {
            if (!seen.contains(key)) {
                db.update(
                        """
                        delete from thresholds
                        where
                            scope = 'INSTANCE'
                            and project_id = ?
                            and instance_id = ?
                            and metric_key = ?
                        """,
                        projectId,
                        instanceId,
                        key);
            }
        }

        for (MetricWrite metric : value.metrics()) {
            if (metric.useDefault()) {
                db.update(
                        """
                        delete from thresholds
                        where
                            scope = 'INSTANCE'
                            and project_id = ?
                            and instance_id = ?
                            and metric_key = ?
                        """,
                        projectId,
                        instanceId,
                        metric.metricKey());
            } else {
                db.update(
                        """
                        insert into thresholds(
                            scope
                            ,project_id
                            ,instance_id
                            ,metric_key
                            ,warning_value
                            ,critical_value)
                        values ('INSTANCE', ?, ?, ?, ?, ?)
                        on conflict(scope, project_id, instance_id, metric_key)
                        do update set
                            warning_value = excluded.warning_value
                            ,critical_value = excluded.critical_value
                            ,updated_at = now()
                        """,
                        projectId,
                        instanceId,
                        metric.metricKey(),
                        metric.warningValue(),
                        metric.criticalValue());
            }
        }

        db.update(
                """
                insert into instance_threshold_contacts(
                    project_id
                    ,instance_id
                    ,recipient_emails
                    ,metric_emails)
                values (?, ?, cast(? as jsonb), cast(? as jsonb))
                on conflict(project_id, instance_id)
                do update set
                    recipient_emails = excluded.recipient_emails
                    ,metric_emails = excluded.metric_emails
                    ,updated_at = now()
                """,
                projectId,
                instanceId,
                json.writeValueAsString(recipients),
                json.writeValueAsString(metricEmails));

        db.update(
                """
                delete from instance_certificate_thresholds
                where
                    project_id = ?
                    and instance_id = ?
                """,
                projectId,
                instanceId);
        if (selectedCertificateId != null) {
            db.update(
                    """
                    insert into instance_certificate_thresholds(
                        project_id
                        ,instance_id
                        ,certificate_target_id)
                    values (?, ?, ?)
                    """,
                    projectId,
                    instanceId,
                    selectedCertificateId);
        }
        // 저장 직후 기존 결과 재판정 및 변경 전 실행 중 결과의 덮어쓰기 차단
        Set<Long> changedCertificates = new LinkedHashSet<>();
        if (previousCertificate != null) {
            changedCertificates.add(previousCertificate.id());
        }
        if (selectedCertificateId != null) {
            changedCertificates.add(selectedCertificateId);
        }
        for (Long id : changedCertificates) {
            refreshCertificate(projectId, id);
        }

        return get(projectId, instanceId);
    }

    private CertificateChoice linkedCertificate(String projectId, String instanceId) {
        var rows = db.query(
                """
                select
                    t.certificate_target_id
                    ,t.hostname
                    ,t.port
                from instance_certificate_thresholds b
                join certificate_targets t using(certificate_target_id)
                where
                    b.project_id = ?
                    and b.instance_id = ?
                """,
                (row, index) -> new CertificateChoice(
                        row.getLong("certificate_target_id"),
                        row.getString("hostname") + ":" + row.getInt("port")),
                projectId,
                instanceId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void validateCertificate(String projectId, String instanceId, Long id) {
        if (id == null) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_REQUIRED");
        }
        var rows = db.queryForList(
                """
                select certificate_target_id
                from certificate_targets
                where
                    certificate_target_id = ?
                    and project_id = ?
                    and enabled
                for update
                """,
                id,
                projectId);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_INVALID");
        }
        Boolean assigned = db.queryForObject(
                """
                select exists(
                    select 1
                    from instance_certificate_thresholds
                    where
                        certificate_target_id = ?
                        and instance_id <> ?
                )
                """,
                Boolean.class,
                id,
                instanceId);
        if (Boolean.TRUE.equals(assigned)) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_ALREADY_ASSIGNED");
        }
    }

    private void refreshCertificate(String projectId, long id) {
        db.update(
                """
                update certificate_targets
                set target_version = target_version + 1
                where certificate_target_id = ?
                """,
                id);
        var limits = resolver.resolveCertificate(projectId, id);
        db.update(
                """
                update certificate_latest
                set status = case
                    when chain_valid = false or hostname_valid = false then 'DOWN'
                    when days_remaining <= ? then 'DOWN'
                    when days_remaining <= ?
                        or lower(coalesce(signature_algorithm, '')) like '%sha1%' then 'WARN'
                    else 'UP'
                end
                where
                    certificate_target_id = ?
                    and days_remaining is not null
                    and chain_valid is not null
                    and hostname_valid is not null
                """,
                limits.critical(),
                limits.warning(),
                id);
    }

    private Map<String, Object> instance(String projectId, String instanceId) {
        var rows = db.queryForList(
                """
                select
                    p.display_name as project_name
                    ,i.display_name as instance_name
                from instances i
                join projects p using(project_id)
                where
                    i.project_id = ?
                    and i.instance_id = ?
                    and __ACCESS__
                """.replace("__ACCESS__", ProjectAccess.sql("i.project_id")),
                projectId,
                instanceId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "INSTANCE_NOT_FOUND");
        }
        return rows.getFirst();
    }

    private List<String> validateEmails(List<String> values) {
        if (values == null || values.size() > 10) {
            throw new IllegalArgumentException("RECIPIENT_EMAIL_INVALID");
        }
        Set<String> result = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null || value.length() > 254) {
                throw new IllegalArgumentException("RECIPIENT_EMAIL_INVALID");
            }
            String email = value.trim();
            if (!email.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+")) {
                throw new IllegalArgumentException("RECIPIENT_EMAIL_INVALID");
            }
            result.add(email);
        }
        return List.copyOf(result);
    }

    private List<String> emails(JsonNode node) {
        List<String> values = new ArrayList<>();
        for (JsonNode email : node) {
            values.add(email.asString());
        }
        return values;
    }

    record Settings(
            String projectName,
            String instanceName,
            List<String> recipientEmails,
            List<Metric> metrics) {}

    record Metric(
            String metricKey,
            double warningValue,
            double criticalValue,
            double defaultWarningValue,
            double defaultCriticalValue,
            boolean useDefault,
            List<String> recipientEmails,
            Long certificateTargetId,
            String certificateTargetLabel) {}

    record Write(List<String> recipientEmails, List<MetricWrite> metrics) {}

    record MetricWrite(
            String metricKey,
            double warningValue,
            double criticalValue,
            boolean useDefault,
            List<String> recipientEmails,
            Long certificateTargetId) {}

    record CertificateChoice(long id, String label) {}
}
