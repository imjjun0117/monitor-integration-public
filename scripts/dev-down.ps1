param([switch]$DeleteData)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot 'process-helpers.ps1')

function Stop-TrackedProcessTree([int]$Id) {
    $ForcedCount = Stop-ProcessTreeGracefully -Id $Id -GraceSeconds 5
    if ($ForcedCount -gt 0) {
        Write-Warning "PID $Id process tree의 $ForcedCount 개 process가 5초 내 종료되지 않아 강제 종료했습니다."
    }
}

if (Test-Path .run/pids) {
    Get-Content .run/pids | ForEach-Object {
        $ProcessId = [int](($_ -split '=')[1])
        Stop-TrackedProcessTree -Id $ProcessId
    }
    Remove-Item .run/pids
}

# Compose validates profile interpolation even during `down`. Older local .env files
# can predate this sample-only key, so provide a process-local non-secret placeholder.
if ([string]::IsNullOrWhiteSpace($env:HERMES_SAMPLE_AGENT_TOKEN)) {
    $env:HERMES_SAMPLE_AGENT_TOKEN = 'x' * 32
}

if ($DeleteData) {
    $Answer = Read-Host "DB 데이터를 삭제하려면 DELETE를 입력"
    if ($Answer -ne 'DELETE') { throw "취소됨" }
    & docker compose --env-file .env --profile samples down --volumes
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose 종료/데이터 삭제 실패" }
} else {
    & docker compose --env-file .env --profile samples down
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose 종료 실패" }
}
