package com.hermes.monitoring.agent;

import java.util.List;
import java.util.Map;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

public class CheckDirectionModelTest {
    private static final String TOKEN = "01234567890123456789012345678901";

    @Test
    public void infoUsesEachCustomApiChecksDeclaredDirection() {
        MonitorRuntime runtime =
                new MonitorAgentBuilder()
                        .identity("direction-test", "local-01")
                        .token(TOKEN)
                        .check(
                                (MonitorCheck)
                                        check(
                                                "internal-api",
                                                CheckCategory.API,
                                                CheckDirection.INTERNAL))
                        .check(
                                (MonitorCheck)
                                        check(
                                                "external-api",
                                                CheckCategory.API,
                                                CheckDirection.EXTERNAL))
                        .check(
                                (MonitorCheck)
                                        check("internal-health", CheckCategory.INTERNAL, null))
                        .build();

        List<Map<String, Object>> definitions = definitions(runtime);
        assertEquals("INTERNAL", direction(definitions, "internal-api"));
        assertEquals("EXTERNAL", direction(definitions, "external-api"));
        assertNull(direction(definitions, "internal-health"));
        runtime.shutdown();
    }

    @Test
    public void invalidCategoryAndDirectionCombinationsFailAtRegistration() {
        assertInvalid(check("bad-internal", CheckCategory.INTERNAL, CheckDirection.EXTERNAL));
        assertInvalid(check("missing-api-direction", CheckCategory.API, null));
    }

    private void assertInvalid(DirectionalMonitorCheck check) {
        try {
            new MonitorAgentBuilder().check((MonitorCheck) check);
            fail("invalid check direction accepted: " + check.getId());
        } catch (IllegalArgumentException expected) {
            assertEquals("INVALID_CHECK_DIRECTION", expected.getMessage());
        }
    }

    private DirectionalMonitorCheck check(
            final String id, final CheckCategory category, final CheckDirection direction) {
        return new DirectionalMonitorCheck() {
            public String getId() {
                return id;
            }

            public String getName() {
                return id;
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

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> definitions(MonitorRuntime runtime) {
        return (List<Map<String, Object>>) runtime.info().get("checks");
    }

    private Object direction(List<Map<String, Object>> definitions, String id) {
        for (Map<String, Object> definition : definitions) {
            if (id.equals(definition.get("check_id"))) {
                return definition.get("direction");
            }
        }
        fail("missing definition " + id);
        return null;
    }
}
