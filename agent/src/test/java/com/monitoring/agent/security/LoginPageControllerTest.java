package com.monitoring.agent.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.DefaultCsrfToken;

class LoginPageControllerTest {
    @Test
    void loginTemplateKeepsNativePostAndEscapesServerRenderedCsrf() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        CsrfToken csrf = new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", "\"><script>alert(1)</script>");
        request.setAttribute(CsrfToken.class.getName(), csrf);

        String html = new LoginPageController().login(request);

        assertTrue(html.contains("<form method=\"post\" action=\"/api/v1/session/login\""));
        assertTrue(html.contains("name=\"_csrf\" value=\"&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;\""));
        assertFalse(html.contains("\"><script>alert(1)</script>"));
        assertTrue(html.contains("id=\"login-root\""));
        assertTrue(html.contains("<label for=\"username\">아이디</label>"));
        assertTrue(html.contains("name=\"username\" type=\"text\" autocomplete=\"username\" required"));
        assertTrue(html.contains("<label for=\"password\">비밀번호</label>"));
        assertTrue(html.contains("name=\"password\" type=\"password\" autocomplete=\"current-password\" required"));
        assertTrue(html.contains("<button type=\"submit\""));
        assertTrue(html.contains("src=\"/assets/login.js\""));
        assertFalse(html.contains("<style>"));
    }

    @Test
    void errorParameterNeverAppearsInLoginHtml() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("error", "<script>alert(1)</script>");

        String html = new LoginPageController().login(request);

        assertTrue(html.contains("data-login-error=\"true\""));
        assertTrue(html.contains("role=\"alert\">아이디 또는 비밀번호를 확인해 주세요."));
        assertFalse(html.contains("<script>alert(1)</script>"));
        assertFalse(html.contains("{{ERROR}}"));
    }
}
