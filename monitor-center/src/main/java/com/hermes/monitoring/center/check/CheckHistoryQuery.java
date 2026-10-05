package com.hermes.monitoring.center.check;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 점검별 최근 응답시간 이력 조회
@Component
final class CheckHistoryQuery {
    private final JdbcTemplate db;

    CheckHistoryQuery(JdbcTemplate db) {
        this.db = db;
    }

    void attach(List<Map<String, Object>> items) {
        Map<CheckKey, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            grouped.put(key(item), new ArrayList<>());
        }
        if (grouped.isEmpty()) {
            return;
        }

        String placeholders = String.join(",", Collections.nCopies(grouped.size(), "(?,?,?)"));
        List<Object> arguments = new ArrayList<>();
        for (CheckKey key : grouped.keySet()) {
            arguments.add(key.projectId());
            arguments.add(key.instanceId());
            arguments.add(key.checkId());
        }
        List<Map<String, Object>> rows =
                db.queryForList(
                        """
            with ranked as (
              select s.project_id,s.instance_id,s.check_id,s.checked_at,s.duration_ms,
                s.status,s.result_code,
                row_number() over (
                  partition by s.project_id,s.instance_id,s.check_id
                  order by s.checked_at desc
                ) history_rank
              from check_result_samples s
              where s.checked_at>=now()-interval '24 hours'
                and (s.project_id,s.instance_id,s.check_id) in (%s)
            )
            select project_id,instance_id,check_id,checked_at,duration_ms,status,result_code
            from ranked where history_rank<=100
            order by project_id,instance_id,check_id,checked_at desc
            """
                                .formatted(placeholders),
                        arguments.toArray());
        for (Map<String, Object> row : rows) {
            List<Map<String, Object>> history = grouped.get(key(row));
            if (history != null) {
                history.add(historyValue(row));
            }
        }
        for (Map<String, Object> item : items) {
            item.put("history", grouped.get(key(item)));
        }
    }

    private Map<String, Object> historyValue(Map<String, Object> row) {
        Map<String, Object> value = new LinkedHashMap<>(row);
        value.remove("project_id");
        value.remove("instance_id");
        value.remove("check_id");
        return value;
    }

    private CheckKey key(Map<String, Object> row) {
        return new CheckKey(
                (String) row.get("project_id"),
                (String) row.get("instance_id"),
                (String) row.get("check_id"));
    }

    private record CheckKey(String projectId, String instanceId, String checkId) {}
}
