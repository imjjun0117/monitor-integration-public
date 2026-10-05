package com.hermes.monitoring.center.project;

// 존재하지 않는 프로젝트 요청 정보 전달
public final class ProjectNotFoundException extends RuntimeException {
    public ProjectNotFoundException() {
        super("PROJECT_NOT_FOUND");
    }
}
