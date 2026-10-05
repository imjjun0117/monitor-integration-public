package com.monitoring.agent.check;

import com.monitoring.agent.security.ProjectAccess;
import com.monitoring.agent.project.QueryValidation;
import com.monitoring.agent.web.ApiPage;
import com.monitoring.agent.web.PageQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// 접근 가능한 프로젝트의 점검 목록 조회
@Component
final class CheckQuery {
    private static final Map<String, String> INTERNAL_SORTS =
            Map.of(
                    "check_id", "d.check_id",
                    "status", "status",
                    "checked_at", "r.checked_at");
    private static final Map<String, String> API_SORTS =
            Map.of(
                    "checked_at", "r.checked_at",
                    "status", "status",
                    "name", "d.name");
    private final JdbcTemplate db;
    private final CheckHistoryQuery histories;
    private final long externalIntervalSeconds;

    CheckQuery(JdbcTemplate db, CheckHistoryQuery histories) {
        this(db, histories, 86_400_000L);
    }

    @Autowired
    CheckQuery(
            JdbcTemplate db,
            CheckHistoryQuery histories,
            @Value("${hermes.check.external-interval-ms:86400000}") long externalIntervalMs) {
        this.db = db;
        this.histories = histories;
        this.externalIntervalSeconds = externalIntervalMs / 1000L;
    }

    ApiPage<Map<String, Object>> internalChecks(
            String projectId, String instanceId, int page, int size, String sort, String status) {
        return internalChecks(projectId, instanceId, page, size, sort, status, null);
    }

    ApiPage<Map<String, Object>> internalChecks(
            String projectId,
            String instanceId,
            int page,
            int size,
            String sort,
            String status,
            Boolean monitoringEnabled) {
        PageQuery pageQuery = PageQuery.of(page, size, sort, INTERNAL_SORTS);
        QueryValidation.status(status);
        String statusClause = status == null ? "" : " and coalesce(r.status,'UNKNOWN')=?";
        List<Object> arguments = new ArrayList<>(List.of(projectId, instanceId));
        if (status != null) {
            arguments.add(status);
        }
        if (monitoringEnabled != null) {
            arguments.add(monitoringEnabled);
        }
        String from =
                """
            from check_definitions d
            left join check_results_latest r using(project_id,instance_id,check_id)
            join instances i using(project_id,instance_id)
            join projects p using(project_id)
            where d.project_id=? and d.instance_id=? and d.category='INTERNAL' and d.enabled
            """
                        + statusClause
                        + (monitoringEnabled == null ? "" : " and d.monitoring_enabled=?");
        Long total = db.queryForObject("select count(*) " + from, Long.class, arguments.toArray());
        arguments.add(pageQuery.size());
        arguments.add(pageQuery.offset());
        List<Map<String, Object>> items =
                db.queryForList(
                        """
            select d.check_id,d.name,d.category,d.direction,d.project_id,d.instance_id,
              d.monitoring_enabled,d.automatic_enabled,coalesce(d.check_interval_seconds,300) check_interval_seconds,
              (i.enabled and p.enabled) automatic_allowed,
              coalesce(r.status,'UNKNOWN') status,r.duration_ms,r.result_code,r.message,
              r.checked_at,r.evidence_json::text evidence_json,d.service_profile_json::text service_profile_json
            """
                                + from
                                + " order by "
                                + pageQuery.orderBy()
                                + " limit ? offset ?",
                        arguments.toArray());
        CheckEvidence.attach(items);
        ServiceProfiles.attach(items);
        histories.attach(items);
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }

    ApiPage<Map<String, Object>> apiChecks(
            int page,
            int size,
            String sort,
            String project,
            String instance,
            String direction,
            String status,
            String name) {
        return apiChecks(page, size, sort, project, instance, direction, status, name, null);
    }

    ApiPage<Map<String, Object>> apiChecks(
            int page,
            int size,
            String sort,
            String project,
            String instance,
            String direction,
            String status,
            String name,
            Boolean monitoringEnabled) {
        PageQuery pageQuery = PageQuery.of(page, size, sort, API_SORTS);
        QueryValidation.status(status);
        validateDirection(direction);
        List<Object> arguments = new ArrayList<>();
        StringBuilder where =
                new StringBuilder(
                        " where d.category='API' and d.enabled and "
                                + ProjectAccess.sql("d.project_id"));
        addFilter(where, arguments, "d.project_id", project);
        addFilter(where, arguments, "d.instance_id", instance);
        addFilter(where, arguments, "d.direction", direction);
        if (monitoringEnabled != null) {
            where.append(" and d.monitoring_enabled=?");
            arguments.add(monitoringEnabled);
        }
        if (status != null) {
            where.append(" and coalesce(r.status,'UNKNOWN')=?");
            arguments.add(status);
        }
        if (name != null && !name.isBlank()) {
            where.append(" and lower(d.name) like ?");
            arguments.add("%" + name.toLowerCase(java.util.Locale.ROOT) + "%");
        }
        String from =
                """
            from check_definitions d
            left join check_results_latest r using(project_id,instance_id,check_id)
            join projects p using(project_id)
            join instances i using(project_id,instance_id)
            """
                        + where;
        Long total = db.queryForObject("select count(*) " + from, Long.class, arguments.toArray());
        arguments.add(pageQuery.size());
        arguments.add(pageQuery.offset());
        List<Map<String, Object>> items =
                db.queryForList(
                        """
            select d.project_id,d.instance_id,p.display_name project_name,
              i.display_name instance_name,d.check_id,d.name,d.category,d.direction,d.monitoring_enabled,
              d.automatic_enabled,coalesce(d.check_interval_seconds,
                case when d.direction='EXTERNAL' then %d else 300 end) check_interval_seconds,
              (i.enabled and p.enabled and i.api_checks_enabled) automatic_allowed,
              coalesce(r.status,'UNKNOWN') status,r.duration_ms,r.result_code,r.message,
              r.checked_at,r.evidence_json::text evidence_json,d.service_profile_json::text service_profile_json
            """
                                        .formatted(externalIntervalSeconds)
                                + from
                                + " order by "
                                + pageQuery.orderBy()
                                + " limit ? offset ?",
                        arguments.toArray());
        CheckEvidence.attach(items);
        ServiceProfiles.attach(items);
        histories.attach(items);
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }

    private void validateDirection(String direction) {
        if (direction != null
                && !direction.isBlank()
                && !List.of("INTERNAL", "EXTERNAL").contains(direction)) {
            throw new IllegalArgumentException("DIRECTION_INVALID");
        }
    }

    private void addFilter(
            StringBuilder where, List<Object> arguments, String column, String value) {
        if (value != null && !value.isBlank()) {
            where.append(" and ").append(column).append("=?");
            arguments.add(value);
        }
    }
}
