package com.hermes.monitoring.center.project;

import org.springframework.dao.DataIntegrityViolationException;

// 삭제할 수 없는 대상의 충돌 정보 전달
public final class DeleteConflictException extends RuntimeException {
    public DeleteConflictException() {
        super("DELETE_CONFLICT");
    }

    DeleteConflictException(DataIntegrityViolationException cause) {
        super("DELETE_CONFLICT", cause);
    }
}
