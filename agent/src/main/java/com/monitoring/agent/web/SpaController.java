package com.monitoring.agent.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

// 화면 경로 요청을 SPA 진입 페이지로 연결
@Controller
public final class SpaController {
    @GetMapping({"/projects", "/projects/**", "/api-monitoring", "/certificates", "/settings/**"})
    String applicationRoute() {
        return "forward:/index.html";
    }
}
