package com.monitoring.agent.web;

import com.monitoring.agent.project.ProjectConflictException;
import com.monitoring.agent.project.ProjectNotFoundException;
import com.monitoring.agent.project.DeleteConflictException;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// API 예외를 공통 오류 응답으로 변환
@RestControllerAdvice
public final class ApiExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Map<String, String>> invalid(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(Map.of("code", safeCode(error, "INVALID_REQUEST")));
    }

    @ExceptionHandler(EmptyResultDataAccessException.class)
    ResponseEntity<Map<String, String>> missing() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("code", "NOT_FOUND"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, String>> deleteConflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("code", "CONFLICT"));
    }

    @ExceptionHandler(DeleteConflictException.class)
    ResponseEntity<Map<String, String>> deleteConflict(DeleteConflictException error) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("code", "DELETE_CONFLICT"));
    }

    @ExceptionHandler(ProjectConflictException.class)
    ResponseEntity<Map<String, String>> createConflict(ProjectConflictException error) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("code", safeCode(error, "INSTANCE_ALREADY_EXISTS")));
    }

    @ExceptionHandler(ProjectNotFoundException.class)
    ResponseEntity<Map<String, String>> projectMissing() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("code", "PROJECT_NOT_FOUND"));
    }

    private String safeCode(Exception error, String fallback) {
        String message = error.getMessage();
        return message != null && message.matches("[A-Z_]{3,40}") ? message : fallback;
    }
}
