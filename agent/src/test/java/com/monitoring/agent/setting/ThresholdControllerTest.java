package com.monitoring.agent.setting;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class ThresholdControllerTest {
    @Test
    void scopedOverridesRequireValidProjectAndInstanceKeys() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        ThresholdController controller = new ThresholdController(db);

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.put(
                                java.util.List.of(
                                        new ThresholdController.Threshold(
                                                "PROJECT",
                                                "Bad Project",
                                                null,
                                                "SYSTEM_CPU",
                                                .8d,
                                                .9d))));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.put(
                                java.util.List.of(
                                        new ThresholdController.Threshold(
                                                "INSTANCE",
                                                "sample-a",
                                                "",
                                                "SYSTEM_CPU",
                                                .8d,
                                                .9d))));

        verifyNoInteractions(db);
    }
}
