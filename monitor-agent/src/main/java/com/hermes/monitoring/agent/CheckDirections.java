package com.hermes.monitoring.agent;

// 점검 방향 정보 확인
final class CheckDirections {
    private CheckDirections() {}

    static CheckDirection directionOf(MonitorCheck check) {
        CheckDirection direction = check.getDirection();
        validate(check.getCategory(), direction);
        return direction;
    }

    private static void validate(CheckCategory category, CheckDirection direction) {
        boolean validInternal = category == CheckCategory.INTERNAL && direction == null;
        boolean validApi = category == CheckCategory.API && direction != null;
        if (!validInternal && !validApi) {
            throw new IllegalArgumentException("INVALID_CHECK_DIRECTION");
        }
    }
}
