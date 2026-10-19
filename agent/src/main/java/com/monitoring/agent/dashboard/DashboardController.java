package com.monitoring.agent.dashboard;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

// 종합 현황 조회 요청 처리
@RestController
@RequestMapping("/api/v1/dashboard")
public final class DashboardController {
    private final DashboardQuery query;

    DashboardController(DashboardQuery query) {
        this.query = query;
    }

    Map<String, Object> dashboard(String period) {
        return query.dashboard(period);
    }

    @GetMapping
    Map<String, Object> dashboard(
            @RequestParam(name = "period", defaultValue = "24h") String period,
            @RequestParam(name = "project", defaultValue = "") String project,
            @RequestParam(name = "instance", defaultValue = "") String instance) {
        return query.dashboard(period, project, instance);
    }
}
