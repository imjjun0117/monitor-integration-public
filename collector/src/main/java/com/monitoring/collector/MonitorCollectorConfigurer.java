package com.monitoring.collector;

import javax.servlet.ServletContext;

// 프로젝트별 Collector 설정 계약 정의
public interface MonitorCollectorConfigurer {
    void configure(MonitorCollectorBuilder builder, ServletContext servletContext) throws Exception;
}
