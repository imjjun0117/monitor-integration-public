package com.hermes.monitoring.center.log;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletResponse;

// 로그 설정 및 권한을 확인하여 조회 요청 처리
@RestController
@RequestMapping("/api/v1/projects/{projectId}/instances/{instanceId}/logs")
public final class LogController {
    private final JdbcTemplate db;
    private final LogService logs;

    LogController(JdbcTemplate db, LogService logs) {
        this.db = db;
        this.logs = logs;
    }

    @GetMapping
    List<Map<String, Object>> list(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId) {
        return db.queryForList(
                "select log_id,name,path,encoding,enabled,poll_interval_seconds from log_sources where project_id=? and instance_id=? order by log_id",
                projectId,
                instanceId);
    }

    @PostMapping
    Map<String, Long> create(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestBody Write value) {
        validate(value);
        long id =
                db.queryForObject(
                        "insert into log_sources(project_id,instance_id,name,path,encoding,enabled,poll_interval_seconds) values(?,?,?,?,?,?,?) returning log_id",
                        Long.class,
                        projectId,
                        instanceId,
                        value.name().trim(),
                        value.path().trim(),
                        value.encoding(),
                        value.enabled(),
                        value.pollIntervalSeconds());
        return Map.of("log_id", id);
    }

    @PutMapping("/{logId}")
    void update(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("logId") long logId,
            @RequestBody Write value) {
        validate(value);
        if (db.update(
                        "update log_sources set name=?,path=?,encoding=?,enabled=?,poll_interval_seconds=? where project_id=? and instance_id=? and log_id=?",
                        value.name().trim(),
                        value.path().trim(),
                        value.encoding(),
                        value.enabled(),
                        value.pollIntervalSeconds(),
                        projectId,
                        instanceId,
                        logId)
                != 1) {
            throw new org.springframework.dao.EmptyResultDataAccessException(1);
        }
        logs.invalidate(logId);
    }

    @GetMapping("/{logId}/read")
    LogBuffer.View read(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("logId") long logId,
            @RequestParam(name = "cursor", required = false) String cursor,
            HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        if (cursor != null && cursor.length() > 100) {
            throw new IllegalArgumentException("INVALID_LOG_CURSOR");
        }
        var config =
                db.queryForMap(
                        """
            select l.*,i.agent_base_url,i.token_ciphertext,i.token_iv,i.enabled as instance_enabled,p.enabled as project_enabled
            from log_sources l join instances i using(project_id,instance_id) join projects p using(project_id)
            where l.project_id=? and l.instance_id=? and l.log_id=?
            """,
                        projectId,
                        instanceId,
                        logId);
        // 조회 시작 시 이력 기록. 커서·본문·토큰·로그 원문은 저장하지 않음
        if (cursor == null || cursor.isBlank()) {
            db.update(
                    "insert into audit_log(actor,action,entity_type,project_id,target_id) values(?,?,?,?,?)",
                    SecurityContextHolder.getContext().getAuthentication().getName(),
                    "READ",
                    "LOG_VIEW",
                    projectId,
                    projectId + "/" + instanceId + "/" + logId);
        }
        return logs.read(config, cursor);
    }

    private static void validate(Write v) {
        if (v == null
                || v.name() == null
                || v.name().trim().isEmpty()
                || v.name().length() > 120
                || v.path() == null
                || v.path().length() > 1000
                || v.path().startsWith("//")
                || v.path().chars().anyMatch(Character::isISOControl)
                || !(v.path().startsWith("/") || v.path().matches("^[A-Za-z]:[\\\\/].+"))
                || !List.of("UTF-8", "MS949", "EUC-KR")
                        .contains(v.encoding() == null ? "" : v.encoding())
                || v.enabled() == null
                || v.pollIntervalSeconds() == null
                || v.pollIntervalSeconds() < 5
                || v.pollIntervalSeconds() > 1800) {
            throw new IllegalArgumentException("INVALID_LOG_CONFIG");
        }
    }

    record Write(
            String name,
            String path,
            String encoding,
            Boolean enabled,
            Integer pollIntervalSeconds) {}
}
