package com.hermes.monitoring.center;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// 중앙 모니터링 서버 실행
@SpringBootApplication
@EnableScheduling
public class CenterApplication {
    public static void main(String[] arguments) {
        SpringApplication.run(CenterApplication.class, arguments);
    }
}
