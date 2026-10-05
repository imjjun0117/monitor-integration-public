package com.monitoring.collector.testapp;

import com.monitoring.collector.MonitorCollectorBuilder;
import com.monitoring.collector.MonitorRuntime;
import java.util.List;
import java.util.Map;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class TestConfigurerTest {
    @Test
    public void configuresDiskPoolAndBothCheckCategoriesForSuppliedIdentity() {
        MonitorCollectorBuilder builder = new MonitorCollectorBuilder();
        TestConfigurer.configureBuilder(
                builder, "test-token-with-at-least-32-bytes", "sample-b", "local-02");
        MonitorRuntime runtime = builder.build();
        Map<String, Object> info = runtime.info();
        Map<?, ?> identity = (Map<?, ?>) info.get("identity");
        List<?> definitions = (List<?>) info.get("checks");

        assertEquals("sample-b", identity.get("project_id"));
        assertEquals("local-02", identity.get("instance_id"));
        assertEquals(2, definitions.size());
        assertTrue(((List<?>) runtime.snapshot().get("db_pools")).size() > 0);
        Map<?, ?> system = (Map<?, ?>) runtime.snapshot().get("system");
        assertTrue(((List<?>) system.get("disks")).size() > 0);
        runtime.shutdown();
    }

    @Test(expected = IllegalStateException.class)
    public void refusesToStartWithoutExplicitCredentials() {
        TestConfigurer.required(null, "HERMES_TEST_AGENT_TOKEN");
    }
}
