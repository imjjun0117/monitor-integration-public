package com.hermes.monitoring.agent;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.InetSocketAddress;
import java.nio.charset.Charset;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class DeclarativeHttpsSecurityTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    @Test
    public void defaultTrustStoreRejectsUntrustedHttpsWithoutReachingApplicationHandler()
            throws Exception {
        File keystore =
                new File(
                        System.getProperty("java.io.tmpdir"),
                        "hermes-untrusted-" + System.nanoTime() + ".p12");
        generateKeystore(keystore);
        final AtomicInteger applicationHits = new AtomicInteger();
        HttpsServer server = httpsServer(keystore, applicationHits);
        try {
            server.start();
            String url = "https://127.0.0.1:" + server.getAddress().getPort() + "/health";
            String declaration =
                    "{\"checks\":[{\"check_id\":\"untrusted-tls\","
                            + "\"name\":\"untrusted-tls\",\"category\":\"API\","
                            + "\"direction\":\"EXTERNAL\",\"type\":\"HTTP\",\"enabled\":true,"
                            + "\"read_only\":true,\"request\":{\"method\":\"GET\",\"url\":\""
                            + url
                            + "\",\"connect_timeout_ms\":1000,\"read_timeout_ms\":1000},"
                            + "\"assertion\":{\"status\":[200]}}]}";
            MonitorCheck check =
                    new DeclarativeCheckLoader(Collections.<String, String>emptyMap(), noSecrets())
                            .load(new StringReader(declaration))
                            .get(0);

            CheckResult result =
                    check.execute(new CheckContext(System.currentTimeMillis() + 2_000L));

            assertEquals("DOWN", result.getStatus());
            assertEquals("HTTP_TLS_ERROR", result.getResultCode());
            assertEquals("untrusted request reached handler", 0, applicationHits.get());
        } finally {
            server.stop(0);
            if (!keystore.delete()) {
                keystore.deleteOnExit();
            }
        }
    }

    private HttpsServer httpsServer(File keystore, final AtomicInteger hits) throws Exception {
        KeyStore keys = KeyStore.getInstance("PKCS12");
        InputStream input = new FileInputStream(keystore);
        try {
            keys.load(input, "changeit".toCharArray());
        } finally {
            input.close();
        }
        KeyManagerFactory managers =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        managers.init(keys, "changeit".toCharArray());
        SSLContext tls = SSLContext.getInstance("TLS");
        tls.init(managers.getKeyManagers(), null, new SecureRandom());

        HttpsServer server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(tls));
        server.createContext(
                "/health",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        hits.incrementAndGet();
                        byte[] body = "ok".getBytes(UTF8);
                        exchange.sendResponseHeaders(200, body.length);
                        OutputStream output = exchange.getResponseBody();
                        output.write(body);
                        output.close();
                    }
                });
        return server;
    }

    private void generateKeystore(File output) throws Exception {
        File keytool = keytool();
        Process process =
                new ProcessBuilder(
                                keytool.getAbsolutePath(),
                                "-genkeypair",
                                "-alias",
                                "fixture",
                                "-keyalg",
                                "RSA",
                                "-keysize",
                                "2048",
                                "-storetype",
                                "PKCS12",
                                "-keystore",
                                output.getAbsolutePath(),
                                "-storepass",
                                "changeit",
                                "-keypass",
                                "changeit",
                                "-validity",
                                "1",
                                "-dname",
                                "CN=localhost",
                                "-ext",
                                "SAN=ip:127.0.0.1,dns:localhost",
                                "-noprompt")
                        .redirectErrorStream(true)
                        .start();
        String toolOutput = read(process.getInputStream());
        int exit = process.waitFor();
        assertEquals(toolOutput, 0, exit);
        assertTrue("keystore was not created", output.isFile());
    }

    private File keytool() {
        String executable =
                System.getProperty("os.name", "").startsWith("Windows") ? "keytool.exe" : "keytool";
        File javaHome = new File(System.getProperty("java.home"));
        File tool = new File(new File(javaHome, "bin"), executable);
        if (!tool.isFile() && javaHome.getParentFile() != null) {
            tool = new File(new File(javaHome.getParentFile(), "bin"), executable);
        }
        assertTrue("keytool is unavailable", tool.isFile());
        return tool;
    }

    private String read(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int count;
        while ((count = input.read(buffer)) >= 0) {
            output.write(buffer, 0, count);
        }
        return new String(output.toByteArray(), UTF8);
    }

    private SecretProvider noSecrets() {
        return new SecretProvider() {
            public String getSecret(String name) {
                return null;
            }
        };
    }
}
