package com.monitoring.agent.transport;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

// 브라우저 세션 대신 일회용 승인과 Collector 토큰으로 연결 인증
@Configuration
@EnableWebSocket
public class CollectorWebSocketConfig implements WebSocketConfigurer {
    private final CollectorTransportHub hub;

    public CollectorWebSocketConfig(CollectorTransportHub hub) {
        this.hub = hub;
    }

    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(hub, "/collector/connect").addInterceptors(hub);
    }
}
