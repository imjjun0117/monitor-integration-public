package com.hermes.monitoring.center.log;

import java.util.ArrayDeque;
import java.util.UUID;

// 제한된 임시 로그 버퍼 관리. 화면 커서는 파일 위치 대신 변경 순서 사용
final class LogBuffer {
    private static final int MAX_CHARS = 128 * 1024;
    private final String generation = UUID.randomUUID().toString();
    private final ArrayDeque<Chunk> chunks = new ArrayDeque<>();
    private long revision;
    private int size;
    private boolean limited;

    // 추가 로그를 제한된 임시 버퍼에 반영
    void append(String text, boolean reset, boolean truncated) {
        limited = truncated;
        if (reset) {
            chunks.clear();
            size = 0;
        }
        if (text.isEmpty() && !reset) {
            return;
        }
        if (text.length() > MAX_CHARS) {
            text = text.substring(text.length() - MAX_CHARS);
            limited = true;
        }
        chunks.add(new Chunk(++revision, text, reset));
        size += text.length();
        while (chunks.size() > 1 && (size > MAX_CHARS || chunks.size() > 200)) {
            size -= chunks.removeFirst().text().length();
        }
    }

    // 화면 커서 이후의 로그와 조회 상태 반환
    synchronized View view(String cursor, String code, int retryAfter) {
        long since = -1;
        if (cursor != null && cursor.startsWith(generation + ":")) {
            try {
                since = Long.parseLong(cursor.substring(generation.length() + 1));
            } catch (NumberFormatException ignored) {
                /* 만료되거나 잘못된 커서는 제한된 최근 내용 반환 */
            }
        }
        boolean reset =
                since < 0
                        || since > revision
                        || (!chunks.isEmpty() && since < chunks.getFirst().revision() - 1);
        StringBuilder text = new StringBuilder();
        for (Chunk chunk : chunks) {
            if (reset || chunk.revision() > since) {
                if (chunk.reset()) {
                    text.setLength(0);
                    reset = true;
                }
                text.append(chunk.text());
            }
        }
        String result = text.toString();
        if (reset) {
            int lines = 0;
            for (int i = result.endsWith("\n") ? result.length() - 2 : result.length() - 1;
                    i >= 0;
                    i--) {
                if (result.charAt(i) == '\n' && ++lines == 200) {
                    result = result.substring(i + 1);
                    break;
                }
            }
        }
        return new View(result, generation + ":" + revision, reset, limited, code, retryAfter);
    }

    record View(
            String text,
            String cursor,
            boolean reset,
            boolean limited,
            String code,
            int retry_after_seconds) {}

    private record Chunk(long revision, String text, boolean reset) {}
}
