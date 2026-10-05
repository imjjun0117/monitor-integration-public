package com.monitoring.agent.project;

import com.monitoring.agent.web.ApiPage;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// 프로젝트 관리 요청 처리
@RestController
@RequestMapping("/api/v1/projects")
public final class ProjectController {
    private final ProjectQuery query;
    private final ProjectService service;

    ProjectController(ProjectQuery query, ProjectService service) {
        this.query = query;
        this.service = service;
    }

    @GetMapping
    ApiPage<Map<String, Object>> projects(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "sort", defaultValue = "project_id,asc") String sort,
            @RequestParam(name = "status", required = false) String status) {
        return query.projects(page, size, sort, status);
    }

    @PostMapping
    ResponseEntity<Void> create(@RequestBody Project value) {
        service.createProject(value);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PutMapping("/{projectId}")
    void update(@PathVariable("projectId") String projectId, @RequestBody Project value) {
        service.updateProject(projectId, value);
    }

    @DeleteMapping("/{projectId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disable(@PathVariable("projectId") String projectId) {
        service.disableProject(projectId);
    }

    @DeleteMapping("/{projectId}/permanent")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deletePermanently(@PathVariable("projectId") String projectId) {
        service.deleteProjectPermanently(projectId);
    }

    @GetMapping("/{projectId}/instances")
    ApiPage<Map<String, Object>> instances(
            @PathVariable("projectId") String projectId,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "sort", defaultValue = "instance_id,asc") String sort,
            @RequestParam(name = "status", required = false) String status) {
        return query.instances(projectId, page, size, sort, status);
    }

    @PostMapping("/{projectId}/instances")
    ResponseEntity<Void> createInstance(
            @PathVariable("projectId") String projectId, @RequestBody Instance value) {
        service.createInstance(projectId, value);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @DeleteMapping("/{projectId}/instances/{instanceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disableInstance(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId) {
        service.disableInstance(projectId, instanceId);
    }

    @DeleteMapping("/{projectId}/instances/{instanceId}/permanent")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteInstancePermanently(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId) {
        service.deleteInstancePermanently(projectId, instanceId);
    }

    record Project(String projectId, String displayName, Boolean enabled) {}

    record Instance(
            String instanceId,
            String displayName,
            String environment,
            String agentBaseUrl,
            String token,
            Boolean apiChecksEnabled,
            Integer pollIntervalSeconds,
            Boolean enabled) {}
}
