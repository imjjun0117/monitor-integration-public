package com.hermes.monitoring.agent;

import javax.servlet.ServletContext;

// 프로젝트별 에이전트 설정 계약 정의
public interface MonitorAgentConfigurer {
    void configure(MonitorAgentBuilder builder, ServletContext servletContext) throws Exception;
}
