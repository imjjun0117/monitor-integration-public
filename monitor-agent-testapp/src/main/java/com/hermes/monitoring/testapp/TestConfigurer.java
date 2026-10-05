package com.hermes.monitoring.testapp;

import com.hermes.monitoring.agent.CheckCategory;
import com.hermes.monitoring.agent.CheckContext;
import com.hermes.monitoring.agent.CheckDirection;
import com.hermes.monitoring.agent.CheckResult;
import com.hermes.monitoring.agent.DbPoolMetrics;
import com.hermes.monitoring.agent.DbPoolMetricsProvider;
import com.hermes.monitoring.agent.MonitorAgentBuilder;
import com.hermes.monitoring.agent.MonitorAgentConfigurer;
import com.hermes.monitoring.agent.MonitorCheck;
import java.io.File;
import javax.servlet.ServletContext;

// 테스트 웹앱의 에이전트 자원 및 점검 등록
public final class TestConfigurer implements MonitorAgentConfigurer {
    public void configure(MonitorAgentBuilder builder, ServletContext context) {
        configureBuilder(
                builder,
                required(System.getenv("HERMES_TEST_AGENT_TOKEN"), "HERMES_TEST_AGENT_TOKEN"),
                required(System.getenv("HERMES_TEST_PROJECT_ID"), "HERMES_TEST_PROJECT_ID"),
                required(System.getenv("HERMES_TEST_INSTANCE_ID"), "HERMES_TEST_INSTANCE_ID"));
    }

    static void configureBuilder(
            MonitorAgentBuilder builder, String token, String projectId, String instanceId) {
        builder.identity(projectId, instanceId)
                .token(token)
                .disk("tmp", "Temporary filesystem", new File(System.getProperty("java.io.tmpdir")))
                .dbPool(
                        new DbPoolMetricsProvider() {
                            public DbPoolMetrics collect() {
                                return new DbPoolMetrics(
                                        "main",
                                        "Sample Pool",
                                        Integer.valueOf(1),
                                        Integer.valueOf(2),
                                        Integer.valueOf(10),
                                        Integer.valueOf(1),
                                        Integer.valueOf(0),
                                        Long.valueOf(0),
                                        Long.valueOf(1));
                            }
                        })
                .check(check("internal-health", "Internal health", CheckCategory.INTERNAL, null))
                .check(
                        check(
                                "sample-api",
                                "Sample API",
                                CheckCategory.API,
                                CheckDirection.EXTERNAL));
    }

    static String required(String value, String name) {
        if (value == null || value.length() == 0) {
            throw new IllegalStateException(name + "_REQUIRED");
        }
        return value;
    }

    private static MonitorCheck check(
            final String id,
            final String name,
            final CheckCategory category,
            final CheckDirection direction) {
        return new MonitorCheck() {
            public String getId() {
                return id;
            }

            public String getName() {
                return name;
            }

            public CheckCategory getCategory() {
                return category;
            }

            public CheckDirection getDirection() {
                return direction;
            }

            public CheckResult execute(CheckContext context) {
                return new CheckResult(id, "UP", 1L, "ok");
            }
        };
    }
}
