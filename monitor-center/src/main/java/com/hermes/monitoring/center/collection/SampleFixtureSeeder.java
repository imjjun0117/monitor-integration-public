package com.hermes.monitoring.center.collection;

import com.hermes.monitoring.center.security.TokenCipher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 샘플 실행 설정 사용 시 테스트 프로젝트 등록
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = "hermes.sample-fixtures.enabled", havingValue = "true")
@Profile({"local", "dev", "e2e"})
public final class SampleFixtureSeeder implements ApplicationRunner {
    private final JdbcTemplate db;
    private final TokenCipher cipher;
    private final String token;

    SampleFixtureSeeder(
            JdbcTemplate db,
            TokenCipher cipher,
            @Value("${HERMES_SAMPLE_AGENT_TOKEN:}") String token) {
        this.db = db;
        this.cipher = cipher;
        this.token = token;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        run();
    }

    void run() {
        if (token == null || token.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("HERMES_SAMPLE_AGENT_TOKEN_REQUIRED");
        }
        project("sample-a", "샘플 A");
        project("sample-b", "샘플 B");
        instance("sample-a", "local-01", "샘플 A 1", 18081);
        instance("sample-a", "local-02", "샘플 A 2", 18082);
        instance("sample-b", "local-01", "샘플 B 1", 18083);
        instance("sample-b", "local-02", "샘플 B 2", 18084);
    }

    private void project(String projectId, String displayName) {
        db.update(
                """
            insert into projects(project_id,display_name)
            values(?,?) on conflict(project_id) do nothing
            """,
                projectId,
                displayName);
    }

    private void instance(String projectId, String instanceId, String displayName, int port) {
        TokenCipher.EncryptedToken encrypted = cipher.encrypt(token);
        int changed =
                db.update(
                        """
            insert into instances(
              project_id,instance_id,display_name,environment,agent_base_url,
              token_ciphertext,token_iv,api_checks_enabled,enabled)
            values(?,?,?,?,?,?,?,?,true)
            on conflict(project_id,instance_id) do update set
              display_name=excluded.display_name,token_ciphertext=excluded.token_ciphertext,
              token_iv=excluded.token_iv,api_checks_enabled=true,enabled=true,
              consecutive_failures=0,last_collection_error_code=null,updated_at=now()
            where instances.environment='local'
              and instances.agent_base_url=excluded.agent_base_url
            """,
                        projectId,
                        instanceId,
                        displayName,
                        "local",
                        "http://127.0.0.1:" + port,
                        encrypted.ciphertext(),
                        encrypted.iv(),
                        true);
        if (changed != 1) {
            throw new IllegalStateException("SAMPLE_FIXTURE_CONFLICT");
        }
    }
}
