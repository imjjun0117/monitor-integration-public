package com.hermes.monitoring.agent;

import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.lang.management.RuntimeMXBean;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// 에이전트 정보·자원 수집 및 점검 실행 관리
public final class MonitorRuntime {
    private final String projectId;
    private final String instanceId;
    private final String token;
    private final List<MonitorCheck> checks;
    private final List<MonitorAgentBuilder.DiskTarget> disks;
    private final List<DbPoolMetricsProvider> dbPools;
    private final SnapshotSources snapshotSources;
    private final BoundedCheckExecutor executor = new BoundedCheckExecutor(2, 20);

    MonitorRuntime(
            String projectId,
            String instanceId,
            String token,
            List<MonitorCheck> checks,
            List<MonitorAgentBuilder.DiskTarget> disks,
            List<DbPoolMetricsProvider> dbPools) {
        this(projectId, instanceId, token, checks, disks, dbPools, null);
    }

    MonitorRuntime(
            String projectId,
            String instanceId,
            String token,
            List<MonitorCheck> checks,
            List<MonitorAgentBuilder.DiskTarget> disks,
            List<DbPoolMetricsProvider> dbPools,
            SnapshotSources snapshotSources) {
        this.projectId = projectId;
        this.instanceId = instanceId;
        this.token = token;
        this.checks = new ArrayList<MonitorCheck>(checks);
        this.disks = new ArrayList<MonitorAgentBuilder.DiskTarget>(disks);
        this.dbPools = new ArrayList<DbPoolMetricsProvider>(dbPools);
        this.snapshotSources = snapshotSources == null ? defaultSnapshotSources() : snapshotSources;
    }

    // 프로젝트 식별 정보·호스트·수집 기능·점검 목록 반환
    public Map<String, Object> info() {
        Map<String, Object> value = base();
        value.put("agent_version", "0.1.0");
        Map<String, Object> attributes = new LinkedHashMap<String, Object>();
        attributes.put("display_name", instanceId);
        attributes.put("environment", System.getProperty("monitor.environment", "unknown"));
        attributes.put("host_name", hostName());
        attributes.put("context_path", System.getProperty("monitor.context-path", ""));
        value.put("attributes", attributes);
        value.put("capabilities", capabilities());
        List<Map<String, Object>> definitions = new ArrayList<Map<String, Object>>();
        for (MonitorCheck check : checks) {
            Map<String, Object> definition = new LinkedHashMap<String, Object>();
            definition.put("check_id", check.getId());
            definition.put("name", check.getName());
            definition.put("category", check.getCategory().name());
            CheckDirection direction = CheckDirections.directionOf(check);
            definition.put("direction", direction == null ? null : direction.name());
            definitions.add(definition);
        }
        value.put("checks", definitions);
        return value;
    }

    // JVM·시스템·디스크·DB 풀 지표 및 최근 점검 결과 반환
    public Map<String, Object> snapshot() {
        Map<String, Object> value = base();
        List<String> errors = new ArrayList<String>();
        value.put("jvm", collectJvm(errors));
        value.put("system", collectSystem(errors));
        value.put("db_pools", collectDbPools(errors));
        value.put("recent_checks", executor.results());
        value.put("partial", Boolean.valueOf(!errors.isEmpty()));
        value.put("collection_errors", errors);
        return value;
    }

    public boolean isAuthorized(String supplied) {
        return TokenVerifier.matches(token, supplied);
    }

    public String runCheck(String id) {
        CheckRun run = startChecks(Collections.singletonList(id));
        return run.accepted_check_ids.isEmpty() ? run.rejected.get(0).reason : "ACCEPTED";
    }

    // 접수한 점검의 실행 결과 조회
    public Collection<CheckResult> results() {
        return executor.results();
    }

    // 점검 실행 접수 및 작업 ID 반환
    public CheckRun startChecks(List<String> checkIds) {
        String jobId = UUID.randomUUID().toString();
        long deadline = executor.deadlineFromNow();
        List<String> accepted = new ArrayList<String>();
        List<RejectedCheck> rejected = new ArrayList<RejectedCheck>();
        for (String id : checkIds) {
            MonitorCheck check = findCheck(id);
            String result =
                    check == null ? "NOT_REGISTERED" : executor.submit(check, jobId, deadline);
            if ("ACCEPTED".equals(result)) {
                accepted.add(id);
            } else {
                rejected.add(new RejectedCheck(id, result));
            }
        }
        return new CheckRun(jobId, accepted, rejected);
    }

    // 접수한 점검의 실행 결과 조회
    public Collection<CheckResult> results(String jobId, String since) {
        return executor.results(jobId, since);
    }

    public void shutdown() {
        executor.shutdown();
    }

    private MonitorCheck findCheck(String id) {
        for (MonitorCheck check : checks) {
            if (check.getId().equals(id)) {
                return check;
            }
        }
        return null;
    }

