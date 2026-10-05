$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$DevUpSource = Join-Path $RepositoryRoot 'scripts/dev-up.ps1'
$HelpersSource = Join-Path $RepositoryRoot 'scripts/process-helpers.ps1'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Get-FreePort {
    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    try { return ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port } finally { $Listener.Stop() }
}

function Test-PortOpen([int]$Port) {
    $Client = [System.Net.Sockets.TcpClient]::new()
    try {
        $Task = $Client.ConnectAsync('127.0.0.1', $Port)
        return $Task.Wait(200)
    } catch {
        return $false
    } finally {
        $Client.Dispose()
    }
}

function Wait-Port([int]$Port, [bool]$Open) {
    $Deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        if ((Test-PortOpen -Port $Port) -eq $Open) { return }
        Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $Deadline)
    throw "port $Port did not reach open=$Open"
}

function Stop-TestProcessTree([int]$Id) {
    $Children = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $null -ne $_.Parent -and $_.Parent.Id -eq $Id
    })
    foreach ($Child in $Children) { Stop-TestProcessTree -Id $Child.Id }
    Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
}

function New-Fixture {
    $Root = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-dev-up-test-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path (Join-Path $Root 'scripts') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $Root 'agent/frontend') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $Root 'bin') | Out-Null
    Copy-Item $DevUpSource (Join-Path $Root 'scripts/dev-up.ps1')
    Copy-Item $HelpersSource (Join-Path $Root 'scripts/process-helpers.ps1')
    @'
HERMES_DB_PASSWORD='test-only-not-a-secret'
HERMES_SAMPLE_AGENT_TOKEN='test-only-token-32-bytes-long-000'
'@ | Set-Content (Join-Path $Root '.env')
    @'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
port = int(sys.argv[1]); kind = sys.argv[2]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if kind == 'agent' and self.headers.get('X-Monitor-Token') != 'test-only-token-32-bytes-long-000':
            self.send_response(401); self.end_headers(); return
        body = json.dumps({'status': 'UP'}).encode() if kind == 'backend' else b'ok'
        content_type = 'application/vnd.spring-boot.actuator.v3+json' if kind == 'backend' else 'text/plain'
        self.send_response(200); self.send_header('Content-Type', content_type); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args): pass
HTTPServer(('127.0.0.1', port), Handler).serve_forever()
'@ | Set-Content (Join-Path $Root 'scripts/fake-server.py')
    @'
#!/bin/sh
if [ "$HERMES_TEST_FAIL_BACKEND" = "1" ]; then
  echo "expected fixture backend failure" >&2
  exit 23
fi
exec python3 scripts/fake-server.py "$SERVER_PORT" backend
'@ | Set-Content (Join-Path $Root 'mvnw')
    @'
#!/bin/sh
port=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--port" ]; then shift; port="$1"; fi
  shift
done
exec python3 "$HERMES_TEST_ROOT/scripts/fake-server.py" "$port" frontend
'@ | Set-Content (Join-Path $Root 'bin/npm')
    @'
#!/bin/sh
printf '%s\n' "$*" >> "$HERMES_TEST_ROOT/docker.log"
state="$HERMES_TEST_ROOT/compose.state"
case " $* " in
  *" ps --services --status running "*)
    if [ -n "$HERMES_TEST_COMPOSE_RUNNING" ]; then
      printf '%s\n' $HERMES_TEST_COMPOSE_RUNNING
    elif [ -f "$state" ]; then
      printf '%s\n' postgres collector-a1 collector-a2 collector-b1 collector-b2
    fi
    ;;
  *" up -d "*)
    printf '%s\n' postgres collector-a1 collector-a2 collector-b1 collector-b2 > "$state"
    ;;
  *" stop "*) rm -f "$state" ;;
esac
exit 0
'@ | Set-Content (Join-Path $Root 'bin/docker')
    & chmod +x (Join-Path $Root 'mvnw') (Join-Path $Root 'bin/npm') (Join-Path $Root 'bin/docker')
    return $Root
}

function Read-Pids([string]$Root) {
    $Result = @{}
    Get-Content (Join-Path $Root '.run/pids') | ForEach-Object {
        $Parts = $_ -split '=', 2
        $Result[$Parts[0]] = [int]$Parts[1]
    }
    return $Result
}

function Invoke-FixtureDevUp([string]$Root, [int]$BackendPort, [int]$FrontendPort) {
    $OldPath = $env:PATH
    $OldRoot = $env:HERMES_TEST_ROOT
    try {
        $env:PATH = (Join-Path $Root 'bin') + [System.IO.Path]::PathSeparator + $OldPath
        $env:HERMES_TEST_ROOT = $Root
        & (Join-Path $Root 'scripts/dev-up.ps1') `
            -BackendPort $BackendPort -FrontendPort $FrontendPort `
            -AgentPorts @() -ReadinessTimeoutSeconds 4
    } finally {
        $env:PATH = $OldPath
        $env:HERMES_TEST_ROOT = $OldRoot
        Set-Location $RepositoryRoot
    }
}

$Passed = 0

