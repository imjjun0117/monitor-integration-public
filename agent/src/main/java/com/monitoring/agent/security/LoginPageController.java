package com.monitoring.agent.security;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.web.util.HtmlUtils;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

// 로그인 화면 요청 처리
@Controller
public class LoginPageController {
    private final String template;

    public LoginPageController() throws IOException {
        try (var input = new ClassPathResource("login-page.html").getInputStream()) {
            template = StreamUtils.copyToString(input, StandardCharsets.UTF_8);
        }
    }

    @GetMapping(value = "/login", produces = "text/html;charset=UTF-8")
    @ResponseBody
    String login(HttpServletRequest request) {
        CsrfToken csrf = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrf == null) {
            csrf = (CsrfToken) request.getAttribute("_csrf");
        }
        String token = csrf == null ? "" : HtmlUtils.htmlEscape(csrf.getToken());
        String error =
                request.getParameter("error") == null
                        ? ""
                        : """
            <p class="login-error" role="alert">아이디 또는 비밀번호를 확인해 주세요.</p>
            """;
        return template.replace("{{CSRF_TOKEN}}", token).replace("{{ERROR}}", error);
    }
}
