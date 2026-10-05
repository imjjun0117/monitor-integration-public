package com.hermes.monitoring.center.check;

import com.hermes.monitoring.center.collection.AgentPayloadValidator;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 점검 작업 접수 후 결과 조회 및 제한 횟수 초과 시 시간 초과 처리
final class CheckPollingJob {
    interface Gateway {
        byte[] runChecks(String base, String token, String body) throws Exception;

        byte[] getResults(String base, String token, String jobId) throws Exception;
    }

    private final Gateway gateway;
    private final ObjectMapper json;
    private final long intervalMillis;
    private final int maxPolls;
    private final AgentPayloadValidator validator;

    CheckPollingJob(Gateway gateway, ObjectMapper json, long intervalMillis, int maxPolls) {
        this.gateway = gateway;
        this.json = json;
        this.intervalMillis = intervalMillis;
        this.maxPolls = maxPolls;
        this.validator = new AgentPayloadValidator();
    }

    // 점검 접수 후 작업 ID로 결과를 조회하고 횟수 초과 시 시간 초과 처리
    void run(
            String base,
            String token,
            String checkId,
            Consumer<JsonNode> onResult,
            Runnable onTimeout) throws Exception {

        // 실행할 점검 ID와 요청 주체를 전달하여 작업 접수
        String request = json.writeValueAsString(Map.of(
                "check_ids", List.of(checkId),
                "requested_by", "monitor-center"
        ));

        JsonNode accepted = json.readTree(gateway.runChecks(base, token, request));
        String jobId = accepted.path("job_id").asString();

        if (jobId.isBlank()) {
            throw new IllegalStateException("AGENT_JOB_INVALID");
        }

        // 제한된 횟수 안에서 요청한 점검의 완료 결과 조회
        for (int attempt = 0; attempt < maxPolls; attempt++) {
            JsonNode response = json.readTree(gateway.getResults(base, token, jobId));
            JsonNode results = response.isArray() ? response : response.path("results");

            for (JsonNode result : results) {
                if (checkId.equals(result.path("check_id").asString())) {
                    validator.validateCheckResult(result, checkId);
                    onResult.accept(result);

                    return;
                }
            }

            // 마지막 시도에서는 대기하지 않고 시간 초과 처리로 이동
            if (attempt + 1 < maxPolls && intervalMillis > 0L) {
                Thread.sleep(intervalMillis);
            }
        }

        onTimeout.run();
    }
}
