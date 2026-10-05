package com.hermes.monitoring.center.certificate;

import com.hermes.monitoring.center.security.ProjectAccess;
import com.hermes.monitoring.center.web.ApiPage;
import com.hermes.monitoring.center.web.PageQuery;
import java.net.IDN;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// 인증서 대상 관리 및 검사 요청 처리
@RestController
@RequestMapping("/api/v1/certificates")
public class CertificateController {
    private static final Map<String, String> SORTS =
            Map.of(
                    "hostname",
                    "t.hostname",
                    "status",
                    "l.status",
                    "not_after",
                    "l.not_after",
                    "checked_at",
                    "l.checked_at");
    private final JdbcTemplate db;
    private final CertificateCheckService checks;

    CertificateController(JdbcTemplate db, CertificateCheckService checks) {
        this.db = db;
        this.checks = checks;
    }

    @GetMapping
    ApiPage<Map<String, Object>> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "sort", defaultValue = "hostname,asc") String sort,
            @RequestParam(name = "project", required = false) String project,
            @RequestParam(name = "status", required = false) String status) {
        PageQuery query = PageQuery.of(page, size, sort, SORTS);
        if (status != null && !List.of("UP", "WARN", "DOWN", "UNKNOWN").contains(status)) {
            throw new IllegalArgumentException("STATUS_INVALID");
        }
        List<Object> arguments = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where " + ProjectAccess.sql("t.project_id"));
        if (project != null && !project.isBlank()) {
            where.append(" and t.project_id=?");
            arguments.add(project);
        }
        if (status != null) {
            where.append(" and coalesce(l.status,'UNKNOWN')=?");
            arguments.add(status);
        }
        String from =
                """
            from certificate_targets t left join certificate_latest l using(certificate_target_id)
            """
                        + where;
        Long total = db.queryForObject("select count(*) " + from, Long.class, arguments.toArray());
        arguments.add(query.size());
        arguments.add(query.offset());
        List<Map<String, Object>> items =
                db.queryForList(
                        """
            select t.*,l.subject,l.issuer,l.serial_number,l.not_before,l.not_after,
              l.days_remaining,l.chain_valid,l.hostname_valid,l.signature_algorithm,
              l.status,l.message,l.checked_at
            """
                                + from
                                + " order by "
                                + query.orderBy()
                                + " limit ? offset ?",
                        arguments.toArray());
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }

    @PostMapping
    ResponseEntity<Void> create(@RequestBody Target value) {
        validate(value);
        db.update(
                """
            insert into certificate_targets(
              project_id,hostname,port,sni_hostname,enabled,check_interval_minutes)
            values(?,?,?,?,?,?)
            """,
                value.projectId(),
                value.hostname(),
                value.port(),
                value.sniHostname(),
                value.enabled(),
                value.checkIntervalMinutes());
        return ResponseEntity.status(201).build();
    }

    @PutMapping("/{id}")
    @Transactional
    void update(@PathVariable("id") long id, @RequestBody Target value) {
        if (id < 1) {
            throw new IllegalArgumentException("CERTIFICATE_ID_INVALID");
        }
        validate(value);
        db.update(
                """
            update certificate_targets set project_id=?,hostname=?,port=?,sni_hostname=?,
              enabled=?,check_interval_minutes=?,target_version=target_version+1
            where certificate_target_id=?
            """,
                value.projectId(),
                value.hostname(),
                value.port(),
                value.sniHostname(),
                value.enabled(),
                value.checkIntervalMinutes(),
                id);
        db.update("delete from certificate_latest where certificate_target_id=?", id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disable(@PathVariable("id") long id) {
        db.update("update certificate_targets set enabled=false where certificate_target_id=?", id);
    }

    @PostMapping("/{id}/check")
    ResponseEntity<Map<String, String>> check(@PathVariable("id") long id) {
        if (id < 1) {
            throw new IllegalArgumentException("CERTIFICATE_ID_INVALID");
        }
        CertificateCheckService.Submission submission = checks.submit(id);
        if (submission != CertificateCheckService.Submission.ACCEPTED) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("code", submission.name()));
        }
        return ResponseEntity.accepted().body(Map.of("status", "ACCEPTED"));
    }

    private void validate(Target value) {
        if (value == null
                || value.projectId() == null
                || !value.projectId().matches("[a-z0-9][a-z0-9._-]{1,63}")) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_INVALID");
        }
        validateHostname(value.hostname());
        validateHostname(value.sniHostname());
        if (value.port() == null
                || value.port() < 1
                || value.port() > 65_535
                || value.enabled() == null
                || value.checkIntervalMinutes() == null
                || value.checkIntervalMinutes() < 1) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_INVALID");
        }
    }

    private void validateHostname(String hostname) {
        try {
            String ascii =
                    hostname == null ? null : IDN.toASCII(hostname, IDN.USE_STD3_ASCII_RULES);
            if (hostname == null
                    || hostname.isBlank()
                    || !hostname.equals(hostname.trim())
                    || hostname.matches(".*\\s.*")
                    || hostname.contains("/")
                    || ascii.length() > 253
                    || !validLabels(ascii)) {
                throw new IllegalArgumentException("CERTIFICATE_TARGET_INVALID");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("CERTIFICATE_TARGET_INVALID");
        }
    }

    private boolean validLabels(String hostname) {
        for (String label : hostname.split("\\.", -1)) {
            if (!label.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")) {
                return false;
            }
        }
        return true;
    }

    record Target(
            String projectId,
            String hostname,
            Integer port,
            String sniHostname,
            Boolean enabled,
            Integer checkIntervalMinutes) {}
}
