package com.hermes.monitoring.agent;

// 점검 실행마다 환경변수의 인증 정보 조회
public final class EnvironmentSecretProvider implements SecretProvider {
    public String getSecret(String name) {
        if (!validName(name)) {
            return null;
        }
        String property = System.getProperty("monitor.secret." + name);
        if (property != null && property.length() > 0) {
            return property;
        }
        StringBuilder environment = new StringBuilder("HERMES_MONITOR_SECRET_");
        for (int index = 0; index < name.length(); index++) {
            char value = name.charAt(index);
            environment.append(
                    Character.isLetterOrDigit(value) ? Character.toUpperCase(value) : '_');
        }
        return System.getenv(environment.toString());
    }

    private boolean validName(String name) {
        if (name == null || name.length() == 0 || name.length() > 120) {
            return false;
        }
        for (int index = 0; index < name.length(); index++) {
            char value = name.charAt(index);
            if (!Character.isLetterOrDigit(value) && value != '.' && value != '-' && value != '_') {
                return false;
            }
        }
        return true;
    }
}
