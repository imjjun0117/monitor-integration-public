package com.hermes.monitoring.center.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.hermes.monitoring.center.project.DeleteConflictException;
import org.junit.jupiter.api.Test;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void unrelatedDataIntegrityViolationIsNotLabeledDeleteConflict() {
        var response = handler.deleteConflict();

        assertEquals(409, response.getStatusCode().value());
        assertEquals("CONFLICT", response.getBody().get("code"));
    }

    @Test
    void dedicatedDeleteConflictIsLabeledDeleteConflict() {
        var response = handler.deleteConflict(new DeleteConflictException());

        assertEquals(409, response.getStatusCode().value());
        assertEquals("DELETE_CONFLICT", response.getBody().get("code"));
    }
}
