package com.hermes.monitoring.agent;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;

// 기존 로그 파일의 제한된 구간 조회. 파일 원문은 별도로 보관하지 않음
public final class LogReader {
    public static final int MAX_BYTES = 128 * 1024;
    private final List<File> roots = new ArrayList<File>();
    private final Semaphore slot = new Semaphore(1);

    public LogReader(String allowedRoots) {
        if (allowedRoots != null) {
            for (String root : allowedRoots.split(";")) {
                File folder = new File(root.trim());
                if (root.trim().length() > 0 && folder.isAbsolute()) {
                    roots.add(folder);
                }
            }
        }
    }

    // 허용 경로와 커서를 검증하고 추가된 로그 구간 조회
    public Map<String, Object> read(String filePath, String encoding, String cursor)
            throws IOException {
        if (roots.isEmpty()) {
            throw new IOException("LOG_ROOTS_NOT_CONFIGURED");
        }
        if (filePath == null
                || filePath.length() > 1000
                || !new File(filePath).isAbsolute()
                || filePath.startsWith("//")
                || filePath.startsWith("\\\\")
                || !("UTF-8".equals(encoding)
                        || "MS949".equals(encoding)
                        || "EUC-KR".equals(encoding))
                || (cursor != null && cursor.length() > 180)) {
            throw new IOException("INVALID_LOG_REQUEST");
        }
        if (!slot.tryAcquire()) {
            throw new IOException("LOG_READER_BUSY");
        }
        try {
            Path candidate = new File(filePath).toPath().normalize();
            boolean inConfiguredFolder = false;
            for (File root : roots) {
                if (candidate.startsWith(root.toPath().normalize())) {
                    inConfiguredFolder = true;
                }
            }
            // 원격 UNC 경로를 포함해 허용 범위 밖 경로는 파일시스템 확인 전 차단
            if (!inConfiguredFolder) {
                throw new IOException("LOG_PATH_NOT_ALLOWED");
            }
            Path path = candidate.toRealPath();
            boolean allowed = false;
            for (File root : roots) {
                if (path.startsWith(root.toPath().toRealPath())) {
                    allowed = true;
                }
            }
            if (!allowed) {
                throw new IOException("LOG_PATH_NOT_ALLOWED");
            }
            BasicFileAttributes attributes =
                    Files.readAttributes(
                            path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!attributes.isRegularFile()) {
                throw new IOException("LOG_NOT_REGULAR_FILE");
            }
            String identity =
                    digest(String.valueOf(attributes.fileKey()) + ":" + attributes.creationTime());
            HashSet<java.nio.file.OpenOption> options = new HashSet<java.nio.file.OpenOption>();
            options.add(StandardOpenOption.READ);
            options.add(LinkOption.NOFOLLOW_LINKS);
            try (SeekableByteChannel file = Files.newByteChannel(path, options)) {
                long length = file.size();
                long offset = -1;
                boolean reset = cursor != null && cursor.length() > 0;
                if (reset) {
                    String[] parts = cursor.split(":");
                    try {
                        long previous = Long.parseLong(parts[0]);
                        if (parts.length == 3
                                && previous >= 0
                                && previous <= length
                                && identity.equals(parts[1])
                                && anchor(file, previous).equals(parts[2])) {
                            offset = previous;
                            reset = false;
                        }
                    } catch (RuntimeException ignored) {
                        throw new IOException("INVALID_LOG_CURSOR");
                    }
                }
                boolean initial = offset < 0;
                if (initial) {
                    offset = Math.max(0, length - MAX_BYTES);
                }
                boolean limited = initial ? offset > 0 : length - offset > MAX_BYTES;
                byte[] bytes = bytes(file, offset, (int) Math.min(MAX_BYTES, length - offset));
                ByteBuffer input = ByteBuffer.wrap(bytes);
                CharBuffer output = CharBuffer.allocate(MAX_BYTES);
                Charset.forName(encoding)
                        .newDecoder()
                        .onMalformedInput(CodingErrorAction.REPLACE)
                        .onUnmappableCharacter(CodingErrorAction.REPLACE)
                        .decode(input, output, false);
                long next = offset + input.position();
                ((java.nio.Buffer) output).flip();
                String text = output.toString();
                if (initial) {
                    if (offset > 0) {
                        int newline = text.indexOf('\n');
                        text = newline < 0 ? "" : text.substring(newline + 1);
                    }
                    int end = text.endsWith("\n") ? text.length() - 2 : text.length() - 1;
                    int lines = 0;
                    for (int i = end; i >= 0; i--) {
                        if (text.charAt(i) == '\n' && ++lines == 200) {
                            text = text.substring(i + 1);
                            limited = true;
                            break;
                        }
                    }
                }
                Map<String, Object> result = new LinkedHashMap<String, Object>();
                result.put("text", text);
                result.put("cursor", next + ":" + identity + ":" + anchor(file, next));
                result.put("reset", Boolean.valueOf(reset));
                result.put("limited", Boolean.valueOf(limited));
                return result;
            }
        } catch (SecurityException denied) {
            throw new IOException("LOG_ACCESS_DENIED");
        } finally {
            slot.release();
        }
    }

    private static byte[] bytes(SeekableByteChannel file, long offset, int size)
            throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(size);
        file.position(offset);
        while (buffer.hasRemaining() && file.read(buffer) > 0) {
            /* 버퍼 용량 안에서만 읽기 */
        }
        byte[] result = new byte[buffer.position()];
        ((java.nio.Buffer) buffer).flip();
        buffer.get(result);
        return result;
    }

    private static String anchor(SeekableByteChannel file, long offset) throws IOException {
        return digest(bytes(file, Math.max(0, offset - 64), (int) Math.min(64, offset)));
    }

    private static String digest(String value) {
        return digest(value.getBytes(Charset.forName("UTF-8")));
    }

    private static String digest(byte[] value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder result = new StringBuilder();
            for (byte b : hash) {
                result.append(String.format("%02x", b & 255));
            }
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
