package com.hermes.monitoring.center.collection;

import java.util.Map;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

// 중앙 수집기의 실행 및 대기 작업 정보 제공
@Component
final class CollectorInfoContributor implements InfoContributor {
    private final SnapshotCollector collector;

    CollectorInfoContributor(SnapshotCollector collector) {
        this.collector = collector;
    }

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail(
                "collector",
                Map.of(
                        "queue_depth", collector.queueDepth(),
                        "active_count", collector.activeCount()));
    }
}
