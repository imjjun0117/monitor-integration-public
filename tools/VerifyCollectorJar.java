import java.io.InputStream;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class VerifyCollectorJar {
    private static final int MIN_CLASS_MAJOR = 45;
    private static final int JAVA7_CLASS_MAJOR = 51;
    private static final int CLASS_HEADER_SIZE = 8;
    private static final String COLLECTOR_PACKAGE = "com/monitoring/collector/";
    private static final String SHADED_PACKAGE = COLLECTOR_PACKAGE + "internal/";

    private VerifyCollectorJar() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("collector JAR path required");
        }

        int classes = 0;
        try (ZipFile jar = new ZipFile(Path.of(args[0]).toFile())) {
            Enumeration<? extends ZipEntry> entries = jar.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (name.contains("module-info") || name.startsWith("META-INF/versions/")) {
                    throw new IllegalStateException("forbidden multi-release entry: " + name);
                }
                if (!name.endsWith(".class")) {
                    continue;
                }

                byte[] header = new byte[CLASS_HEADER_SIZE];
                try (InputStream input = jar.getInputStream(entry)) {
                    int offset = 0;
                    while (offset < header.length) {
                        int read = input.read(header, offset, header.length - offset);
                        if (read < 0) {
                            throw new IllegalStateException("truncated class: " + name);
                        }
                        offset += read;
                    }
                }

                boolean magic =
                        (header[0] & 0xff) == 0xca
                                && (header[1] & 0xff) == 0xfe
                                && (header[2] & 0xff) == 0xba
                                && (header[3] & 0xff) == 0xbe;
                int minor = ((header[4] & 0xff) << 8) | (header[5] & 0xff);
                int major = ((header[6] & 0xff) << 8) | (header[7] & 0xff);
                // Java 7은 이전 바이트코드도 지원하되 51.0보다 높은 버전은 차단
                if (!magic
                        || major < MIN_CLASS_MAJOR
                        || major > JAVA7_CLASS_MAJOR
                        || (major == JAVA7_CLASS_MAJOR && minor != 0)) {
                    throw new IllegalStateException(
                            name + " has incompatible class version " + major + "." + minor);
                }
                // 직접 작성한 Collector 코드는 기존 Java 7 컴파일 대상 유지
                if (name.startsWith(COLLECTOR_PACKAGE)
                        && !name.startsWith(SHADED_PACKAGE)
                        && major != JAVA7_CLASS_MAJOR) {
                    throw new IllegalStateException(
                            name + " has class major " + major + ", expected " + JAVA7_CLASS_MAJOR);
                }
                classes++;
            }
        }

        if (classes == 0) {
            throw new IllegalStateException("collector JAR has no classes");
        }
        System.out.println("verified Java 7 compatible classes: " + classes);
    }
}
