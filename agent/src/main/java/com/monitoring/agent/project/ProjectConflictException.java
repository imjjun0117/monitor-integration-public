package com.monitoring.agent.project;

// 프로젝트 등록 및 수정 충돌 정보 전달
public final class ProjectConflictException extends RuntimeException {
    public ProjectConflictException(String code) {
        super(code);
    }
}
