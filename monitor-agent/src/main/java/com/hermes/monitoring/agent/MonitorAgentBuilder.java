package com.hermes.monitoring.agent;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.nio.charset.Charset;

// 프로젝트 식별 정보·자원·점검 설정으로 에이전트 생성
public final class MonitorAgentBuilder {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private String projectId;
    private String instanceId;
    private String token;
    private final List<MonitorCheck> checks = new ArrayList<MonitorCheck>();
    private final List<DiskTarget> disks = new ArrayList<DiskTarget>();
    private final List<DbPoolMetricsProvider> dbPools = new ArrayList<DbPoolMetricsProvider>();

    // 프로젝트 ID와 인스턴스 ID 설정
    public MonitorAgentBuilder identity(String project, String instance) {
        projectId = project;
        instanceId = instance;
        return this;
    }

    // 에이전트 요청 인증 토큰 설정
    public MonitorAgentBuilder token(String value) {
        token = value;
        return this;
    }

    // 프로젝트별 점검 등록
    public MonitorAgentBuilder check(MonitorCheck value) {
        if (value == null) {
            throw new IllegalArgumentException("CHECK_REQUIRED");
        }
        CheckDirections.directionOf(value);
        checks.add(value);
        return this;
    }

    // 용량을 확인할 디스크 경로 등록
    public MonitorAgentBuilder disk(File path) {
        return disk(path.getName(), path.getPath(), path);
    }

    // 용량을 확인할 디스크 경로 등록
    public MonitorAgentBuilder disk(String pathId, String display, File path) {
        disks.add(new DiskTarget(pathId, display, path));
        return this;
    }

    // 지표를 수집할 DB 커넥션 풀 등록
    public MonitorAgentBuilder dbPool(DbPoolMetricsProvider provider) {
        if (provider != null) {
            dbPools.add(provider);
        }
        return this;
    }

    // 식별 정보와 토큰 검증 후 에이전트 생성
    public MonitorRuntime build() {
        if (!valid(projectId) || !valid(instanceId)) {
            throw new IllegalStateException("INVALID_IDENTITY");
        }
        if (token == null || token.getBytes(UTF8).length < 32) {
            throw new IllegalStateException("TOKEN_TOO_SHORT");
        }
        return new MonitorRuntime(projectId, instanceId, token, checks, disks, dbPools);
    }

    private boolean valid(String value) {
        return value != null && value.matches("[a-z0-9][a-z0-9._-]{1,63}");
    }

    static final class DiskTarget {
        final String id;
        final String display;
        final File path;

        DiskTarget(String id, String display, File path) {
            this.id = id;
            this.display = display;
            this.path = path;
        }
    }
}
