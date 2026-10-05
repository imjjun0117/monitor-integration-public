param(
    [Parameter(Mandatory = $true)][string]$File,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ResolvedFile = (Resolve-Path $File -ErrorAction Stop).Path
if (-not $ConfirmRestore) {
    throw "복구는 기존 DB 객체를 교체합니다. -ConfirmRestore를 명시하세요."
}
Set-Location $Root
if (-not (Test-Path .env)) { throw ".env 파일이 필요합니다." }

$ContainerFile = "/tmp/hermes-monitor-restore-$PID.dump"
try {
    & docker compose --env-file .env cp $ResolvedFile "postgres:$ContainerFile"
    if ($LASTEXITCODE -ne 0) { throw "복구 archive 복사 실패" }

    & docker compose --env-file .env exec -T postgres pg_restore `
        --list $ContainerFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "복구 archive 검증 실패" }

    & docker compose --env-file .env exec -T postgres pg_restore `
        --clean --if-exists --single-transaction --exit-on-error `
        --no-owner --no-privileges -U hermes -d hermes_monitor $ContainerFile
    if ($LASTEXITCODE -ne 0) { throw "transactional DB 복구 실패" }

    & docker compose --env-file .env exec -T postgres psql `
        -U hermes -d hermes_monitor -v ON_ERROR_STOP=1 `
        -c "select count(*) from flyway_schema_history" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "복구 후 schema 확인 실패" }
    Write-Host "복구 완료"
} finally {
    & docker compose --env-file .env exec -T postgres rm -f $ContainerFile 2>$null
}
