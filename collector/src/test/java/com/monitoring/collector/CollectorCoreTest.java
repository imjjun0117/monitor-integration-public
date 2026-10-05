package com.monitoring.collector;

import com.google.gson.Gson;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class CollectorCoreTest {
    @Test
    public void emptyTokenFailsClosedAndCorrectTokenMatches() {
        assertFalse(TokenVerifier.matches("", ""));
        assertFalse(TokenVerifier.matches(null, "x"));
        String token = "01234567890123456789012345678901";
        assertTrue(TokenVerifier.matches(token, token));
        assertFalse(TokenVerifier.matches(token, token + "x"));
    }

    @Test
    public void identityAllowsOnlyDocumentedKeys() {
        new MonitorCollectorBuilder()
                .identity("sample-a", "local-01")
                .token("01234567890123456789012345678901")
                .build();
        try {
            new MonitorCollectorBuilder()
                    .identity("A", "local-01")
                    .token("01234567890123456789012345678901")
                    .build();
            fail("invalid project id accepted");
        } catch (IllegalStateException expected) {
            assertEquals("INVALID_IDENTITY", expected.getMessage());
        }
    }

    @Test
    public void configuredTokenRequiresAtLeastThirtyTwoUtf8Bytes() {
        try {
            new MonitorCollectorBuilder()
                    .identity("sample-a", "local-01")
                    .token("1234567890123456789012345678901")
                    .build();
            fail("31-byte token accepted");
        } catch (IllegalStateException expected) {
            assertEquals("TOKEN_TOO_SHORT", expected.getMessage());
        }
        MonitorRuntime utf8 =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("가나다라마바사아자차카타파하가나")
                        .build();
        utf8.shutdown();
    }

    @Test
    public void registeredCheckCanRunAndUnregisteredIsRejected() throws Exception {
        MonitorCheck check =
                new MonitorCheck() {
                    public String getId() {
                        return "known-check";
                    }

                    public String getName() {
                        return "known";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) {
                        return new CheckResult(getId(), "UP", 1L, "ok");
                    }
                };
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901")
                        .check(check)
                        .build();
        assertEquals("ACCEPTED", runtime.runCheck("known-check"));
        assertEquals("NOT_REGISTERED", runtime.runCheck("unknown-check"));
        Thread.sleep(50L);
        assertEquals(1, runtime.results().size());
        runtime.shutdown();
    }

    @Test
    public void duplicateCheckIsNotRunTwice() throws Exception {
        BoundedCheckExecutor executor = new BoundedCheckExecutor(1, 1);
        MonitorCheck slow =
                new MonitorCheck() {
                    public String getId() {
                        return "slow-check";
                    }

                    public String getName() {
                        return "slow";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) throws Exception {
                        Thread.sleep(100L);
                        return new CheckResult(getId(), "UP", 100L, "ok");
                    }
                };
        assertEquals("ACCEPTED", executor.submit(slow));
        assertEquals("ALREADY_RUNNING", executor.submit(slow));
        executor.shutdown();
    }

    @Test
    public void snapshotUsesCompleteSnakeCaseContractAndUtc() {
        MonitorCheck check =
                new MonitorCheck() {
                    public String getId() {
                        return "internal-health";
                    }

                    public String getName() {
                        return "Internal health";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) {
                        return new CheckResult(getId(), "UP", 1L, "ok");
                    }
                };
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901")
                        .disk(
                                "temporary",
                                "Temporary",
                                new File(System.getProperty("java.io.tmpdir")))
                        .dbPool(
                                new DbPoolMetricsProvider() {
                                    public DbPoolMetrics collect() {
                                        return new DbPoolMetrics(
                                                "main",
                                                "Main",
                                                Integer.valueOf(1),
                                                Integer.valueOf(2),
                                                Integer.valueOf(10),
                                                Integer.valueOf(1),
                                                null,
                                                Long.valueOf(1000),
                                                Long.valueOf(2));
                                    }
                                })
                        .check(check)
                        .build();

        Map<String, Object> snapshot = runtime.snapshot();
        String serialized = new Gson().toJson(snapshot);
        assertTrue(serialized, serialized.matches(".*\\\"observed_at\\\":\\\"[^\\\"]+Z\\\".*"));
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
                    "gc_time_ms",
                    "system_cpu_ratio",
                    "physical_memory_used_bytes",
                    "physical_memory_total_bytes",
                    "path_id",
                    "path_display",
                    "pool_id",
                    "min_idle",
                    "max_wait_ms",
                    "validation_latency_ms",
                    "recent_checks"
                }) {
            assertTrue(
                    "missing snake_case key " + key + ": " + serialized,
                    serialized.contains("\"" + key + "\""));
        }
        assertFalse(serialized, serialized.contains("poolId"));
        assertFalse(serialized, serialized.contains("minIdle"));
        runtime.shutdown();
    }

    @Test
    public void snapshotCollectsEveryRegisteredDatabasePool() {
        MonitorCollectorBuilder builder =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901");
        builder.dbPool(pool("primary"));
        builder.dbPool(pool("reporting"));
        MonitorRuntime runtime = builder.build();

        String serialized = new Gson().toJson(runtime.snapshot());
        assertTrue(serialized, serialized.contains("\"pool_id\":\"primary\""));
        assertTrue(serialized, serialized.contains("\"pool_id\":\"reporting\""));
        runtime.shutdown();
    }

    @Test
    public void snapshotTruthfullyReportsPartialCollectionAndKeepsHealthyComponents() {
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901")
                        .dbPool(
                                new DbPoolMetricsProvider() {
                                    public DbPoolMetrics collect() {
                                        throw new IllegalStateException("password=must-not-leak");
                                    }
                                })
                        .dbPool(pool("healthy"))
                        .build();

        String serialized = new Gson().toJson(runtime.snapshot());
        assertTrue(serialized, serialized.contains("\"partial\":true"));
        assertTrue(
                serialized,
                serialized.contains("\"collection_errors\":[\"DB_POOL_COLLECTION_FAILED\"]"));
        assertTrue(serialized, serialized.contains("\"pool_id\":\"healthy\""));
        assertFalse(serialized, serialized.contains("must-not-leak"));
        runtime.shutdown();
    }

    @Test
    public void snapshotConvertsJvmSystemAndDiskFailuresIntoTruthfulPartialData() {
        List<MonitorCollectorBuilder.DiskTarget> disks =
                new ArrayList<MonitorCollectorBuilder.DiskTarget>();
        disks.add(
                new MonitorCollectorBuilder.DiskTarget(
                        "broken",
                        "Broken",
                        new File("broken") {
                            private static final long serialVersionUID = 1L;

                            @Override
                            public long getTotalSpace() {
                                throw new SecurityException("password=disk-secret");
                            }
                        }));
        disks.add(
                new MonitorCollectorBuilder.DiskTarget(
                        "healthy", "Healthy", new File(System.getProperty("java.io.tmpdir"))));
        MonitorRuntime runtime =
                new MonitorRuntime(
                        "sample-a",
                        "local-01",
                        "01234567890123456789012345678901",
                        Collections.<MonitorCheck>emptyList(),
                        disks,
                        Collections.<DbPoolMetricsProvider>emptyList(),
                        new MonitorRuntime.SnapshotSources() {
                            public Map<String, Object> collectJvm() {
                                throw new IllegalStateException("token=jvm-secret");
                            }

                            public Map<String, Object> collectSystem() {
                                throw new IllegalStateException("X-Api-Key: system-secret");
                            }
                        });

        String serialized = new Gson().toJson(runtime.snapshot());

        assertTrue(serialized, serialized.contains("\"partial\":true"));
        assertTrue(serialized, serialized.contains("JVM_COLLECTION_FAILED"));
        assertTrue(serialized, serialized.contains("SYSTEM_COLLECTION_FAILED"));
        assertTrue(serialized, serialized.contains("DISK_COLLECTION_FAILED"));
        assertTrue(serialized, serialized.contains("\"path_id\":\"healthy\""));
        assertFalse(serialized, serialized.contains("broken\""));
        for (String secret : new String[] {"disk-secret", "jvm-secret", "system-secret"}) {
            assertFalse(secret + " leaked in " + serialized, serialized.contains(secret));
        }
        runtime.shutdown();
    }

    @Test
    public void infoDiscoversCheckDefinitionsWithoutSerializingImplementations() {
        MonitorCheck check =
                new MonitorCheck() {
                    public String getId() {
                        return "partner-api";
                    }

                    public String getName() {
                        return "Partner API";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.API;
                    }

                    public CheckDirection getDirection() {
                        return CheckDirection.EXTERNAL;
                    }

                    public CheckResult execute(CheckContext context) {
                        return new CheckResult(getId(), "UP", 1L, "ok");
                    }
                };
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901")
                        .check(check)
                        .build();
        String serialized = new Gson().toJson(runtime.info());
        assertTrue(serialized, serialized.contains("\"check_id\":\"partner-api\""));
        assertTrue(serialized, serialized.contains("\"name\":\"Partner API\""));
        assertTrue(serialized, serialized.contains("\"category\":\"API\""));
        assertTrue(serialized, serialized.contains("\"direction\":\"EXTERNAL\""));
        runtime.shutdown();
    }

    @Test
    public void executorShutdownIsObservableAndRejectsNewWork() {
        BoundedCheckExecutor executor = new BoundedCheckExecutor(1, 1);
        executor.shutdown();
        assertTrue(executor.isShutdown());
        MonitorCheck check =
                new MonitorCheck() {
                    public String getId() {
                        return "after-shutdown";
                    }

                    public String getName() {
                        return "After shutdown";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) {
                        return new CheckResult(getId(), "UP", 1L, "ok");
                    }
                };
        assertEquals("RATE_LIMITED", executor.submit(check));
    }

    private DbPoolMetricsProvider pool(final String id) {
        return new DbPoolMetricsProvider() {
            public DbPoolMetrics collect() {
                return new DbPoolMetrics(
                        id,
                        id,
                        Integer.valueOf(1),
                        Integer.valueOf(0),
                        Integer.valueOf(10),
                        Integer.valueOf(1),
                        null,
                        Long.valueOf(1000),
                        Long.valueOf(2));
            }
        };
    }
}
