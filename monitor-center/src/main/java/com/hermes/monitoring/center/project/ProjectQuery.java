package com.hermes.monitoring.center.project;

import com.hermes.monitoring.center.security.ProjectAccess;
import com.hermes.monitoring.center.web.ApiPage;
import com.hermes.monitoring.center.web.PageQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 프로젝트 및 인스턴스 목록 조회
@Component
final class ProjectQuery {
    private static final Map<String, String> PROJECT_SORTS =
            Map.of(
                    "project_id", "project_id",
                    "display_name", "display_name",
                    "status", "status",
                    "updated_at", "updated_at");
    private static final Map<String, String> INSTANCE_SORTS =
            Map.of(
                    "instance_id", "instance_id",
                    "display_name", "display_name",
                    "status", "status",
                    "last_seen_at", "last_seen_at");
    private final JdbcTemplate db;

    ProjectQuery(JdbcTemplate db) {
        this.db = db;
    }

    ApiPage<Map<String, Object>> projects(int page, int size, String sort, String status) {
        PageQuery pageQuery = PageQuery.of(page, size, sort, PROJECT_SORTS);
        QueryValidation.status(status);
        String statusSql = status == null ? "" : " where status=?";
        String base =
                """
            select * from (
              select p.project_id,p.display_name,p.enabled,p.updated_at,
                count(i.instance_id) total_instances,
                count(i.instance_id) filter (where %1$s='UP') up_instances,
                max(i.last_seen_at) last_seen_at,
                case
                  when count(i.instance_id) filter (where %1$s='DOWN')>0 then 'DOWN'
                  when count(i.instance_id) filter (where %1$s='WARN')>0 then 'WARN'
                  when count(i.instance_id)=0 then 'UNKNOWN'
                  when count(i.instance_id) filter (where %1$s='UNKNOWN')>0 then 'UNKNOWN'
                  else 'UP'
                end status
              from projects p
              left join instances i on i.project_id=p.project_id and i.enabled
              left join instance_snapshot_latest l
                on l.project_id=i.project_id and l.instance_id=i.instance_id
              where __ACCESS__
              group by p.project_id
            ) project_rows
            """
                        .formatted(InstanceStatusSql.expression())
                        .replace("__ACCESS__", ProjectAccess.sql("p.project_id"));
        Object[] arguments =
                status == null
                        ? new Object[] {pageQuery.size(), pageQuery.offset()}
                        : new Object[] {status, pageQuery.size(), pageQuery.offset()};
        List<Map<String, Object>> items =
                db.queryForList(
                        base + statusSql + " order by " + pageQuery.orderBy() + " limit ? offset ?",
                        arguments);
        Long total =
                status == null
                        ? db.queryForObject("select count(*) from (" + base + ") x", Long.class)
                        : db.queryForObject(
                                "select count(*) from (" + base + ") x where status=?",
                                Long.class,
                                status);
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }

    ApiPage<Map<String, Object>> instances(
            String projectId, int page, int size, String sort, String status) {
        PageQuery pageQuery = PageQuery.of(page, size, sort, INSTANCE_SORTS);
        QueryValidation.status(status);
        String base =
                """
            select i.project_id,i.instance_id,i.display_name,i.environment,i.host_name,
              i.agent_base_url,i.api_checks_enabled,i.poll_interval_seconds,i.enabled,
              i.last_seen_at,l.system_cpu_ratio,
              case when l.heap_max_bytes>0
                then l.heap_used_bytes::numeric/l.heap_max_bytes end heap_ratio,
              (select concat(active,'/',max_size) from db_pool_latest d
                where d.project_id=i.project_id and d.instance_id=i.instance_id
                order by pool_id limit 1) db_pool,
              (select concat(count(*) filter(where r.status='UP'),'/',count(*))
                from check_definitions d
                left join check_results_latest r using(project_id,instance_id,check_id)
                where d.project_id=i.project_id and d.instance_id=i.instance_id
                  and d.category='INTERNAL' and d.enabled and d.monitoring_enabled) internal_checks,
              %s status
            from instances i
            left join instance_snapshot_latest l using(project_id,instance_id)
            where i.project_id=?
            """
                        .formatted(InstanceStatusSql.expression());
        List<Object> arguments = new ArrayList<>();
        arguments.add(projectId);
        if (status != null) {
            base = "select * from (" + base + ") instance_rows where status=?";
            arguments.add(status);
        }
        Long total =
                db.queryForObject(
                        "select count(*) from (" + base + ") x", Long.class, arguments.toArray());
        arguments.add(pageQuery.size());
        arguments.add(pageQuery.offset());
        List<Map<String, Object>> items =
                db.queryForList(
                        base + " order by " + pageQuery.orderBy() + " limit ? offset ?",
                        arguments.toArray());
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }
}
