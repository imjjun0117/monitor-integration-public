package com.monitoring.agent.web;

import java.util.List;

// 목록 데이터와 페이지 정보 반환
public record ApiPage<T>(List<T> items, int page, int size, long total) {}