    public static final class CheckRun {
        private final String job_id;
        private final List<String> accepted_check_ids;
        private final List<RejectedCheck> rejected;

        CheckRun(String jobId, List<String> accepted, List<RejectedCheck> rejected) {
            this.job_id = jobId;
            this.accepted_check_ids = accepted;
            this.rejected = rejected;
        }

        public String getJobId() {
            return job_id;
        }

        public boolean hasAcceptedChecks() {
            return !accepted_check_ids.isEmpty();
        }

        public boolean hasOnlyCapacityRejections() {
            if (rejected.isEmpty()) {
                return false;
            }
            for (RejectedCheck value : rejected) {
                if (!"ALREADY_RUNNING".equals(value.reason)
                        && !"RATE_LIMITED".equals(value.reason)) {
                    return false;
                }
            }
            return true;
        }
    }

    private static final class RejectedCheck {
        private final String check_id;
        private final String reason;

        RejectedCheck(String checkId, String reason) {
            this.check_id = checkId;
            this.reason = reason;
        }
    }

    // JVM 지표 수집 실패 시 오류 정보와 미수집 값 반환
    private Map<String, Object> collectJvm(List<String> errors) {
        try {
            return snapshotSources.collectJvm();
        } catch (RuntimeException error) {
            addError(errors, "JVM_COLLECTION_FAILED");
            return unavailableJvm();
        }
    }

    // 시스템 지표 수집 실패 시 오류 정보와 미수집 값 반환
    private Map<String, Object> collectSystem(List<String> errors) {
        Map<String, Object> value;
        try {
            value = new LinkedHashMap<String, Object>(snapshotSources.collectSystem());
        } catch (RuntimeException error) {
            addError(errors, "SYSTEM_COLLECTION_FAILED");
            value = unavailableSystem();
        }
        value.put("disks", collectDisks(errors));
        return value;
    }

    // 등록된 경로별 디스크 사용량 수집
    private List<Map<String, Object>> collectDisks(List<String> errors) {
        List<Map<String, Object>> values = new ArrayList<Map<String, Object>>();
        for (MonitorAgentBuilder.DiskTarget target : disks) {
            try {
                Map<String, Object> disk = new LinkedHashMap<String, Object>();
                disk.put("path_id", target.id);
                disk.put("path_display", target.display);
                long totalBytes = target.path.getTotalSpace();
                disk.put(
                        "used_bytes",
                        totalBytes <= 0
                                ? null
                                : Long.valueOf(totalBytes - target.path.getUsableSpace()));
                disk.put("total_bytes", totalBytes <= 0 ? null : Long.valueOf(totalBytes));
                values.add(disk);
            } catch (RuntimeException error) {
                addError(errors, "DISK_COLLECTION_FAILED");
            }
        }
        return values;
    }

    private SnapshotSources defaultSnapshotSources() {
        return new SnapshotSources() {
            public Map<String, Object> collectJvm() {
                return collectJvmMetrics();
            }

            public Map<String, Object> collectSystem() {
                return collectSystemMetrics();
            }
        };
    }

