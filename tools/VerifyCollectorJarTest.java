import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

// 실제 검사기를 호출하여 호환 헤더 허용과 손상·상위 버전 차단 검증
public final class VerifyCollectorJarTest {
    public static void main(String[] args) throws Exception {
        Path directory = Path.of(args[0]);
        byte[] compiledClass;
        try (InputStream input =
                VerifyCollectorJar.class.getResourceAsStream("VerifyCollectorJar.class")) {
            compiledClass = input.readAllBytes();
        }

        byte[] java7 = withVersion(compiledClass, 51, 0);
        byte[] java5 = withVersion(compiledClass, 49, 0);
        String collector = "com/monitoring/collector/MonitorRuntime.class";
        String dependency = "com/monitoring/collector/internal/websocket/Address.class";
        verify(directory, collector, java7, true);
        verify(directory, dependency, java5, true);
        verify(directory, dependency, withVersion(compiledClass, 50, 0), true);
        verify(directory, dependency, java7, true);
        verify(directory, collector, java5, false);
        verify(directory, dependency, withVersion(compiledClass, 52, 0), false);
        verify(directory, dependency, withVersion(compiledClass, 44, 0), false);
        verify(directory, dependency, withVersion(compiledClass, 51, 1), false);
        verify(directory, dependency, new byte[8], false);
        verify(directory, dependency, new byte[7], false);
        verify(directory, "module-info.class", java7, false);
        verify(directory, "META-INF/versions/9/Dependency.class", java7, false);
        verify(directory, "README.txt", new byte[0], false);
        System.out.println("collector verifier behavior: 13 cases passed");
    }

    private static byte[] withVersion(byte[] original, int major, int minor) {
        byte[] bytes = original.clone();
        bytes[4] = (byte) (minor >>> 8);
        bytes[5] = (byte) minor;
        bytes[6] = (byte) (major >>> 8);
        bytes[7] = (byte) major;
        return bytes;
    }

    private static void verify(
            Path directory,
            String name,
            byte[] bytes,
            boolean accepted)
            throws Exception {
        Path archive = Files.createTempFile(directory, "collector-", ".jar");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(archive))) {
            output.putNextEntry(new ZipEntry(name));
            output.write(bytes);
            output.closeEntry();
        }

        try {
            VerifyCollectorJar.main(new String[] {archive.toString()});
        } catch (IllegalStateException failure) {
            if (accepted) {
                throw new AssertionError("compatible entry rejected: " + name, failure);
            }
            return;
        }
        if (!accepted) {
            throw new AssertionError("incompatible entry accepted: " + name);
        }
    }
}
