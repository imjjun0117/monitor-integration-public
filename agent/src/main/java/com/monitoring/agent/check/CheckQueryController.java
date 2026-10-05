package com.monitoring.agent.check;

import com.monitoring.agent.web.ApiPage;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 점검 목록 및 결과 조회 요청 처리
@RestController
@RequestMapping("/api/v1")
public final class CheckQueryController {
    private final CheckQuery query;

    CheckQueryController(CheckQuery query) {
        this.query = query;
    }

    @GetMapping("/projects/{projectId}/instances/{instanceId}/internal-checks")
    ApiPage<Map<String, Object>> internalChecks(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "sort", defaultValue = "check_id,asc") String sort,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "monitoringEnabled", required = false) Boolean monitoringEnabled) {
        return query.internalChecks(
                projectId, instanceId, page, size, sort, status, monitoringEnabled);
    }

    @GetMapping("/api-checks")
    ApiPage<Map<String, Object>> apiChecks(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "sort", defaultValue = "checked_at,desc") String sort,
            @RequestParam(name = "project", required = false) String project,
            @RequestParam(name = "instance", required = false) String instance,
            @RequestParam(name = "direction", required = false) String direction,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "name", required = false) String name,
            @RequestParam(name = "monitoringEnabled", required = false) Boolean monitoringEnabled) {
        return query.apiChecks(
                page, size, sort, project, instance, direction, status, name, monitoringEnabled);
    }
}
