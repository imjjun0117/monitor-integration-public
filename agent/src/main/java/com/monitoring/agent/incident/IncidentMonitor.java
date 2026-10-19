package com.monitoring.agent.incident;

import com.monitoring.agent.dashboard.DashboardStatusCauseQuery;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

// 최신 상태를 주기적으로 판정하여 동일 항목의 장애 발생·복구 이력 유지
@Component
public class IncidentMonitor {
    private final JdbcTemplate db;
    private final DashboardStatusCauseQuery observations;
    private final ObjectMapper json;

    public IncidentMonitor(
            JdbcTemplate db, DashboardStatusCauseQuery observations, ObjectMapper json) {
        this.db = db;
        this.observations = observations;
        this.json = json;
    }

    @Scheduled(fixedDelay = 15_000L, initialDelay = 15_000L)
    @Transactional(timeout = 30)
    public void reconcile() {
        // 여러 Agent가 동시에 판정해도 발생·복구 이벤트를 한 번만 기록
        if (!Boolean.TRUE.equals(
                db.queryForObject(
                        "select pg_try_advisory_xact_lock(hashtext('monitor.incidents'))",
                        Boolean.class))) {
            return;
        }
        Map<String, Map<String, Object>> active = new HashMap<>();
        for (var row :
                db.queryForList(
                        """
                select
                    incident_id
                    ,project_id
                    ,source_key
                    ,severity
                    ,latest_observation::text
                from incidents
                where
                    closed_at is null
                for update
                """)) {
            active.put(row.get("project_id") + "/" + row.get("source_key"), row);
        }

        Set<String> present = new HashSet<>();
        for (var observation : observations.observations()) {
            String kind = text(observation, "kind");
            if (!List.of("COLLECTION", "METRIC", "CHECK", "CERTIFICATE").contains(kind)) {
                continue;
            }
            String source =
                    json.writeValueAsString(
                            List.of(
                                    kind,
                                    "CERTIFICATE".equals(kind)
                                            ? ""
                                            : text(observation, "instance_id"),
                                    "METRIC".equals(kind) ? text(observation, "metric_key") : "",
                                    text(observation, "subject_id")));
            String key = observation.get("project_id") + "/" + source;
            present.add(key);
            Map<String, Object> existing = active.get(key);
            String status = text(observation, "status");
            String payload = json.writeValueAsString(observation);

            if (List.of("WARN", "DOWN").contains(status)) {
                if (existing == null) {
                    open(source, observation, payload);
                } else {
                    long id = ((Number) existing.get("incident_id")).longValue();
                    String previous =
                            json.readTree(existing.get("latest_observation").toString())
                                    .path("status")
                                    .asString();
                    db.update(
                            """
                            update incidents
                            set last_detected_at = now()
                                ,severity = case when severity = 'DOWN' then severity else ? end
                                ,latest_observation = ?::jsonb
                            where
                                incident_id = ?
                            """,
                            status,
                            payload,
                            id);
                    if (!previous.equals(status)) {
                        event(id, "STATUS_CHANGED", "상태: " + status);
                    }
                }
            } else if (existing != null && "UP".equals(status)) {
                long id = ((Number) existing.get("incident_id")).longValue();
                db.update(
                        "update incidents set latest_observation = ?::jsonb where incident_id = ?",
                        payload,
                        id);
                close(id, "RECOVERED");
            } else if (existing != null) {
                // 미확인은 정상화가 아니므로 장애를 유지하고 최신 판정만 표시
                db.update(
                        "update incidents set latest_observation = ?::jsonb where incident_id = ?",
                        payload,
                        existing.get("incident_id"));
            }
        }

        for (var entry : active.entrySet()) {
            if (!present.contains(entry.getKey())) {
                close(
                        ((Number) entry.getValue().get("incident_id")).longValue(),
                        "MONITORING_STOPPED");
            }
        }
    }

    private void open(String source, Map<String, Object> observation, String payload) {
        Long id =
                db.queryForObject(
                        """
                insert into incidents(
                    project_id
                    ,instance_id
                    ,source_key
                    ,kind
                    ,metric_key
                    ,subject_id
                    ,subject_name
                    ,severity
                    ,first_observation
                    ,latest_observation)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
                returning incident_id
                """,
                        Long.class,
                        observation.get("project_id"),
                        observation.get("instance_id"),
                        source,
                        observation.get("kind"),
                        observation.get("metric_key"),
                        observation.get("subject_id"),
                        observation.get("subject_name"),
                        observation.get("status"),
                        payload,
                        payload);
        event(id, "OPENED", null);
    }

    private void close(long id, String state) {
        db.update(
                """
                update incidents
                set state = ?
                    ,closed_at = now()
                    ,version = version + 1
                where
                    incident_id = ?
                """,
                state,
                id);
        event(id, state, null);
    }

    private void event(long id, String type, String note) {
        db.update(
                """
                insert into incident_events(
                    incident_id
                    ,actor
                    ,event_type
                    ,note)
                values (?, 'SYSTEM', ?, ?)
                """,
                id,
                type,
                note);
    }

    private static String text(Map<String, Object> row, String key) {
        return row.get(key) == null ? "" : row.get(key).toString();
    }
}
