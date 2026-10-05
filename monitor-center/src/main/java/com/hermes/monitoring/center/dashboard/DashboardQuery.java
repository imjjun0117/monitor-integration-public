package com.hermes.monitoring.center.dashboard;

import com.hermes.monitoring.center.security.ProjectAccess;
import com.hermes.monitoring.center.project.InstanceStatusSql;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 프로젝트 현황과 자원 추이 조회
@Component
final class DashboardQuery {
    private final JdbcTemplate db;
    private final DashboardStatusCauseQuery causes;

    DashboardQuery(JdbcTemplate db, DashboardStatusCauseQuery causes) {
        this.db = db;
        this.causes = causes;
    }

    Map<String, Object> dashboard() {
        return dashboard("24h");
    }

    Map<String, Object> dashboard(String period) {
        long seconds =
                com.hermes.monitoring.center.resource.ResourceQuery.duration(period).toSeconds();
        List<Map<String, Object>> projects =
                db.queryForList(
                        """
            select project_id,display_name,enabled
            from projects where enabled and __ACCESS__ order by project_id
            """
                                .replace("__ACCESS__", ProjectAccess.sql("projects.project_id")));
        List<Map<String, Object>> instances = instances();
        List<Map<String, Object>> statusCauses = causes.find(instances);
        for (Map<String, Object> instance : instances) {
            List<Map<String, Object>> activeStates = new java.util.ArrayList<>();
            activeStates.add(
                    Map.of(
                            "status",
                            instance.getOrDefault("collection_status", instance.get("status"))));
            statusCauses.stream()
                    .filter(
                            cause ->
                                    java.util.Objects.equals(
                                                    cause.get("project_id"),
                                                    instance.get("project_id"))
                                            && java.util.Objects.equals(
                                                    cause.get("instance_id"),
                                                    instance.get("instance_id")))
                    .forEach(activeStates::add);
            instance.put("status", worstStatus(activeStates));
        }
        Map<String, List<Map<String, Object>>> instancesByProject = new LinkedHashMap<>();
        for (Map<String, Object> instance : instances) {
            String projectId = (String) instance.get("project_id");
            instancesByProject
                    .computeIfAbsent(projectId, ignored -> new java.util.ArrayList<>())
                    .add(instance);
        }
        for (Map<String, Object> project : projects) {
            List<Map<String, Object>> projectInstances =
                    instancesByProject.getOrDefault(project.get("project_id"), List.of());
            project.put("instances", projectInstances);
            project.put("status", worstStatus(projectInstances));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("projects", projects);
        result.put(
                "failed_api_count",
                statusCauses.stream().filter(DashboardQuery::isFailedApi).count());
        result.put(
                "expiring_certificate_count",
                statusCauses.stream().filter(DashboardQuery::isCertificateExpiry).count());
        result.put("history", history(seconds));
        result.put("status_causes", statusCauses);
        result.put("service_balances", serviceBalances());
        return result;
    }

    private List<Map<String, Object>> serviceBalances() {
        List<Map<String, Object>> balances =
                db.queryForList(
                        """
            select d.project_id,p.display_name project_name,d.instance_id,i.display_name instance_name,
              d.check_id,d.name,d.category,d.direction,d.monitoring_enabled,d.automatic_enabled,
              coalesce(r.status,'UNKNOWN') status,r.duration_ms,r.result_code,r.message,r.checked_at,
              r.evidence_json::text evidence_json,d.service_profile_json::text service_profile_json
            from check_definitions d
            join projects p using(project_id)
            join instances i using(project_id,instance_id)
            left join check_results_latest r using(project_id,instance_id,check_id)
            where p.enabled and i.enabled and d.enabled and d.monitoring_enabled and __ACCESS__
              and d.category='API' and (
                (d.service_profile_json IS NOT NULL and d.service_profile_json <> 'null'::jsonb)
                or (d.service_profile_json IS NULL and (d.check_id='popbill'
                  or r.evidence_json->'details'->>'kind'='POPBILL_BALANCE')))
            order by d.project_id,d.instance_id,d.check_id
            """
                                .replace("__ACCESS__", ProjectAccess.sql("p.project_id")));
        com.hermes.monitoring.center.check.CheckEvidence.attach(balances);
        com.hermes.monitoring.center.check.ServiceProfiles.attach(balances);
        balances =
                balances.stream()
                        .filter(
                                check ->
                                        !(check.get("service_info") instanceof Map<?, ?> info
                                                && Boolean.FALSE.equals(info.get("dashboard"))))
                        .toList();
        balances.forEach(balance -> balance.put("history", List.of()));
        return balances;
    }

    private List<Map<String, Object>> instances() {
        return db.queryForList(
                """
            select i.project_id,i.instance_id,i.display_name,
              coalesce(i.host_name,'') host_name,l.system_cpu_ratio,
              case when l.heap_max_bytes>0
                then l.heap_used_bytes::numeric/l.heap_max_bytes end heap_ratio,
              case when l.physical_memory_total_bytes>0
                then l.physical_memory_used_bytes::numeric/l.physical_memory_total_bytes
                end physical_memory_ratio,
              (select max(case when d.total_bytes>0
                then d.used_bytes::numeric/d.total_bytes end) from disk_latest d
                where d.project_id=i.project_id and d.instance_id=i.instance_id) disk_ratio,
              coalesce((select concat(active,'/',max_size) from db_pool_latest d
                where d.project_id=i.project_id and d.instance_id=i.instance_id
                order by pool_id limit 1),'미지원') db_pool,
              (select concat(count(*) filter(where r.status='UP'),'/',count(*))
                from check_definitions d
                left join check_results_latest r using(project_id,instance_id,check_id)
                where d.project_id=i.project_id and d.instance_id=i.instance_id
                  and d.category='INTERNAL' and d.enabled and d.monitoring_enabled) internal_checks,
              i.last_seen_at,%s status,%s collection_status
            from instances i
            left join instance_snapshot_latest l using(project_id,instance_id)
            where i.enabled and __ACCESS__
            order by i.project_id,i.instance_id
            """
                        .formatted(
                                InstanceStatusSql.expression(),
                                InstanceStatusSql.collectionExpression())
                        .replace("__ACCESS__", ProjectAccess.sql("i.project_id")));
    }

    private Map<String, Object> history(long seconds) {
        String bucket = seconds <= 86400 ? "hour" : "day";
        Map<String, Object> history = new LinkedHashMap<>();
        history.put(
                "resources",
                db.queryForList(
                        """
            with resources as (
              select m.project_id,date_trunc('%s',m.sampled_at) sampled_at,
                max(m.system_cpu_ratio) system_cpu_ratio,
                max(case when m.heap_max_bytes>0
                  then m.heap_used_bytes::numeric/m.heap_max_bytes end) heap_ratio,
                max(case when m.physical_memory_total_bytes>0
                  then m.physical_memory_used_bytes::numeric/m.physical_memory_total_bytes end) physical_memory_ratio
              from instance_metric_samples m join instances i using(project_id,instance_id)
              where i.enabled and m.sampled_at >= now()-(? * interval '1 second')
              group by m.project_id,date_trunc('%s',m.sampled_at)
            ), disks as (
              select m.project_id,date_trunc('%s',m.sampled_at) sampled_at,
                max(case when m.total_bytes>0 then m.used_bytes::numeric/m.total_bytes end) disk_ratio
              from disk_samples m join instances i using(project_id,instance_id)
              where i.enabled and m.sampled_at >= now()-(? * interval '1 second')
              group by m.project_id,date_trunc('%s',m.sampled_at)
            )
            select p.project_id,b.sampled_at,r.system_cpu_ratio,r.heap_ratio,r.physical_memory_ratio,d.disk_ratio
            from projects p
            cross join generate_series(date_trunc('%s',now()-(? * interval '1 second')),
              date_trunc('%s',now()),interval '1 %s') b(sampled_at)
            left join resources r on r.project_id=p.project_id and r.sampled_at=b.sampled_at
            left join disks d on d.project_id=p.project_id and d.sampled_at=b.sampled_at
            where p.enabled and __ACCESS__
            order by p.project_id,b.sampled_at
            """
                                .formatted(bucket, bucket, bucket, bucket, bucket, bucket, bucket)
                                .replace("__ACCESS__", ProjectAccess.sql("p.project_id")),
                        seconds,
                        seconds,
                        seconds));
        history.put(
                "api",
                db.queryForList(
                        """
            select date_trunc('%s',checked_at) sampled_at,avg(duration_ms) duration_ms
            from check_result_samples r
            join check_definitions d using(project_id,instance_id,check_id)
            where d.category='API' and d.enabled and d.monitoring_enabled and __ACCESS__
              and checked_at >= now()-(? * interval '1 second')
            group by date_trunc('%s',checked_at) order by sampled_at
            """
                                .formatted(bucket, bucket)
                                .replace("__ACCESS__", ProjectAccess.sql("r.project_id")),
                        seconds));
        return history;
    }

    private static boolean isFailedApi(Map<String, Object> cause) {
        return "CHECK".equals(cause.get("kind"))
                && "API".equals(cause.get("check_category"))
                && "DOWN".equals(cause.get("status"));
    }

    private static boolean isCertificateExpiry(Map<String, Object> cause) {
        Object status = cause.get("status");
        return "CERTIFICATE".equals(cause.get("kind"))
                && "CERTIFICATE_DAYS".equals(cause.get("metric_key"))
                && cause.get("result_code") == null
                && ("WARN".equals(status) || "DOWN".equals(status));
    }

    private String worstStatus(List<Map<String, Object>> rows) {
        for (String candidate : List.of("DOWN", "WARN", "UNKNOWN", "UP")) {
            if (rows.stream().anyMatch(row -> candidate.equals(row.get("status")))) {
                return candidate;
            }
        }
        return "UNKNOWN";
    }
}
