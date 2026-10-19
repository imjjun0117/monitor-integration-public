package com.monitoring.agent.incident;

import com.monitoring.agent.security.ProjectAccess;
import com.monitoring.agent.web.ApiPage;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// 프로젝트 범위 안의 장애와 제한된 시간 구간의 조사 자료 조회
@Component
public class IncidentQuery {
    private final JdbcTemplate db;
    private final ObjectMapper json;

    public IncidentQuery(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    public ApiPage<Map<String, Object>> list(String project, String state, int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new IllegalArgumentException("PAGE_INVALID");
        }
        String where = " where " + ProjectAccess.sql("i.project_id");
        List<Object> args = new ArrayList<>();
        if (project != null && !project.isBlank()) {
            where += " and i.project_id = ?";
            args.add(project);
        }
        if ("ACTIVE".equals(state)) {
            where += " and i.closed_at is null";
        } else if (state != null && !state.isBlank()) {
            if (!List.of("OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RECOVERED", "MONITORING_STOPPED")
                    .contains(state)) {
                throw new IllegalArgumentException("INCIDENT_STATE_INVALID");
            }
            where += " and i.state = ?";
            args.add(state);
        }
        Long total =
                db.queryForObject(
                        "select count(*) from incidents i" + where, Long.class, args.toArray());
        args.add(size);
        args.add((long) page * size);
        var rows =
                db.queryForList(
                        SELECT
                                + where
                                + " order by i.opened_at desc, i.incident_id desc limit ? offset ?",
                        args.toArray());
        rows.forEach(this::decode);
        return new ApiPage<>(rows, page, size, total == null ? 0 : total);
    }

    public Map<String, Object> get(long id, boolean lock) {
        var row =
                db.queryForMap(
                        SELECT
                                + " where i.incident_id = ? and "
                                + ProjectAccess.sql("i.project_id")
                                + (lock ? " for update of i" : ""),
                        id);
        decode(row);
        return row;
    }

    public List<Map<String, Object>> events(long id) {
        return db.queryForList(
                """
                select
                    event_id
                    ,occurred_at
                    ,actor
                    ,event_type
                    ,note
                    ,assignee
                from incident_events
                where
                    incident_id = ?
                order by event_id desc
                limit 100
                """,
                id);
    }

    public List<String> assignees(String project) {
        return db.queryForList(
                """
                select
                    u.username
                from app_users u
                join app_roles r on r.role_id = u.role
                where
                    u.enabled
                    and r.enabled
                    and (
                        r.base_role = 'ADMIN'
                        or (
                            r.base_role = 'OPERATOR'
                            and exists (
                                select
                                    1
                                from user_project_access a
                                where
                                    a.username = u.username
                                    and a.project_id = ?
                            )
                            and exists (
                                select
                                    1
                                from role_menu_permissions m
                                join app_menus n using(menu_id)
                                where
                                    m.role = u.role
                                    and m.menu_id = 'incidents'
                                    and m.can_write
                                    and n.enabled
                            )
                        )
                    )
                order by u.username
                """,
                String.class,
                project);
    }

