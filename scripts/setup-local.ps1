$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Maven = if ($IsWindows) { Join-Path $Root 'mvnw.cmd' } else { Join-Path $Root 'mvnw' }

function Import-DotEnv([string]$Path) {
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $parts = $line.Split('=', 2)
            $value = $parts[1].Trim()
            if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Substring(1, $value.Length - 2) }
            [Environment]::SetEnvironmentVariable($parts[0], $value, 'Process')
        }
    }
}
function New-Random([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    [Convert]::ToBase64String($buffer)
}

$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) { throw "JDK 21이 필요합니다." }
$JavaVersionOutput = (& java -version 2>&1)
if ($LASTEXITCODE -ne 0) { throw "JDK 21이 필요합니다." }
$version = ($JavaVersionOutput | Select-Object -First 1) -join ""
if ($version -notmatch '"21[\.]') { throw "JDK 21이 필요합니다. 현재: $version" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker가 필요합니다." }
& docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose가 필요합니다." }

$created = $false
$password = $null
if (-not (Test-Path .env)) {
    $db = New-Random 24
    $master = New-Random 32
    $password = New-Random 18
    $sampleToken = New-Random 32
    $hash = $password | & $Maven -q -pl monitor-center -DskipTests exec:java -Dexec.mainClass=com.hermes.monitoring.center.security.HashPasswordCli
    if ($LASTEXITCODE -ne 0 -or -not $hash.StartsWith('$2')) { throw "BCrypt 해시 생성 실패" }
    @(
        "HERMES_DB_PASSWORD='$db'",
        "HERMES_MASTER_KEY='$master'",
        "HERMES_ADMIN_USERNAME='admin'",
        "HERMES_ADMIN_PASSWORD_HASH='$hash'",
        "HERMES_AGENT_ALLOWLIST_FILE='config/agent-allowlist.json'",
        "HERMES_SAMPLE_AGENT_TOKEN='$sampleToken'",
        "HERMES_SAMPLE_FIXTURES_ENABLED='false'",
        "SPRING_PROFILES_ACTIVE='local'"
    ) | Set-Content -Encoding utf8 .env
    $created = $true
} else {
    Write-Host ".env가 이미 있어 보존합니다."
}
Import-DotEnv .env

& docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL 시작 실패" }
$ready = $false
for ($i = 0; $i -lt 12; $i++) {
    & docker compose exec -T postgres pg_isready -U hermes -d hermes_monitor *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep 5
}
if (-not $ready) { throw "PostgreSQL이 60초 안에 준비되지 않았습니다." }
& $Maven verify
if ($LASTEXITCODE -ne 0) { throw "빌드/테스트 실패" }
Write-Host "접속 주소: http://localhost:8080"
Write-Host "초기 사용자명: $env:HERMES_ADMIN_USERNAME"
if ($created) { Write-Host "최초 비밀번호(이번 한 번만 표시): $password" }
