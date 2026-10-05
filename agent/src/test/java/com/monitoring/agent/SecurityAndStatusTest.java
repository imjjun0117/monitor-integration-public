package com.monitoring.agent;

import com.monitoring.agent.collection.SsrfGuard;
import com.monitoring.agent.metric.StatusEvaluator;
import com.monitoring.agent.security.TokenCipher;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SecurityAndStatusTest {
    @Test
    void tokenRoundTripAndWrongMasterKeyFailClosed() {
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        TokenCipher cipher = new TokenCipher(key);
        TokenCipher.EncryptedToken encrypted = cipher.encrypt("01234567890123456789012345678901");
        assertEquals(
                "01234567890123456789012345678901",
                cipher.decrypt(encrypted.ciphertext(), encrypted.iv()));
        byte[] other = new byte[32];
        other[0] = 1;
        assertThrows(
                IllegalStateException.class,
                () ->
                        new TokenCipher(Base64.getEncoder().encodeToString(other))
                                .decrypt(encrypted.ciphertext(), encrypted.iv()));
    }

    @Test
    void shortTokenAndBadMasterKeyAreRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new TokenCipher(Base64.getEncoder().encodeToString(new byte[16])));
        TokenCipher cipher = new TokenCipher(Base64.getEncoder().encodeToString(new byte[32]));
        assertThrows(IllegalArgumentException.class, () -> cipher.encrypt("short"));
    }

    @Test
    void ssrfRequiresExplicitCidrAndRejectsUnlistedMetadata() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new SsrfGuard("").validate("http://127.0.0.1:8080"));
        assertEquals(
                "127.0.0.1",
                new SsrfGuard("127.0.0.1/32").validate("http://127.0.0.1:8080").getHost());
        assertThrows(
                IllegalArgumentException.class,
                () -> new SsrfGuard("127.0.0.1/32").validate("http://169.254.169.254/latest"));
        assertThrows(
                IllegalArgumentException.class,
                () -> new SsrfGuard("0.0.0.0/0").validate("file:///tmp/x"));
    }

    @Test
    void statusPriorityAndFailureTransitionsFollowContract() {
        StatusEvaluator evaluator = new StatusEvaluator();
        assertEquals(StatusEvaluator.Status.UNKNOWN, evaluator.metric(null, .8, .9));
        assertEquals(StatusEvaluator.Status.WARN, evaluator.metric(.8, .8, .9));
        assertEquals(StatusEvaluator.Status.DOWN, evaluator.metric(.9, .8, .9));
        assertEquals(StatusEvaluator.Status.WARN, evaluator.connection(2, 30));
        assertEquals(StatusEvaluator.Status.DOWN, evaluator.connection(3, 30));
        assertEquals(
                StatusEvaluator.Status.DOWN,
                evaluator.worst(StatusEvaluator.Status.UNKNOWN, StatusEvaluator.Status.DOWN));
    }

    @Test
    void connectionStalenessUsesThreePollIntervalsWithASixtySecondFloor() {
        StatusEvaluator evaluator = new StatusEvaluator();
        assertEquals(StatusEvaluator.Status.UP, evaluator.connection(0, 59, 15));
        assertEquals(StatusEvaluator.Status.DOWN, evaluator.connection(0, 61, 15));
        assertEquals(StatusEvaluator.Status.UP, evaluator.connection(0, 359, 120));
        assertEquals(StatusEvaluator.Status.DOWN, evaluator.connection(0, 361, 120));
        assertEquals(
                StatusEvaluator.Status.UP, evaluator.connection(0, 2_147_483_646L, 715_827_882));
        assertEquals(
                StatusEvaluator.Status.DOWN, evaluator.connection(0, 2_147_483_647L, 715_827_882));
    }
}
