package com.monitoring.agent.check;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class ServiceProfilesTest {
    private final ObjectMapper json = new ObjectMapper();

    private JsonNode profile(String source, String path, String kind) {
        return json.readTree(
                """
            {"title":"다른 업체","dashboard":true,"fields":[
            {"key":"remaining","label":"잔여 건수","source":"%s","path":"%s","kind":"%s","unit":"건","required":true}]}
            """
                        .formatted(source, path, kind));
    }

    private Map<String, Object> check(String details) {
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("check_id", "other-vendor");
        check.put("details", json.readTree(details));
        return check;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> metric(Map<String, Object> info, int index) {
        return ((List<Map<String, Object>>) info.get("metrics")).get(index);
    }

    @Test
    void readsOtherProvidersDetailsAndPreservesZeroAndBooleanFalse() {
        var profile = profile("DETAILS", "$.remaining", "NUMBER");
        ServiceProfiles.validate(profile);
        var info = ServiceProfiles.evaluate(profile, check("{\"remaining\":0}"));
        assertEquals(0d, metric(info, 0).get("value"));
        assertEquals("UP", info.get("status"));
        info =
                ServiceProfiles.evaluate(
                        profile("DETAILS", "$.enabled", "BOOLEAN"), check("{\"enabled\":false}"));
        assertEquals(false, metric(info, 0).get("value"));
    }

    @Test
    void selectsNestedJsonAndArraysOnlyFromCompleteSuccessfulResponses() {
        var profile = profile("RESPONSE_JSON", "$.data.quotas[0].left", "NUMBER");
        var check = check("{}");
        check.put(
                "http",
                json.createObjectNode()
                        .put("status_code", 200)
                        .put("response_body", "{\"data\":{\"quotas\":[{\"left\":\"37\"}]}}"));
        assertEquals(37d, metric(ServiceProfiles.evaluate(profile, check), 0).get("value"));
        ((tools.jackson.databind.node.ObjectNode) check.get("http"))
                .put("response_body_truncated", true);
        assertNull(metric(ServiceProfiles.evaluate(profile, check), 0).get("value"));
        ((tools.jackson.databind.node.ObjectNode) check.get("http"))
                .put("response_body_truncated", false)
                .put("status_code", 401);
        assertNull(metric(ServiceProfiles.evaluate(profile, check), 0).get("value"));
    }

    @Test
    void missingInvalidAndMaskedValuesRemainUnknown() {
        for (String value : List.of("null", "true", "\"\"", "\"***\"", "{}", "[]")) {
            var info =
                    ServiceProfiles.evaluate(
                            profile("DETAILS", "$.remaining", "NUMBER"),
                            check("{\"remaining\":" + value + "}"));
            assertNull(metric(info, 0).get("value"));
            assertEquals("UNKNOWN", info.get("status"));
        }
    }

    @Test
    void thresholdsAreInclusiveAndRequiredMissingValuesCannotAppearHealthy() {
        var profile = profile("DETAILS", "$.remaining", "NUMBER");
        var field = (tools.jackson.databind.node.ObjectNode) profile.path("fields").get(0);
        field.put("warning", 10).put("critical", 0).put("direction", "LOW");
        assertEquals(
                "DOWN",
                ServiceProfiles.evaluate(profile, check("{\"remaining\":0}")).get("status"));
        assertEquals(
                "WARN",
                ServiceProfiles.evaluate(profile, check("{\"remaining\":10}")).get("status"));
        assertEquals(
                "UP", ServiceProfiles.evaluate(profile, check("{\"remaining\":11}")).get("status"));
        field.put("direction", "HIGH").put("critical", 20);
        assertEquals(
                "DOWN",
                ServiceProfiles.evaluate(profile, check("{\"remaining\":20}")).get("status"));
    }

    @Test
    void conditionAndValueLabelsKeepBillingScopeExplicit() {
        var profile = profile("DETAILS", "$.remaining", "NUMBER");
        var field = (tools.jackson.databind.node.ObjectNode) profile.path("fields").get(0);
        field.putObject("when").put("path", "$.billing").putArray("values").add("PARTNER");
        assertNull(
                metric(
                                ServiceProfiles.evaluate(
                                        profile, check("{\"remaining\":0,\"billing\":\"MEMBER\"}")),
                                0)
                        .get("value"));
        field.put("path", "$.billing").put("kind", "TEXT");
        field.putObject("valueLabels").put("PARTNER", "파트너");
        assertEquals(
                "파트너",
                metric(ServiceProfiles.evaluate(profile, check("{\"billing\":\"PARTNER\"}")), 0)
                        .get("value"));
    }

    @Test
    void partnerPresetDoesNotAlertOnTheUnbilledMemberWallet() {
        var check =
                check(
                        """
            {"kind":"POPBILL_BALANCE","balance_source":"PARTNER","balance":186186,
             "minimum_balance":10000,"member_balance":0,"partner_balance":186186}
            """);
        ServiceProfiles.attach(List.of(check));
        @SuppressWarnings("unchecked")
        var info = (Map<String, Object>) check.get("service_info");
        assertEquals("UP", info.get("status"));
        assertEquals(186186d, metric(info, 0).get("value"));
        assertEquals("파트너", metric(info, 2).get("value"));
        var legacy = check("{\"kind\":\"POPBILL_BALANCE\",\"balance\":0,\"ats_unit_cost\":10}");
        ServiceProfiles.attach(List.of(legacy));
        assertEquals("UNKNOWN", ((Map<?, ?>) legacy.get("service_info")).get("status"));
    }

    @Test
    void explicitNullDisablesPresetsAndUnconfiguredVendorsHaveNoInventedCard() {
        var disabled = check("{\"kind\":\"POPBILL_BALANCE\"}");
        disabled.put("service_profile_json", "null");
        var other = check("{\"remaining\":35}");
        ServiceProfiles.attach(List.of(disabled, other));
        assertFalse(disabled.containsKey("service_info"));
        assertFalse(other.containsKey("service_info"));
    }

    @Test
    void rejectsSensitiveAndUnsupportedPathsDuplicatesAndInvertedThresholds() {
        for (String path :
                List.of("$.token", "$.password", "$..balance", "$.data[*]", "$.value()")) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ServiceProfiles.validate(profile("DETAILS", path, "NUMBER")));
        }
        var profile = profile("DETAILS", "$.token_count", "NUMBER");
        ServiceProfiles.validate(profile);
        ((tools.jackson.databind.node.ObjectNode) profile.path("fields").get(0))
                .put("warning", 10)
                .put("critical", 20);
        assertThrows(IllegalArgumentException.class, () -> ServiceProfiles.validate(profile));
        ((tools.jackson.databind.node.ObjectNode) profile.path("fields").get(0)).remove("critical");
        ((tools.jackson.databind.node.ArrayNode) profile.path("fields"))
                .add(profile.path("fields").get(0).deepCopy());
        assertThrows(IllegalArgumentException.class, () -> ServiceProfiles.validate(profile));
    }
}
