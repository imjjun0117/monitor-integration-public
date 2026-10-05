package com.hermes.monitoring.agent;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class SecretMaskerTest {
    @Test
    public void masksSensitiveHeadersQueriesBodiesAndErrorText() {
        String value =
                "Authorization: Bearer header-value\n"
                        + "https://service.example/path?accessKey=query-value&safe=query-safe\n"
                        + "{\"password\":\"body-value\",\"safe\":\"body-safe\"}\n"
                        + "token=form-value&safe=form-safe\n"
                        + "failure api_key: error-value serviceKey=log-value";

        String masked = SecretMasker.mask(value);

        for (String secret :
                new String[] {
                    "header-value",
                    "query-value",
                    "query-safe",
                    "body-value",
                    "form-value",
                    "error-value",
                    "log-value"
                }) {
            assertFalse(secret + " leaked in " + masked, masked.contains(secret));
        }
        assertTrue(masked, masked.contains("body-safe"));
        assertTrue(masked, masked.contains("form-safe"));
    }

    @Test
    public void checkResultsNeverExposeMaskedSecretValues() {
        CheckResult result =
                new CheckResult(
                        "partner-api",
                        "DOWN",
                        1L,
                        "Authorization=Bearer result-secret password: second-secret");
        assertFalse(result.getMessage().contains("result-secret"));
        assertFalse(result.getMessage().contains("second-secret"));
    }

    @Test
    public void masksEscapedJsonAndCommonApiKeySpellingsInEveryPublicationForm() {
        String value =
                "{\\\"password\\\":\\\"escaped-json-secret\\\","
                        + "\\\"safe\\\":\\\"visible\\\"}\n"
                        + "X-Api-Key: header-secret\n"
                        + "https://service.example/path?X-Api-Key=query-secret&safe=query-safe\n"
                        + "{\"x-api-key\":\"body-secret\\\"tail\",\"safe\":\"body-safe\"}\n"
                        + "x_api_key=form-secret&safe=form-safe\n"
                        + "request failed: X-Api-Key=error-secret";

        String masked = SecretMasker.mask(value);

        for (String secret :
                new String[] {
                    "escaped-json-secret",
                    "header-secret",
                    "query-secret",
                    "query-safe",
                    "body-secret",
                    "tail",
                    "form-secret",
                    "error-secret"
                }) {
            assertFalse(secret + " leaked in " + masked, masked.contains(secret));
        }
        assertTrue(masked, masked.contains("visible"));
        assertTrue(masked, masked.contains("body-safe"));
        assertTrue(masked, masked.contains("form-safe"));
    }

    @Test
    public void escapedQuoteAndCommaInsideSecretCannotEndMaskingEarly() {
        String value =
                "{\\\"password\\\":\\\"abc\\\\\\\",def\\\","
                        + "\\\"X-Api-Key\\\":\\\"ghi\\\\\\\",jkl\\\"}";
        String masked = SecretMasker.mask(value);
        assertFalse(masked, masked.contains("abc"));
        assertFalse(masked, masked.contains("def"));
        assertFalse(masked, masked.contains("ghi"));
        assertFalse(masked, masked.contains("jkl"));
    }
}
