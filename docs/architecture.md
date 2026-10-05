# 구조

대상 애플리케이션의 `monitor-agent.jar`는 `/monitor/v1` 네 API만 제공합니다. 중앙 서버가 15초마다 Pull하고 PostgreSQL에 최신값과 1분 이력을 저장합니다. 브라우저는 에이전트에 직접 접속하지 않습니다.

식별자는 `project_id → instance_id` 두 단계뿐입니다. 중앙은 에이전트 URL을 요청마다 한 번만 DNS resolve하고 모든 answer가 CIDR 허용 목록에 포함된 경우 그 검증된 IP로 직접 연결합니다. HTTP `Host`와 HTTPS hostname verification/SNI에는 원래 hostname을 사용하며 redirect와 1MB 초과 응답을 거부합니다. metadata/link-local/any-local/multicast는 항상 차단하고 loopback은 IPv4 `/32` 또는 IPv6 `/128`로 정확히 허용해야 합니다. 토큰은 AES-256-GCM으로 저장합니다.

인증서 즉시 검사는 bounded executor에 접수한 뒤 HTTP 202를 반환합니다. scheduler는 기본 60초마다 due target을 찾고 target별 `check_interval_minutes`(기본 360분)를 적용합니다. 성공 latest에는 leaf serial과 전체 validity window, chain/hostname 검증 및 상태를 저장하고 실패 latest에는 인증서 값 대신 NULL과 `DOWN`을 저장합니다.
