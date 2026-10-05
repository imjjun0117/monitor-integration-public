package com.hermes.monitoring.center.project;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.hermes.monitoring.center.security.TokenCipher;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.mockito.InOrder;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

class ProjectPermanentDeletionTest {
    @Test
    void permanentlyDeletesOnlyTheExactInstanceInDependencyOrder() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Integer.class), eq("p1"), eq("i1"))).thenReturn(1);
        when(db.update(anyString(), eq("p1"), eq("i1"))).thenReturn(1);
        ProjectService service = new ProjectService(db, mock(TokenCipher.class));

        service.deleteInstancePermanently("p1", "i1");

        InOrder order = inOrder(db);
        order.verify(db).queryForObject(anyString(), eq(Integer.class), eq("p1"), eq("i1"));
        order.verify(db)
                .update(
                        "delete from check_result_samples where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from check_results_latest where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from check_definitions where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from db_pool_samples where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from db_pool_latest where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from disk_samples where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update("delete from disk_latest where project_id=? and instance_id=?", "p1", "i1");
        order.verify(db)
                .update(
                        "delete from instance_metric_samples where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from instance_snapshot_latest where project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update(
                        "delete from thresholds where scope='INSTANCE' and project_id=? and instance_id=?",
                        "p1",
                        "i1");
        order.verify(db)
                .update("delete from instances where project_id=? and instance_id=?", "p1", "i1");
    }

    @Test
    void missingInstanceFailsSafelyBeforeDeletes() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Integer.class), eq("p1"), eq("missing")))
                .thenThrow(new EmptyResultDataAccessException(1));
        ProjectService service = new ProjectService(db, mock(TokenCipher.class));
        assertThrows(
                EmptyResultDataAccessException.class,
                () -> service.deleteInstancePermanently("p1", "missing"));
    }

    @Test
    void permanentDeletionConstraintFailureIsDedicatedConflict() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Integer.class), eq("p1"), eq("i1"))).thenReturn(1);
        when(db.update(
                        "delete from thresholds where scope='INSTANCE' and project_id=? and instance_id=?",
                        "p1",
                        "i1"))
                .thenThrow(new DataIntegrityViolationException("secret constraint details"));
        ProjectService service = new ProjectService(db, mock(TokenCipher.class));

        DeleteConflictException error =
                assertThrows(
                        DeleteConflictException.class,
                        () -> service.deleteInstancePermanently("p1", "i1"));

        org.junit.jupiter.api.Assertions.assertEquals("DELETE_CONFLICT", error.getMessage());
    }
}
