package com.monitoring.agent.web;

import java.util.Map;

// 목록 조회의 페이지 및 정렬 조건 검증
public record PageQuery(int page, int size, String orderBy) {
    public static PageQuery of(int page, int size, String sort, Map<String, String> allowedSorts) {
        if (page < 0 || size < 1 || size > 200) {
            throw new IllegalArgumentException("PAGE_INVALID");
        }
        String[] parts = sort.split(",", -1);
        String column = allowedSorts.get(parts[0]);
        if (column == null || parts.length > 2) {
            throw new IllegalArgumentException("SORT_INVALID");
        }
        String direction = parts.length == 2 ? parts[1] : "asc";
        if (!"asc".equalsIgnoreCase(direction) && !"desc".equalsIgnoreCase(direction)) {
            throw new IllegalArgumentException("SORT_INVALID");
        }
        return new PageQuery(page, size, column + " " + direction.toUpperCase());
    }

    public int offset() {
        return page * size;
    }
}
