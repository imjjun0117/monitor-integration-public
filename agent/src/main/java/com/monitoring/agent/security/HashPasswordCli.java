package com.monitoring.agent.security;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

// 관리자 설정에 사용할 비밀번호 해시 생성
public final class HashPasswordCli {
    private HashPasswordCli() {}

    public static void main(String[] arguments) throws Exception {
        String password = new BufferedReader(new InputStreamReader(System.in)).readLine();
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("PASSWORD_REQUIRED");
        }
        String encoded = new BCryptPasswordEncoder().encode(password);
        System.out.print(encoded);
    }
}
