package sample.monitoring;

import com.monitoring.collector.DbPoolMetrics;
import com.monitoring.collector.DbPoolMetricsProvider;
import java.lang.reflect.Method;

public final class Dbcp1PoolAdapter implements DbPoolMetricsProvider {
    private final Object pool;

    public Dbcp1PoolAdapter(Object pool) {
        if (pool == null) throw new IllegalArgumentException("POOL_REQUIRED");
        this.pool = pool;
    }

    public DbPoolMetrics collect() {
        return new DbPoolMetrics("main", "샘플 프로젝트 DataSource",
            call("getNumActive"), call("getNumIdle"), call("getMaxActive"),
            null, null);
    }

    private Integer call(String name) {
        try {
            Method method = pool.getClass().getMethod(name, new Class[0]);
            return (Integer) method.invoke(pool, new Object[0]);
        } catch (Exception error) {
            return null;
        }
    }
}
