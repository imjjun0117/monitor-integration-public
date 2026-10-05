# IP 주소로 HTTPS 서버 실행

프로젝트 루트의 `.env`에 기존 비밀번호·키 설정과 `HERMES_PUBLIC_IP`를 넣습니다. `.env`는 Git에 올리지 않습니다.

공유기에서 외부 TCP 80·443을 서버 PC의 80·443으로 포트포워딩합니다. 현재 Mac 내부 IP는 `192.168.1.20`입니다. 공유기 DHCP 설정에서 이 주소를 고정하고, 외부 80·443을 사용하는 공유기 원격 관리 기능이 있다면 포트를 변경합니다.

```sh
docker compose -f compose.server.yaml up -d --build
docker compose -f compose.server.yaml logs -f https
```

Caddy가 Let's Encrypt의 무료 IP 인증서를 발급하고 자동 갱신합니다. 외부에서 해당 IP의 80·443으로 이 서버에 접속할 수 있어야 발급·갱신됩니다. 발급 후 `https://203.0.113.10/login`으로 접속합니다. 공인 IP가 바뀌면 `.env`의 `HERMES_PUBLIC_IP`를 변경하고 위 실행 명령을 다시 실행합니다.

DB는 별도 Docker 볼륨에 보관됩니다. 처음 실행하면 빈 DB와 설정한 관리자 계정이 생성되며, 프로젝트와 인스턴스를 다시 등록하면 됩니다. 외부에는 80·443만 공개하고 DB·애플리케이션 포트는 Docker 내부에서 사용합니다.

```sh
# 인증서 검증을 포함한 접속 확인
curl -I https://203.0.113.10/login
# 종료: 데이터를 유지합니다. down에 -v를 붙이면 DB·인증서 볼륨이 삭제됩니다.
docker compose -f compose.server.yaml down
```

Mac에서는 Docker Desktop이 실행되어 있어야 합니다. 재부팅 후 자동 실행하려면 Docker Desktop의 로그인 시 시작 옵션을 켭니다.