# Existing healthy owned stack is a no-op and preserves both tracked PIDs.
$Fixture = New-Fixture
try {
    $BackendPort = Get-FreePort
    $FrontendPort = Get-FreePort
    Invoke-FixtureDevUp $Fixture $BackendPort $FrontendPort
    $Before = Read-Pids $Fixture
    Invoke-FixtureDevUp $Fixture $BackendPort $FrontendPort
    $After = Read-Pids $Fixture
    Assert-True ($Before.backend -eq $After.backend) 'backend PID changed on idempotent start'
    Assert-True ($Before.frontend -eq $After.frontend) 'frontend PID changed on idempotent start'
    Assert-True ((Get-Process -Id $After.backend -ErrorAction SilentlyContinue) -ne $null) 'backend PID is dead'
    Assert-True ((Get-Process -Id $After.frontend -ErrorAction SilentlyContinue) -ne $null) 'frontend PID is dead'
    $ComposeUpCount = @((Get-Content (Join-Path $Fixture 'docker.log')) | Where-Object { $_ -match '(^| )up -d( |$)' }).Count
    Assert-True ($ComposeUpCount -eq 1) 'healthy idempotent start recreated Compose services'
    $Passed++
} finally {
    if (Test-Path (Join-Path $Fixture '.run/pids')) {
        $Pids = Read-Pids $Fixture
        foreach ($Value in $Pids.Values) { Stop-TestProcessTree $Value }
    }
    Remove-Item -Recurse -Force $Fixture -ErrorAction SilentlyContinue
}

# An untracked listener fails closed before any PID file is created.
$Fixture = New-Fixture
$Foreign = $null
try {
    $BackendPort = Get-FreePort
    $FrontendPort = Get-FreePort
    $Foreign = Start-Process -PassThru -FilePath python3 -ArgumentList @(
        (Join-Path $Fixture 'scripts/fake-server.py'), $BackendPort, 'frontend')
    Wait-Port $BackendPort $true
    $env:HERMES_TEST_COMPOSE_RUNNING = 'postgres collector-a1 collector-a2 collector-b1 collector-b2'
    $Failure = $null
    try { Invoke-FixtureDevUp $Fixture $BackendPort $FrontendPort } catch { $Failure = $_ }
    Assert-True ($null -ne $Failure) 'foreign listener was accepted'
    Assert-True ($Failure.Exception.Message -match 'port|포트|PID') 'foreign-listener error was not explicit'
    Assert-True (-not (Test-Path (Join-Path $Fixture '.run/pids'))) 'PID file was written for foreign listener'
    $DockerLogPath = Join-Path $Fixture 'docker.log'
    $DockerLog = if (Test-Path $DockerLogPath) { Get-Content -Raw $DockerLogPath } else { '' }
    Assert-True ($DockerLog -notmatch '(?m)(^| )stop( |$)') 'pre-existing Compose services were stopped on preflight failure'
    $Passed++
} finally {
    Remove-Item Env:HERMES_TEST_COMPOSE_RUNNING -ErrorAction SilentlyContinue
    if ($null -ne $Foreign) { Stop-TestProcessTree $Foreign.Id }
    Remove-Item -Recurse -Force $Fixture -ErrorAction SilentlyContinue
}

# A stale tracked file fails closed and remains available for operator diagnosis.
$Fixture = New-Fixture
try {
    $BackendPort = Get-FreePort
    $FrontendPort = Get-FreePort
    New-Item -ItemType Directory -Force -Path (Join-Path $Fixture '.run') | Out-Null
    $StaleRecord = "backend=999999`nfrontend=999998`n"
    [System.IO.File]::WriteAllText((Join-Path $Fixture '.run/pids'), $StaleRecord)
    $Failure = $null
    try { Invoke-FixtureDevUp $Fixture $BackendPort $FrontendPort } catch { $Failure = $_ }
    Assert-True ($null -ne $Failure) 'stale tracked PIDs were accepted'
    Assert-True ((Get-Content -Raw (Join-Path $Fixture '.run/pids')) -eq $StaleRecord) 'stale diagnostic PID file was changed'
    $Passed++
} finally {
    Remove-Item -Recurse -Force $Fixture -ErrorAction SilentlyContinue
}

# A child that exits before readiness rolls back its sibling and records no PID.
$Fixture = New-Fixture
try {
    $BackendPort = Get-FreePort
    $FrontendPort = Get-FreePort
    $env:HERMES_TEST_FAIL_BACKEND = '1'
    $Failure = $null
    try { Invoke-FixtureDevUp $Fixture $BackendPort $FrontendPort } catch { $Failure = $_ }
    Assert-True ($null -ne $Failure) 'dead backend returned success'
    Assert-True (-not (Test-Path (Join-Path $Fixture '.run/pids'))) 'dead PID was recorded'
    Wait-Port $FrontendPort $false
    $BackendError = Join-Path $Fixture '.run/backend.err'
    Assert-True (Test-Path $BackendError) 'backend error log was not preserved'
    Assert-True ((Get-Content -Raw $BackendError) -match 'expected fixture backend failure') 'backend failure reason was not flushed'
    $Passed++
} finally {
    Remove-Item Env:HERMES_TEST_FAIL_BACKEND -ErrorAction SilentlyContinue
    if (Test-Path (Join-Path $Fixture '.run/pids')) {
        $Pids = Read-Pids $Fixture
        foreach ($Value in $Pids.Values) { Stop-TestProcessTree $Value }
    }
    Remove-Item -Recurse -Force $Fixture -ErrorAction SilentlyContinue
}

# Agent readiness uses the production X-Monitor-Token contract.
$Fixture = New-Fixture
$Agent = $null
try {
    $AgentPort = Get-FreePort
    $Agent = Start-Process -PassThru -FilePath python3 -ArgumentList @(
        (Join-Path $Fixture 'scripts/fake-server.py'), $AgentPort, 'agent')
    Wait-Port $AgentPort $true
    . (Join-Path $Fixture 'scripts/process-helpers.ps1')
    Assert-True (Test-AgentReady -Port $AgentPort -Token 'test-only-token-32-bytes-long-000') 'agent readiness used the wrong auth header'
    $Passed++
} finally {
    if ($null -ne $Agent) { Stop-TestProcessTree $Agent.Id }
    Remove-Item -Recurse -Force $Fixture -ErrorAction SilentlyContinue
}

Write-Host "dev-up focused tests: $Passed/5 PASS"
