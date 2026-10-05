package com.monitoring.collector;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.Charset;
import java.nio.file.StandardOpenOption;
import java.util.Map;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class LogReaderTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private static final Charset UTF8 = Charset.forName("UTF-8");

    @Test
    public void boundedTailAppendAndRotationKeepRawText() throws Exception {
        File root = temporary.newFolder("logs");
        Path file = new File(root, "catalina.out").toPath();
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            text.append("line-").append(i).append("\n");
        }
        Files.write(file, text.toString().getBytes(UTF8));
        LogReader reader = new LogReader(root.getAbsolutePath());
        Map<String, Object> first = reader.read(file.toString(), "UTF-8", null);
        assertTrue(first.get("text").toString().startsWith("line-300\n"));
        assertEquals(200, first.get("text").toString().split("\n").length);
        String raw = "한글 token=actual-value <script>plain text</script>\n";
        Files.write(file, raw.getBytes(UTF8), StandardOpenOption.APPEND);
        Map<String, Object> appended =
                reader.read(file.toString(), "UTF-8", first.get("cursor").toString());
        assertEquals(raw, appended.get("text"));
        assertEquals(false, appended.get("reset"));
        assertEquals(
                "",
                reader.read(file.toString(), "UTF-8", appended.get("cursor").toString())
                        .get("text"));
        Files.write(file, "rotated\n".getBytes(UTF8));
        Map<String, Object> rotated =
                reader.read(file.toString(), "UTF-8", appended.get("cursor").toString());
        assertEquals(true, rotated.get("reset"));
        assertEquals("rotated\n", rotated.get("text"));
    }

    @Test
    public void incompleteUtf8CharacterIsReadExactlyOnceAfterAppend() throws Exception {
        File root = temporary.newFolder("unicode");
        Path file = new File(root, "a.log").toPath();
        byte[] full = "한".getBytes(UTF8);
        Files.write(file, new byte[] {full[0], full[1]});
        LogReader reader = new LogReader(root.getAbsolutePath());
        Map<String, Object> first = reader.read(file.toString(), "UTF-8", null);
        assertEquals("", first.get("text"));
        Files.write(file, new byte[] {full[2]}, StandardOpenOption.APPEND);
        assertEquals(
                "한",
                reader.read(file.toString(), "UTF-8", first.get("cursor").toString()).get("text"));
    }

    @Test
    public void forbiddenPathsDirectoriesAndMissingRootsAreRejected() throws Exception {
        File root = temporary.newFolder("allowed");
        File outside = temporary.newFile("outside.log");
        LogReader reader = new LogReader(root.getAbsolutePath());
        denied(reader, outside.getAbsolutePath(), "LOG_PATH_NOT_ALLOWED");
        denied(reader, new File(root, "../outside.log").getAbsolutePath(), "LOG_PATH_NOT_ALLOWED");
        denied(reader, root.getAbsolutePath(), "LOG_NOT_REGULAR_FILE");
        denied(reader, "//untrusted-host/share/log.txt", "INVALID_LOG_REQUEST");
        denied(reader, "\\\\untrusted-host\\share\\log.txt", "INVALID_LOG_REQUEST");
        denied(new LogReader(null), outside.getAbsolutePath(), "LOG_ROOTS_NOT_CONFIGURED");
    }

    @Test
    public void oversizedSingleLineNeverReadsTheWholeFile() throws Exception {
        File root = temporary.newFolder("large");
        Path file = new File(root, "large.log").toPath();
        byte[] bytes = new byte[LogReader.MAX_BYTES * 4];
        java.util.Arrays.fill(bytes, (byte) 'x');
        Files.write(file, bytes);
        Map<String, Object> value =
                new LogReader(root.getAbsolutePath()).read(file.toString(), "UTF-8", null);
        assertTrue(value.get("text").toString().length() <= LogReader.MAX_BYTES);
        assertEquals(true, value.get("limited"));
    }

    private static void denied(LogReader reader, String path, String code) throws Exception {
        try {
            reader.read(path, "UTF-8", null);
            fail("Path accepted");
        } catch (IOException expected) {
            assertEquals(code, expected.getMessage());
        }
    }
}
