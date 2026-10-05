# 프로젝트 코드 작업 지침

- 코드 작성 및 검토 시 [CODE_CONVENTIONS.md](CODE_CONVENTIONS.md) 준수.
- 설명 주석은 한국어로 작성하고 ‘조회’, ‘반환’, ‘검증’, ‘차단’처럼 간결한 문투 사용.
- 주요 처리의 역할과 조건, 보안·동시성·호환성 제약을 설명. 이름만 반복하는 기계적인 주석 지양.
- 자동 생성 코드와 라이선스·도구 지시문 유지.
- Collector의 Java 7 API·바이트코드 호환성과 기존 Configurer 공개 API 유지.
- 신규 및 수정 코드도 조건문·반복문에 중괄호 사용. 한 줄 메서드와 여러 문장 압축 금지.
- 긴 선언과 호출은 인자별 줄바꿈하고 처리 단계 사이에 빈 줄 배치. 자세한 기준은 CODE_CONVENTIONS.md 참조.
- 프론트엔드 수정 후 `npm run format`으로 정리하고 `npm run lint`로 확인. 자동 생성 코드는 제외.

## 공개용 저장소

- 현재 저장소는 공개 샘플이며 `public` 브랜치 사용.
- Private 운영 저장소의 브랜치·태그·커밋 이력을 push·merge·cherry-pick하지 않음.
- 실제 고객사명, 운영 주소, 토큰, 로컬 설정, 로그, DB 백업과 회사 브랜딩을 포함하지 않음.
- Collector 패키지는 `com.monitoring.collector` 사용. 기존 운영용 Collector와 교체하지 않음.
- 배포 예시의 주소는 문서용 예시이며 실제 서버 주소를 공개 문서에 기록하지 않음.

## 역할과 패키지

- 중앙 대시보드 서버는 Agent이며 `agent/`, `com.monitoring.agent` 사용.
- 대상 WAS의 수집 JAR은 Collector이며 `collector/`, `com.monitoring.collector` 사용.
- 예제 WAS는 `collector-testapp/` 사용. 신규 클래스, 문서, UI에서 역할을 반대로 표기하지 않음.
- 패키지 전환 후 기존 Configurer는 새 SDK로 다시 컴파일. 운영 DB, 적용된 Flyway SQL, `/monitor/v1` 통신 규격과 기존 설정 키는 명칭 정리를 이유로 변경하지 않음.
