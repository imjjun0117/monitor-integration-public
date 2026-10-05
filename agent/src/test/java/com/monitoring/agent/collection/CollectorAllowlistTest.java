package com.monitoring.agent.collection;

import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CollectorAllowlistTest {
    @TempDir Path directory;

    @Test
    void editsAndRevocationsApplyToExistingGuard() throws Exception {
        Path file =
                write(
                        """
            {"allowed_cidrs": [], "allowed_hosts": []}
            """);
        SsrfGuard guard = guard(file, "93.184.216.34");
        rejected("ADDRESS_NOT_ALLOWED", () -> guard.resolve("https://agent.example"));
        write(
                """
            {"allowed_cidrs": [], "allowed_hosts": ["agent.example"]}
            """);
        assertEquals(
                "93.184.216.34", guard.resolve("https://agent.example").address().getHostAddress());
        write(
                """
            {"allowed_cidrs": [], "allowed_hosts": []}
            """);
        rejected("ADDRESS_NOT_ALLOWED", () -> guard.resolve("https://agent.example"));
    }

    @Test
    void fileOverridesLegacyEnvironmentLists() throws Exception {
        Path file =
                write(
                        """
            {"allowed_cidrs": [], "allowed_hosts": []}
            """);
        SsrfGuard guard =
                new SsrfGuard(
                        "127.0.0.1/32",
                        "agent.example",
                        ignored -> new InetAddress[] {InetAddress.getByName("127.0.0.1")},
                        file);
        rejected("ADDRESS_NOT_ALLOWED", () -> guard.resolve("http://127.0.0.1"));
    }

    @Test
    void explicitPrivateAndLoopbackAddressesCanBeManagedInFile() throws Exception {
        Path file =
                write(
                        """
            {"allowed_cidrs": ["10.0.0.7/32", "127.0.0.1/32"], "allowed_hosts": []}
            """);
        assertEquals(
                "10.0.0.7",
                guard(file, "10.0.0.7")
                        .resolve("http://internal.example:8080")
                        .address()
                        .getHostAddress());
        assertEquals(
                "127.0.0.1",
                guard(file, "127.0.0.1")
                        .resolve("http://127.0.0.1:18081")
                        .address()
                        .getHostAddress());
    }

    @Test
    void fileDoesNotBypassHttpsOrMetadataRestrictions() throws Exception {
        Path file =
                write(
                        """
            {"allowed_cidrs": ["0.0.0.0/0"], "allowed_hosts": ["agent.example"]}
            """);
        rejected(
                "AGENT_URL_REJECTED",
                () -> guard(file, "93.184.216.34").resolve("http://agent.example"));
        rejected(
                "ADDRESS_NOT_ALLOWED",
                () -> guard(file, "169.254.169.254").resolve("http://169.254.169.254"));
        rejected(
                "ADDRESS_NOT_ALLOWED",
                () -> guard(file, "10.0.0.7").resolve("https://agent.example"));
    }

    @Test
    void invalidFileBlocksRequestsAndRecoveryNeedsNoRestart() throws Exception {
        Path file =
                write(
                        """
            {"allowed_cidrs": ["127.0.0.1/32"], "allowed_hosts": []}
            """);
        SsrfGuard guard = guard(file, "127.0.0.1");
        write("{");
        rejected("ALLOWLIST_CONFIG_ERROR", () -> guard.resolve("http://127.0.0.1"));
        write(
                """
            {"allowed_cidrs": ["127.0.0.1/32"], "allowed_hosts": []}
            """);
        assertEquals("127.0.0.1", guard.resolve("http://127.0.0.1").address().getHostAddress());
        Files.delete(file);
        rejected("ALLOWLIST_CONFIG_ERROR", () -> guard.resolve("http://127.0.0.1"));
    }

    @Test
    void invalidOrMissingFileFailsAtStartup() throws Exception {
        rejected(
                "ALLOWLIST_CONFIG_ERROR",
                () -> guard(directory.resolve("missing.json"), "127.0.0.1"));
        for (String json :
                new String[] {
                    "null",
                    "[]",
                    "{}",
                    "{\"allowed_cidrs\": [], \"allowed_host\": []}",
                    "{\"allowed_cidrs\": \"127.0.0.1/32\", \"allowed_hosts\": []}",
                    "{\"allowed_cidrs\": [null], \"allowed_hosts\": []}",
                    "{\"allowed_cidrs\": [\"127.0.0.1/32,10.0.0.7/32\"], \"allowed_hosts\": []}",
                    "{\"allowed_cidrs\": [\"not-a-cidr\"], \"allowed_hosts\": []}",
                    "{\"allowed_cidrs\": [], \"allowed_hosts\": [\"https://agent.example\"]}",
                    "{\"allowed_cidrs\": [], \"allowed_hosts\": [\"*.example\"]}",
                    "{\"allowed_cidrs\": [], \"allowed_hosts\": [\"\"]}",
                    "{\"allowed_cidrs\": [], \"allowed_hosts\": []} {}",
                    "{\"allowed_cidrs\": [], \"allowed_hosts\": [], \"extra\": []}",
                }) {
            Path file = write(json);
            rejected("ALLOWLIST_CONFIG_ERROR", () -> guard(file, "127.0.0.1"));
        }
    }

    private Path write(String json) throws Exception {
        Path file = directory.resolve("allowlist.json");
        Files.writeString(file, json);
        return file;
    }

    private SsrfGuard guard(Path file, String ip) {
        return new SsrfGuard(
                "", "", ignored -> new InetAddress[] {InetAddress.getByName(ip)}, file);
    }

    private void rejected(String code, org.junit.jupiter.api.function.Executable operation) {
        assertEquals(code, assertThrows(IllegalArgumentException.class, operation).getMessage());
    }
}