    // JVM 메모리·스레드·GC 지표 조회
    private Map<String, Object> collectJvmMetrics() {
        RuntimeMXBean runtime = ManagementFactory.getRuntimeMXBean();
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        MemoryUsage nonHeap = ManagementFactory.getMemoryMXBean().getNonHeapMemoryUsage();
        long gcCount = 0L;
        long gcTime = 0L;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            if (gc.getCollectionCount() >= 0) {
                gcCount += gc.getCollectionCount();
            }
            if (gc.getCollectionTime() >= 0) {
                gcTime += gc.getCollectionTime();
            }
        }
        Map<String, Object> value = new LinkedHashMap<String, Object>();
        value.put("pid", pid(runtime.getName()));
        value.put("start_time", UtcClock.format(runtime.getStartTime()));
        value.put("uptime_ms", Long.valueOf(runtime.getUptime()));
        value.put("java_vendor", System.getProperty("java.vendor"));
        value.put("java_version", System.getProperty("java.version"));
        value.put("process_cpu_ratio", osMetric("getProcessCpuLoad"));
        value.put("heap_used_bytes", Long.valueOf(heap.getUsed()));
        value.put("heap_max_bytes", heap.getMax() < 0 ? null : Long.valueOf(heap.getMax()));
        value.put("non_heap_used_bytes", Long.valueOf(nonHeap.getUsed()));
        value.put(
                "thread_live_count",
                Integer.valueOf(ManagementFactory.getThreadMXBean().getThreadCount()));
        value.put(
                "thread_peak_count",
                Integer.valueOf(ManagementFactory.getThreadMXBean().getPeakThreadCount()));
        value.put("gc_count", Long.valueOf(gcCount));
        value.put("gc_time_ms", Long.valueOf(gcTime));
        return value;
    }

    // 운영체제 CPU 및 물리 메모리 지표 조회
    private Map<String, Object> collectSystemMetrics() {
        Long total = osLongMetric("getTotalPhysicalMemorySize");
        Long free = osLongMetric("getFreePhysicalMemorySize");
        Map<String, Object> value = new LinkedHashMap<String, Object>();
        value.put("system_cpu_ratio", osMetric("getSystemCpuLoad"));
        value.put(
                "physical_memory_used_bytes",
                total == null || free == null
                        ? null
                        : Long.valueOf(Math.max(0L, total.longValue() - free.longValue())));
        value.put("physical_memory_total_bytes", total);
        return value;
    }

    // 등록된 DB 풀 지표 수집 및 실패 원인 기록
    private List<DbPoolMetrics> collectDbPools(List<String> errors) {
        List<DbPoolMetrics> metrics = new ArrayList<DbPoolMetrics>();
        for (DbPoolMetricsProvider provider : dbPools) {
            try {
                DbPoolMetrics metric = provider.collect();
                if (metric != null) {
                    metrics.add(metric);
                }
            } catch (RuntimeException error) {
                addError(errors, "DB_POOL_COLLECTION_FAILED");
            }
        }
        return metrics;
    }

    private List<String> capabilities() {
        List<String> values = new ArrayList<String>();
        values.add("JVM");
        values.add("SYSTEM");
        if (!disks.isEmpty()) {
            values.add("DISK");
        }
        if (!dbPools.isEmpty()) {
            values.add("DB_POOL");
        }
        boolean internal = false;
        boolean api = false;
        for (MonitorCheck check : checks) {
            internal |= check.getCategory() == CheckCategory.INTERNAL;
            api |= check.getCategory() == CheckCategory.API;
        }
        if (internal) {
            values.add("INTERNAL_CHECK");
        }
        if (api) {
            values.add("API_CHECK");
        }
        return values;
    }

    private Map<String, Object> base() {
        Map<String, Object> value = new LinkedHashMap<String, Object>();
        value.put("schema_version", "1.0");
        value.put("observed_at", UtcClock.now());
        Map<String, String> identity = new LinkedHashMap<String, String>();
        identity.put("project_id", projectId);
        identity.put("instance_id", instanceId);
        value.put("identity", identity);
        return value;
    }

    private Object osMetric(String methodName) {
        Number value = invokeOperatingSystemMetric(methodName);
        if (value == null || value.doubleValue() < 0.0d) {
            return null;
        }
        return Double.valueOf(Math.min(1.0d, value.doubleValue()));
    }

    private Long osLongMetric(String methodName) {
        Number value = invokeOperatingSystemMetric(methodName);
        return value == null || value.longValue() < 0L ? null : Long.valueOf(value.longValue());
    }

    // 실행 환경에서 지원하는 운영체제 지표 메서드 호출
    private Number invokeOperatingSystemMetric(String methodName) {
        try {
            Object bean = ManagementFactory.getOperatingSystemMXBean();
            Class<?> extended = Class.forName("com.sun.management.OperatingSystemMXBean");
            if (!extended.isInstance(bean)) {
                return null;
            }
            Method method = extended.getMethod(methodName, new Class<?>[0]);
            return (Number) method.invoke(bean, new Object[0]);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Long pid(String runtimeName) {
        int separator = runtimeName.indexOf('@');
        if (separator <= 0) {
            return null;
        }
        try {
            return Long.valueOf(runtimeName.substring(0, separator));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    // WAS가 실행 중인 호스트명 반환
    private String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception ignored) {
            return "unknown";
        }
    }

    private Map<String, Object> unavailableJvm() {
        Map<String, Object> value = new LinkedHashMap<String, Object>();
        for (String key :
                new String[] {
                    "pid",
                    "start_time",
                    "uptime_ms",
                    "java_vendor",
                    "java_version",
                    "process_cpu_ratio",
                    "heap_used_bytes",
                    "heap_max_bytes",
                    "non_heap_used_bytes",
                    "thread_live_count",
                    "thread_peak_count",
                    "gc_count",
                    "gc_time_ms"
                }) {
            value.put(key, null);
        }
        return value;
    }

    private Map<String, Object> unavailableSystem() {
        Map<String, Object> value = new LinkedHashMap<String, Object>();
        value.put("system_cpu_ratio", null);
        value.put("physical_memory_used_bytes", null);
        value.put("physical_memory_total_bytes", null);
        return value;
    }

    private void addError(List<String> errors, String code) {
        if (!errors.contains(code)) {
            errors.add(code);
        }
    }

    interface SnapshotSources {
        Map<String, Object> collectJvm();

        Map<String, Object> collectSystem();
    }
}
