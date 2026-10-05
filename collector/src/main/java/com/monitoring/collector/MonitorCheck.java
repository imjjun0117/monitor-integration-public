package com.monitoring.collector;

// 프로젝트별 점검 실행 계약 정의
public interface MonitorCheck {
    String getId();

    String getName();

    CheckCategory getCategory();

    CheckDirection getDirection();

    CheckResult execute(CheckContext context) throws Exception;
}
