package com.monitoring.collector;

import java.text.SimpleDateFormat;
import java.text.ParseException;
import java.util.Date;
import java.util.TimeZone;

// UTC 기준 현재 시각 반환
final class UtcClock {
    private UtcClock() {}

    static String now() {
        return format(System.currentTimeMillis());
    }

    static String format(long epochMillis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(epochMillis));
    }

    static Long parse(String value) {
        if (value == null || !value.endsWith("Z")) {
            return null;
        }
        String pattern =
                value.indexOf('.') >= 0
                        ? "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
                        : "yyyy-MM-dd'T'HH:mm:ss'Z'";
        SimpleDateFormat format = new SimpleDateFormat(pattern);
        format.setLenient(false);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            return Long.valueOf(format.parse(value).getTime());
        } catch (ParseException error) {
            return null;
        }
    }
}
