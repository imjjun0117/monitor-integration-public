package com.monitoring.agent.resource;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 자원 및 DB 풀 조회 요청 처리
@RestController
@RequestMapping("/api/v1/projects/{projectId}/instances/{instanceId}")
public final class ResourceController {
    private final ResourceQuery query;

    ResourceController(ResourceQuery query) {
        this.query = query;
    }

    @GetMapping("/resources")
    Map<String, Object> resources(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestParam(name = "period", defaultValue = "24h") String period,
            @RequestParam(name = "max_points", defaultValue = "1000") int maxPoints) {
        return query.resources(projectId, instanceId, period, maxPoints);
    }

    @GetMapping("/db-pools")
    Map<String, Object> pools(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestParam(name = "period", defaultValue = "24h") String period,
            @RequestParam(name = "max_points", defaultValue = "1000") int maxPoints) {
        return query.pools(projectId, instanceId, period, maxPoints);
    }
}
