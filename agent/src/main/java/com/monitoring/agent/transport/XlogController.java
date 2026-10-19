package com.monitoring.agent.transport;

import com.monitoring.agent.security.ProjectAccess;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

// 대상 WAS를 호출하지 않고 권한 내 중앙 요청 기록 조회
@RestController
public final class XlogController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final CollectorTransportHub transport;

    public XlogController(JdbcTemplate db, ObjectMapper json, CollectorTransportHub transport) {
        this.db = db;
        this.json = json;
        this.transport = transport;
    }

    @GetMapping("/api/v1/xlog")
    public Map<String, Object> read(
            @RequestParam(defaultValue = "", name = "project") String project,
            @RequestParam(defaultValue = "", name = "instance") String instance,
            @RequestParam(defaultValue = "60", name = "minutes") int minutes,
            @RequestParam(defaultValue = "", name = "path") String path,
            @RequestParam(defaultValue = "false", name = "errorsOnly") boolean errorsOnly,
            @RequestParam(defaultValue = "0", name = "beforeId") long beforeId) {
        if (minutes < 5 || minutes > 1440 || path.length() > 200 || beforeId < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_XLOG_FILTER");
        }
        String filter =
                """
                from collector_events e
                join projects p on p.project_id = e.project_id
                join instances i on i.project_id = e.project_id and i.instance_id = e.instance_id
                where e.kind = 'XLOG'
                    and __ACCESS__
                    and (? = '' or e.project_id = ?)
                    and (? = '' or e.instance_id = ?)
                    and (e.payload->>'started_at')::bigint >=
                        (extract(epoch from now()) * 1000)::bigint - (?::bigint * 60000)
                    and strpos(e.payload->>'path', ?) > 0
                    and (not ? or (e.payload->>'status')::int >= 400)
                """
                        .replace("__ACCESS__", ProjectAccess.sql("e.project_id"));
        Object[] arguments = {project, project, instance, instance, minutes, path, errorsOnly};

        Map<String, Object> summary =
                db.queryForMap(
                        """
                select count(*) as count
                    ,count(*) filter (where (e.payload->>'status')::int >= 400) as errors
                    ,coalesce(avg((e.payload->>'duration_ms')::bigint), 0) as average_ms
                    ,coalesce(percentile_cont(0.95) within group (
                        order by (e.payload->>'duration_ms')::bigint), 0) as p95_ms
                """
                                + filter,
                        arguments);
        java.util.ArrayList<Object> pageArguments = new java.util.ArrayList<>(List.of(arguments));
        pageArguments.add(beforeId);
        pageArguments.add(beforeId);
        List<Map<String, Object>> items =
                db.query(
                        """
                select e.id,e.project_id,e.instance_id,p.display_name as project_name
                    ,i.display_name as instance_name,e.received_at,e.payload::text
                """
                                + filter
                                + " and (? = 0 or e.id < ?) order by e.id desc limit 1000",
                        (rs, index) ->
                                Map.of(
                                        "id",
                                        rs.getLong("id"),
                                        "project_id",
                                        rs.getString("project_id"),
                                        "instance_id",
                                        rs.getString("instance_id"),
                                        "project_name",
                                        rs.getString("project_name"),
                                        "instance_name",
                                        rs.getString("instance_name"),
                                        "received_at",
                                        rs.getTimestamp("received_at").toInstant().toString(),
                                        "payload",
                                        json.readTree(rs.getString("payload"))),
                        pageArguments.toArray());
        Long enabled =
                db.queryForObject(
                        """
                select count(*) from projects p
                where p.enabled and p.xlog_enabled and __ACCESS__
                    and (? = '' or p.project_id = ?)
                """
                                .replace("__ACCESS__", ProjectAccess.sql("p.project_id")),
                        Long.class,
                        project,
                        project);
        List<Map<String, Object>> eligible =
                db.queryForList(
                        """
                select i.project_id,i.instance_id
                from instances i join projects p using(project_id)
                where i.enabled and p.enabled and p.xlog_enabled
                    and i.transport_mode = 'WSS' and __ACCESS__
                    and (? = '' or i.project_id = ?)
                    and (? = '' or i.instance_id = ?)
                """
                                .replace("__ACCESS__", ProjectAccess.sql("i.project_id")),
                        project,
                        project,
                        instance,
                        instance);
        long connected =
                eligible.stream()
                        .filter(
                                row ->
                                        transport.isConnected(
                                                row.get("project_id").toString(),
                                                row.get("instance_id").toString()))
                        .count();
        return Map.of(
                "items",
                items,
                "summary",
                summary,
                "enabled_projects",
                enabled == null ? 0 : enabled,
                "eligible_instances",
                eligible.size(),
                "connected_instances",
                connected);
    }
}
