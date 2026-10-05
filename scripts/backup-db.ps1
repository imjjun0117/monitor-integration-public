param([string]$Directory = "backups")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path .env)) { throw ".env 파일이 필요합니다." }

$OutputDirectory = New-Item -ItemType Directory -Force $Directory
$File = Join-Path $OutputDirectory.FullName (
    "hermes-monitor-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".dump")
$ContainerFile = "/tmp/hermes-monitor-backup-$PID.dump"

try {
    & docker compose --env-file .env exec -T postgres pg_dump `
        -U hermes -d hermes_monitor --format=custom --file=$ContainerFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump 실패" }

    & docker compose --env-file .env exec -T postgres test -s $ContainerFile
    if ($LASTEXITCODE -ne 0) { throw "백업 파일이 비어 있습니다." }

    & docker compose --env-file .env exec -T postgres pg_restore `
        --list $ContainerFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "백업 archive 검증 실패" }

    & docker compose --env-file .env cp "postgres:$ContainerFile" $File
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $File) `
            -or (Get-Item $File).Length -eq 0) {
        throw "백업 파일 복사 실패"
    }
    Write-Host "백업 완료: $File"
} catch {
    Remove-Item $File -ErrorAction SilentlyContinue
    throw
} finally {
    & docker compose --env-file .env exec -T postgres rm -f $ContainerFile 2>$null
}
