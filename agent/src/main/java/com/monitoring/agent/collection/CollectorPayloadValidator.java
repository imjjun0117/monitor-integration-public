package com.monitoring.agent.collection;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.InputStream;
import java.util.Set;

// Collector 응답 형식과 프로젝트 식별 정보 검증
public final class CollectorPayloadValidator {
    private final ObjectMapper json = new ObjectMapper();
    private final JsonSchema infoSchema;
    private final JsonSchema snapshotSchema;
    private final JsonSchema checkResultSchema;

    public CollectorPayloadValidator() {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        infoSchema = load(factory, "contracts/agent-info.schema.json");
        snapshotSchema = load(factory, "contracts/agent-snapshot.schema.json");
        checkResultSchema = load(factory, "contracts/check-result.schema.json");
    }

    public void validateInfo(byte[] body, String projectId, String instanceId) {
        JsonNode info = validate(infoSchema, body, projectId, instanceId);
        validateCheckDirections(info.path("checks"));
    }

    public void validateSnapshot(byte[] body, String projectId, String instanceId) {
        validate(snapshotSchema, body, projectId, instanceId);
    }

    public void validateCheckResult(tools.jackson.databind.JsonNode result, String checkId) {
        try {
            JsonNode node = json.readTree(result.toString());
            Set<ValidationMessage> errors = checkResultSchema.validate(node);
            if (!errors.isEmpty()) {
                throw new AgentPayloadException("SCHEMA_ERROR");
            }
            if (!checkId.equals(node.path("check_id").asText())) {
                throw new AgentPayloadException("CHECK_ID_MISMATCH");
            }
        } catch (AgentPayloadException error) {
            throw error;
        } catch (Exception error) {
            throw new AgentPayloadException("SCHEMA_ERROR");
        }
    }

    private JsonNode validate(JsonSchema schema, byte[] body, String projectId, String instanceId) {
        try {
            JsonNode node = json.readTree(body);
            Set<ValidationMessage> errors = schema.validate(node);
            if (!errors.isEmpty()) {
                throw new AgentPayloadException("SCHEMA_ERROR");
            }
            JsonNode identity = node.path("identity");
            if (!projectId.equals(identity.path("project_id").asText())
                    || !instanceId.equals(identity.path("instance_id").asText())) {
                throw new AgentPayloadException("IDENTITY_MISMATCH");
            }
            return node;
        } catch (AgentPayloadException error) {
            throw error;
        } catch (Exception error) {
            throw new AgentPayloadException("SCHEMA_ERROR");
        }
    }

    private void validateCheckDirections(JsonNode checks) {
        for (JsonNode check : checks) {
            String category = check.path("category").asText();
            JsonNode direction = check.get("direction");
            boolean internal =
                    "INTERNAL".equals(category) && direction != null && direction.isNull();
            boolean api =
                    "API".equals(category)
                            && direction != null
                            && direction.isTextual()
                            && ("INTERNAL".equals(direction.asText())
                                    || "EXTERNAL".equals(direction.asText()));
            if (!internal && !api) {
                throw new AgentPayloadException("CHECK_DIRECTION_INVALID");
            }
        }
    }

    private JsonSchema load(JsonSchemaFactory factory, String resource) {
        InputStream input =
                Thread.currentThread().getContextClassLoader().getResourceAsStream(resource);
        if (input == null) {
            throw new IllegalStateException("CONTRACT_MISSING");
        }
        try {
            return factory.getSchema(input);
        } finally {
            try {
                input.close();
            } catch (Exception ignored) {
                // 이미 읽은 클래스패스 자원의 닫기 오류는 처리 결과에 영향이 없어 무시
            }
        }
    }
}
