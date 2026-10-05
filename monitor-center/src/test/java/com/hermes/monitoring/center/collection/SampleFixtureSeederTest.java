package com.hermes.monitoring.center.collection;

import com.hermes.monitoring.center.security.TokenCipher;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SampleFixtureSeederTest {
    @Test
    void encryptsIndependentTokenValuesForAllFourFixtureInstances() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        TokenCipher cipher = mock(TokenCipher.class);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
        when(cipher.encrypt(anyString()))
                .thenReturn(new TokenCipher.EncryptedToken(new byte[32], new byte[12]));

        new SampleFixtureSeeder(db, cipher, "explicit-test-token-value-32-bytes").run();

        verify(cipher, times(4)).encrypt("explicit-test-token-value-32-bytes");
        verify(db, times(6)).update(anyString(), any(Object[].class));
    }

    @Test
    void enabledSeederFailsClosedWhenTokenIsMissing() {
        SampleFixtureSeeder seeder =
                new SampleFixtureSeeder(mock(JdbcTemplate.class), mock(TokenCipher.class), "");
        assertThrows(IllegalStateException.class, seeder::run);
    }
}
