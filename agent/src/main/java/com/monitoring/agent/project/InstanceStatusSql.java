package com.monitoring.agent.project;

// 서버 수집 상태와 서비스 점검 상태를 구분하는 SQL 구성
public final class InstanceStatusSql {
    private InstanceStatusSql() {}

    public static String expression() {
        return """
            case
              when i.last_seen_at is null then 'UNKNOWN'
              when i.consecutive_failures>=3 or i.last_seen_at<now()-
                (greatest(i.poll_interval_seconds::bigint*3,60)*interval '1 second') then 'DOWN'
              when i.consecutive_failures>0 then 'WARN'
              else coalesce(l.status,'UP')
            end
            """;
    }

    // 서비스 점검 결과와 별개로 서버 수집 연결 상태 반환
    public static String collectionExpression() {
        return """
            case when i.last_seen_at is null then 'UNKNOWN'
              when i.consecutive_failures>=3 or i.last_seen_at<now()-
                (greatest(i.poll_interval_seconds::bigint*3,60)*interval '1 second') then 'DOWN'
              when i.consecutive_failures>0 then 'WARN' else 'UP' end
            """;
    }
}