    // 발생·복구 등 선택한 시각 전후 15분만 조회하며 응답 건수 제한
    public Map<String, Object> evidence(
            Map<String, Object> incident, Instant at, boolean logsAllowed, boolean changesAllowed) {
        Instant anchor = at == null ? ((Timestamp) incident.get("opened_at")).toInstant() : at;
        if (anchor.isAfter(Instant.now().plus(1, ChronoUnit.DAYS))
                || anchor.isBefore(Instant.parse("2000-01-01T00:00:00Z"))) {
            throw new IllegalArgumentException("INCIDENT_TIME_INVALID");
        }
        Timestamp from = Timestamp.from(anchor.minus(15, ChronoUnit.MINUTES));
        Timestamp to = Timestamp.from(anchor.plus(15, ChronoUnit.MINUTES));
        String project = incident.get("project_id").toString();
        Object instance = incident.get("instance_id");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("logs_allowed", logsAllowed);
        result.put("changes_allowed", changesAllowed);
        result.put(
                "resources",
                instance == null
                        ? List.of()
                        : db.queryForList(
                                """
                select
                    buckets.sampled_at
                    ,max(s.system_cpu_ratio) as system_cpu_ratio
                    ,max(case when s.heap_max_bytes > 0
                        then s.heap_used_bytes::numeric / s.heap_max_bytes end) as heap_ratio
                    ,max(case when s.physical_memory_total_bytes > 0
                        then s.physical_memory_used_bytes::numeric / s.physical_memory_total_bytes end) as memory_ratio
                    ,(select max(d.used_bytes::numeric / nullif(d.total_bytes, 0))
                        from disk_samples d
                        where
                            d.project_id = ?
                            and d.instance_id = ?
                            and d.sampled_at >= buckets.sampled_at
                            and d.sampled_at < buckets.sampled_at + interval '1 minute'
                            and d.sampled_at between ? and ?) as disk_ratio
                    ,(select max(d.active::numeric / nullif(d.max_size, 0))
                        from db_pool_samples d
                        where
                            d.project_id = ?
                            and d.instance_id = ?
                            and d.sampled_at >= buckets.sampled_at
                            and d.sampled_at < buckets.sampled_at + interval '1 minute'
                            and d.sampled_at between ? and ?) as db_pool_ratio
                from generate_series(date_trunc('minute', ?::timestamptz),
                    date_trunc('minute', ?::timestamptz), interval '1 minute') buckets(sampled_at)
                left join instance_metric_samples s on s.project_id = ?
                    and s.instance_id = ?
                    and s.sampled_at >= buckets.sampled_at
                    and s.sampled_at < buckets.sampled_at + interval '1 minute'
                    and s.sampled_at between ? and ?
                group by buckets.sampled_at
                order by buckets.sampled_at
                """,
                                project,
                                instance,
                                from,
                                to,
                                project,
                                instance,
                                from,
                                to,
                                from,
                                to,
                                project,
                                instance,
                                from,
                                to));
        result.put(
                "checks",
                db.queryForList(
                        """
                select
                    r.instance_id
                    ,r.check_id
                    ,d.name
                    ,d.category
                    ,r.checked_at
                    ,r.central_received_at
                    ,r.status
                    ,r.duration_ms
                    ,r.result_code
                from check_result_samples r
                left join check_definitions d using(project_id, instance_id, check_id)
                where
                    r.project_id = ?
                    and (?::varchar is null or r.instance_id = ?)
                    and r.central_received_at between ? and ?
                order by r.central_received_at desc, r.check_id
                limit 100
                """,
                        project,
                        instance,
                        instance,
                        from,
                        to));
        result.put(
                "logs",
                !logsAllowed || instance == null
                        ? List.of()
                        : db.queryForList(
                                """
                select
                    id
                    ,received_at
                    ,left(payload->>'text', 8192) as text
                from collector_events
                where
                    project_id = ?
                    and instance_id = ?
                    and kind = 'LOG'
                    and received_at between ? and ?
                order by id desc
                limit 20
                """,
                                project,
                                instance,
                                from,
                                to));
        result.put(
                "changes",
                !changesAllowed
                        ? List.of()
                        : db.queryForList(
                                """
                select
                    audit_id
                    ,occurred_at
                    ,actor
                    ,action
                    ,entity_type
                    ,target_id
                from audit_log
                where
                    project_id = ?
                    and entity_type <> 'REQUEST'
                    and outcome = 'SUCCESS'
                    and occurred_at between ? and ?
                order by occurred_at desc, audit_id desc
                limit 100
                """,
                                project,
                                from,
                                to));
        return result;
    }

    private void decode(Map<String, Object> row) {
        for (String key : List.of("first_observation", "latest_observation")) {
            row.put(key, json.readTree(row.get(key).toString()));
        }
    }

    private static final String SELECT =
            """
            select
                i.incident_id
                ,i.project_id
                ,p.display_name as project_name
                ,i.instance_id
                ,n.display_name as instance_name
                ,i.kind
                ,i.metric_key
                ,i.subject_id
                ,i.subject_name
                ,i.severity
                ,i.state
                ,i.opened_at
                ,i.last_detected_at
                ,i.closed_at
                ,i.assignee
                ,i.version
                ,i.first_observation::text
                ,i.latest_observation::text
            from incidents i
            join projects p using(project_id)
            left join instances n on n.project_id = i.project_id
                and n.instance_id = i.instance_id
            """;
}
