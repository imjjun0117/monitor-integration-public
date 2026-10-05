$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts/process-helpers.ps1')

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Wait-Started([int]$Id) {
    $Deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        if (Get-Process -Id $Id -ErrorAction SilentlyContinue) { return }
        Start-Sleep -Milliseconds 25
    } while ([DateTime]::UtcNow -lt $Deadline)
    throw "process $Id did not start"
}

function Wait-File([string]$Path) {
    $Deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        if (Test-Path $Path) { return }
        Start-Sleep -Milliseconds 25
    } while ([DateTime]::UtcNow -lt $Deadline)
    throw "file $Path was not created"
}

if ($IsWindows) {
    Write-Host 'dev-down graceful signal tests: SKIP (Unix signal fixture)'
    exit 0
}

$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-dev-down-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $Temp | Out-Null
try {
    $Marker = Join-Path $Temp 'term-received'
    $Ready = Join-Path $Temp 'graceful-ready'
    $GracefulScript = Join-Path $Temp 'graceful.sh'
    @"
#!/bin/sh
trap 'printf received > "$Marker"; exit 0' TERM
printf ready > "$Ready"
while :; do sleep 1; done
"@ | Set-Content $GracefulScript
    & chmod +x $GracefulScript
    $Graceful = Start-Process -PassThru -FilePath $GracefulScript
    Wait-Started $Graceful.Id
    Wait-File $Ready
    $Forced = Stop-ProcessTreeGracefully -Id $Graceful.Id -GraceSeconds 3
    Assert-True ($Forced -eq 0) 'cooperative process was force-killed'
    Assert-True (Test-Path $Marker) 'TERM was not observed by cooperative process'
    Assert-True (-not (Test-ProcessAlive $Graceful.Id)) 'cooperative process survived shutdown'

    $IgnoringReady = Join-Path $Temp 'ignoring-ready'
    $IgnoringScript = Join-Path $Temp 'ignoring.py'
    @"
import pathlib, signal, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
pathlib.Path(r'$IgnoringReady').write_text('ready')
while True:
    time.sleep(1)
"@ | Set-Content $IgnoringScript
    $Ignoring = Start-Process -PassThru -FilePath python3 -ArgumentList @($IgnoringScript)
    Wait-Started $Ignoring.Id
    Wait-File $IgnoringReady
    $Forced = Stop-ProcessTreeGracefully -Id $Ignoring.Id -GraceSeconds 1
    Assert-True ($Forced -eq 1) 'TERM-ignoring process did not use bounded force escalation'
    Assert-True (-not (Test-ProcessAlive $Ignoring.Id)) 'force escalation did not terminate process'

    Write-Host 'dev-down graceful signal tests: 2/2 PASS'
} finally {
    if ($null -ne $Graceful) { Stop-Process -Id $Graceful.Id -Force -ErrorAction SilentlyContinue }
    if ($null -ne $Ignoring) { Stop-Process -Id $Ignoring.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue
}
