import java.io.InputStream;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public final class VerifyCollectorJar {
    private VerifyCollectorJar() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("collector JAR path required");
        int classes = 0;
        try (ZipFile jar = new ZipFile(Path.of(args[0]).toFile())) {
            Enumeration<? extends ZipEntry> entries = jar.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (name.contains("module-info") || name.startsWith("META-INF/versions/")) {
                    throw new IllegalStateException("forbidden multi-release entry: " + name);
                }
                if (!name.endsWith(".class")) continue;
                byte[] header = new byte[8];
                try (InputStream input = jar.getInputStream(entry)) {
                    int offset = 0;
                    while (offset < header.length) {
                        int read = input.read(header, offset, header.length - offset);
                        if (read < 0) throw new IllegalStateException("truncated class: " + name);
                        offset += read;
                    }
                }
                boolean magic = (header[0] & 0xff) == 0xca && (header[1] & 0xff) == 0xfe
                    && (header[2] & 0xff) == 0xba && (header[3] & 0xff) == 0xbe;
                int major = ((header[6] & 0xff) << 8) | (header[7] & 0xff);
                if (!magic || major != 51) {
                    throw new IllegalStateException(name + " has class major " + major + ", expected 51");
                }
                classes++;
            }
        }
        if (classes == 0) throw new IllegalStateException("collector JAR has no classes");
        System.out.println("verified Java 7 classes: " + classes);
    }
}
