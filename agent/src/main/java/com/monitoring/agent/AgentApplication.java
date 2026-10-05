package com.monitoring.agent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Agent 모니터링 서버 실행
@SpringBootApplication
@EnableScheduling
public class AgentApplication {
    public static void main(String[] arguments) {
        SpringApplication.run(AgentApplication.class, arguments);
    }
}
