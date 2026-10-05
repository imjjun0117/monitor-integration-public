package com.monitoring.agent.project;

import com.monitoring.agent.security.TokenCipher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// 프로젝트·인스턴스 등록·수정·삭제 처리
@Component
class ProjectService {
    private final JdbcTemplate db;
    private final TokenCipher cipher;

    ProjectService(JdbcTemplate db, TokenCipher cipher) {
        this.db = db;
        this.cipher = cipher;
    }

    void createProject(ProjectController.Project value) {
        ProjectValidator.validateProject(value, value == null ? null : value.projectId());
        try {
            db.update(
                    "insert into projects(project_id,display_name,enabled) values(?,?,?)",
                    value.projectId(),
                    value.displayName(),
                    value.enabled());
        } catch (DataIntegrityViolationException error) {
            throw new ProjectConflictException("PROJECT_ALREADY_EXISTS");
        }
    }

    void updateProject(String projectId, ProjectController.Project value) {
        ProjectValidator.validateProject(value, projectId);
        db.update(
                "update projects set display_name=?,enabled=?,updated_at=now() where project_id=?",
                value.displayName(),
                value.enabled(),
                projectId);
    }

    void disableProject(String projectId) {
        db.update(
                "update projects set enabled=false,updated_at=now() where project_id=?", projectId);
    }

    void createInstance(String projectId, ProjectController.Instance value) {
        ProjectValidator.id(projectId);
        ProjectValidator.validateInstance(value);
        final Boolean parentEnabled;
        try {
            parentEnabled =
                    db.queryForObject(
                            "select enabled from projects where project_id=?",
                            Boolean.class,
                            projectId);
        } catch (EmptyResultDataAccessException error) {
            throw new ProjectNotFoundException();
        }
        if (!Boolean.TRUE.equals(parentEnabled)) {
            throw new ProjectNotFoundException();
        }
        if (count(
                        "select count(*) from instances where project_id=? and instance_id=?",
                        projectId,
                        value.instanceId())
                > 0) {
            throw new ProjectConflictException("INSTANCE_ALREADY_EXISTS");
        }
        if (count("select count(*) from instances where agent_base_url=?", value.agentBaseUrl())
                > 0) {
            throw new ProjectConflictException("AGENT_URL_ALREADY_EXISTS");
        }
        TokenCipher.EncryptedToken encrypted = cipher.encrypt(value.token());
        try {
            db.update(
                    """
            insert into instances(
              project_id,instance_id,display_name,environment,agent_base_url,
              token_ciphertext,token_iv,api_checks_enabled,poll_interval_seconds,enabled)
            values(?,?,?,?,?,?,?,?,?,?)
            """,
                    projectId,
                    value.instanceId(),
                    value.displayName(),
                    value.environment(),
                    value.agentBaseUrl(),
                    encrypted.ciphertext(),
                    encrypted.iv(),
                    value.apiChecksEnabled(),
                    value.pollIntervalSeconds(),
                    value.enabled());
        } catch (DataIntegrityViolationException error) {
            if (count("select count(*) from instances where agent_base_url=?", value.agentBaseUrl())
                    > 0) {
                throw new ProjectConflictException("AGENT_URL_ALREADY_EXISTS");
            }
            throw new ProjectConflictException("INSTANCE_ALREADY_EXISTS");
        }
    }

    private int count(String sql, Object... arguments) {
        Integer result = db.queryForObject(sql, Integer.class, arguments);
        return result == null ? 0 : result;
    }

    void disableInstance(String projectId, String instanceId) {
        db.update(
                """
            update instances set enabled=false,updated_at=now()
            where project_id=? and instance_id=?
            """,
                projectId,
                instanceId);
    }

    @Transactional
    void deleteInstancePermanently(String projectId, String instanceId) {
        try {
            ProjectValidator.id(projectId);
            ProjectValidator.id(instanceId);
            db.queryForObject(
                    "select 1 from instances where project_id=? and instance_id=?",
                    Integer.class,
                    projectId,
                    instanceId);
            for (String table :
                    new String[] {
                        "check_result_samples",
                        "check_results_latest",
                        "check_definitions",
                        "db_pool_samples",
                        "db_pool_latest",
                        "disk_samples",
                        "disk_latest",
                        "instance_metric_samples",
                        "instance_snapshot_latest"
                    }) {
                db.update(
                        "delete from " + table + " where project_id=? and instance_id=?",
                        projectId,
                        instanceId);
            }
            db.update(
                    "delete from thresholds where scope='INSTANCE' and project_id=? and instance_id=?",
                    projectId,
                    instanceId);
            if (db.update(
                            "delete from instances where project_id=? and instance_id=?",
                            projectId,
                            instanceId)
                    != 1) {
                throw new org.springframework.dao.EmptyResultDataAccessException(1);
            }
        } catch (DataIntegrityViolationException error) {
            throw new DeleteConflictException(error);
        }
    }

    @Transactional
    void deleteProjectPermanently(String projectId) {
        try {
            ProjectValidator.id(projectId);
            db.queryForObject(
                    "select 1 from projects where project_id=?", Integer.class, projectId);
            for (String table :
                    new String[] {
                        "check_result_samples",
                        "check_results_latest",
                        "check_definitions",
                        "db_pool_samples",
                        "db_pool_latest",
                        "disk_samples",
                        "disk_latest",
                        "instance_metric_samples",
                        "instance_snapshot_latest"
                    }) {
                db.update("delete from " + table + " where project_id=?", projectId);
            }
            db.update(
                    "delete from certificate_latest where certificate_target_id in (select certificate_target_id from certificate_targets where project_id=?)",
                    projectId);
            db.update("delete from certificate_targets where project_id=?", projectId);
            db.update(
                    "delete from thresholds where project_id=? and scope in ('INSTANCE','PROJECT')",
                    projectId);
            db.update("delete from instances where project_id=?", projectId);
            if (db.update("delete from projects where project_id=?", projectId) != 1) {
                throw new org.springframework.dao.EmptyResultDataAccessException(1);
            }
        } catch (DataIntegrityViolationException error) {
            throw new DeleteConflictException(error);
        }
    }
}
