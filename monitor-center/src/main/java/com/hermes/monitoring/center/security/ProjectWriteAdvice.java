package com.hermes.monitoring.center.security;

import java.lang.reflect.Type;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 쓰기 요청 본문의 프로젝트 접근 권한 검증
@ControllerAdvice
final class ProjectWriteAdvice extends RequestBodyAdviceAdapter {
    private final JdbcTemplate db;
    private final ObjectMapper json;

    ProjectWriteAdvice(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    @Override
    public boolean supports(
            MethodParameter parameter,
            Type type,
            Class<? extends HttpMessageConverter<?>> converter) {
        return parameter.getContainingClass().getName().startsWith("com.hermes.monitoring.center.");
    }

    @Override
    public Object afterBodyRead(
            Object body,
            HttpInputMessage input,
            MethodParameter parameter,
            Type type,
            Class<? extends HttpMessageConverter<?>> converter) {
        if (ProjectAccess.hasRole("ADMIN")) {
            return body;
        }
        JsonNode value = json.valueToTree(body);
        if (value.isArray()) {
            for (JsonNode item : value) {
                verify(item);
            }
        } else {
            verify(value);
        }
        return body;
    }

    private void verify(JsonNode value) {
        if (value.has("scope") && "GLOBAL".equals(value.path("scope").asString())) {
            throw new AccessDeniedException("FORBIDDEN");
        }
        JsonNode id = value.has("projectId") ? value.get("projectId") : value.get("project_id");
        if (id != null
                && !id.isNull()
                && !Boolean.TRUE.equals(
                        db.queryForObject(
                                "select exists(select 1 from user_project_access where username=? and project_id=?)",
                                Boolean.class,
                                SecurityContextHolder.getContext().getAuthentication().getName(),
                                id.asString()))) {
            throw new AccessDeniedException("FORBIDDEN");
        }
    }
}
