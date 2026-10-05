param(
    [ValidateRange(1, 65535)][int]$BackendPort = 8080,
    [ValidateRange(1, 65535)][int]$FrontendPort = 5173,
    [int[]]$AgentPorts = @(18081, 18082, 18083, 18084),
    [ValidateRange(1, 600)][int]$ReadinessTimeoutSeconds = 120,
    [switch]$Lan,
    [string]$LanAddress = ''
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot 'process-helpers.ps1')
$Maven = if ($IsWindows) { Join-Path $Root 'mvnw.cmd' } else { Join-Path $Root 'mvnw' }
$Npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }
$BundledNodeDirectory = Join-Path $Root 'agent/target/node'
if (Test-Path (Join-Path $BundledNodeDirectory $Npm)) {
    $env:PATH = $BundledNodeDirectory + [System.IO.Path]::PathSeparator + $env:PATH
    $Npm = Join-Path $BundledNodeDirectory $Npm
}
$ProcessOptions = if ($IsWindows) { @{ WindowStyle = 'Hidden' } } else { @{} }
$RunDirectory = Join-Path $Root '.run'
$PidPath = Join-Path $RunDirectory 'pids'
$Services = @('postgres')
$LanEnabled = $Lan.IsPresent -or -not [string]::IsNullOrWhiteSpace($LanAddress)
$BackendAddress = if ($LanEnabled) {
    Resolve-LanIPv4Address -RequestedAddress $LanAddress
} else {
    '127.0.0.1'
}

if (-not (Test-Path (Join-Path $Root '.env'))) {
    throw "먼저 scripts/setup-local.ps1을 실행하세요."
}

Get-Content (Join-Path $Root '.env') | ForEach-Object {
    $Line = $_.Trim()
    if ($Line -and -not $Line.StartsWith('#')) {
        $Parts = $Line.Split('=', 2)
        if ($Parts.Count -ne 2) { throw "잘못된 .env 항목이 있습니다." }
        $Value = $Parts[1].Trim()
        if ($Value.StartsWith("'") -and $Value.EndsWith("'") -and $Value.Length -ge 2) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($Parts[0], $Value, 'Process')
    }
}

if (-not [string]::IsNullOrWhiteSpace($env:HERMES_AGENT_ALLOWLIST_FILE) -and
    -not [System.IO.Path]::IsPathRooted($env:HERMES_AGENT_ALLOWLIST_FILE)) {
    $env:HERMES_AGENT_ALLOWLIST_FILE = Join-Path $Root $env:HERMES_AGENT_ALLOWLIST_FILE
}

$SamplesEnabled = $env:HERMES_SAMPLE_FIXTURES_ENABLED -eq 'true'
if ($SamplesEnabled) {
    $Services += @('collector-a1', 'collector-a2', 'collector-b1', 'collector-b2')
}

function Get-ComposeRunningServices {
    $Output = @(& docker compose --env-file .env --profile samples ps --services --status running 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose 상태 확인 실패 (exit $LASTEXITCODE)" }
    return @($Output | Where-Object { $_ -in $Services })
}

function Start-ComposeStack {
    & docker compose --env-file .env --profile samples up -d @Services
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL/sample agent 시작 실패 (exit $LASTEXITCODE)" }
}

function Test-ComposeReady {
    & docker compose --env-file .env --profile samples exec -T postgres `
        pg_isready -U hermes -d hermes_monitor *> $null
    if ($LASTEXITCODE -ne 0) { return $false }
    if ($SamplesEnabled) {
        foreach ($Port in $AgentPorts) {
            if (-not (Test-AgentReady -Port $Port -Token $env:HERMES_SAMPLE_AGENT_TOKEN)) { return $false }
        }
    }
    return $true
}

function Test-LocalStackReady([hashtable]$Tracked) {
    if (-not (Test-ProcessAlive -Id $Tracked.backend) -or
        -not (Test-ProcessAlive -Id $Tracked.frontend)) { return $false }
    if (-not (Test-PortOwnedByTree -Port $BackendPort -RootId $Tracked.backend -LocalAddress $BackendAddress) -or
        -not (Test-PortOwnedByTree -Port $FrontendPort -RootId $Tracked.frontend -LocalAddress '127.0.0.1')) { return $false }
    return (Test-HttpReady -Uri "http://${BackendAddress}:$BackendPort/actuator/health" -ExpectedStatus 'UP') -and
        (Test-HttpReady -Uri "http://127.0.0.1:$FrontendPort/")
}

function Wait-StackReady([hashtable]$Tracked) {
    $Deadline = [DateTime]::UtcNow.AddSeconds($ReadinessTimeoutSeconds)
    do {
        if (-not (Test-ProcessAlive -Id $Tracked.backend)) {
            throw "Backend process $($Tracked.backend) exited before readiness. See .run/backend.out and .run/backend.err."
        }
        if (-not (Test-ProcessAlive -Id $Tracked.frontend)) {
            throw "Frontend process $($Tracked.frontend) exited before readiness. See .run/frontend.out and .run/frontend.err."
        }
        if ((Test-ComposeReady) -and (Test-LocalStackReady -Tracked $Tracked)) { return }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $Deadline)
    throw "Development stack was not ready within $ReadinessTimeoutSeconds seconds. See .run/*.out and .run/*.err."
}

function Write-PidFileAtomically([hashtable]$Tracked) {
    $TemporaryPath = Join-Path $RunDirectory ("pids." + [guid]::NewGuid() + '.tmp')
    try {
        [System.IO.File]::WriteAllLines($TemporaryPath, @(
            "backend=$($Tracked.backend)",
            "frontend=$($Tracked.frontend)"
        ))
        [System.IO.File]::Move($TemporaryPath, $PidPath)
    } finally {
        Remove-Item -LiteralPath $TemporaryPath -Force -ErrorAction SilentlyContinue
    }
}

function Stop-NewComposeServices([string[]]$InitiallyRunning) {
    try {
        $NowRunning = @(Get-ComposeRunningServices)
        $NewServices = @($NowRunning | Where-Object { $_ -notin $InitiallyRunning })
        if ($NewServices.Count -gt 0) {
            & docker compose --env-file .env --profile samples stop @NewServices *> $null
        }
    } catch {
        Write-Warning "새로 시작한 Compose 서비스 정리에 실패했습니다. docker compose 상태를 확인하세요."
    }
}

New-Item -ItemType Directory -Force -Path $RunDirectory | Out-Null
$LockPath = Join-Path $RunDirectory 'dev-up.lock'
try {
    $Lock = [System.IO.File]::Open(
        $LockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
} catch {
    throw "다른 dev-up 실행이 진행 중입니다. 완료 후 다시 시도하세요."
}

$Backend = $null
$Frontend = $null
$InitiallyRunning = @()
$ComposeSnapshotTaken = $false
$PidFileExisted = Test-Path -LiteralPath $PidPath
try {
    if (Test-Path -LiteralPath $PidPath) {
        $Tracked = Get-TrackedProcessMap -Path $PidPath
        if (-not (Test-LocalStackReady -Tracked $Tracked)) {
            throw "기록된 PID가 현재 포트의 healthy backend/frontend를 소유하지 않습니다. foreign/stale 상태이므로 자동 덮어쓰지 않습니다. scripts/dev-down.ps1 및 포트 점유를 확인하세요."
        }
        $InitiallyRunning = @(Get-ComposeRunningServices)
        $ComposeSnapshotTaken = $true
        if ($InitiallyRunning.Count -ne $Services.Count -or -not (Test-ComposeReady)) {
            Start-ComposeStack
        }
        Wait-StackReady -Tracked $Tracked
        Write-Host "이미 실행 중인 healthy stack을 유지했습니다 (backend PID $($Tracked.backend), frontend PID $($Tracked.frontend))."
        Write-Host "대시보드 http://${BackendAddress}:$BackendPort / 로컬 Vite http://127.0.0.1:$FrontendPort"
        return
    }

    foreach ($Port in @($BackendPort, $FrontendPort)) {
        $Owners = @(Get-ListeningProcessIds -Port $Port)
        if ($Owners.Count -gt 0) {
            throw "포트 $Port 가 PID $($Owners -join ',')에 의해 점유되어 있지만 추적 PID 파일이 없습니다. foreign listener를 자동 종료하거나 덮어쓰지 않습니다."
        }
    }

    $InitiallyRunning = @(Get-ComposeRunningServices)
    $ComposeSnapshotTaken = $true
    Start-ComposeStack

    $PreviousServerPort = $env:SERVER_PORT
    $PreviousServerAddress = $env:SERVER_ADDRESS
    try {
        $env:SERVER_PORT = [string]$BackendPort
        $env:SERVER_ADDRESS = $BackendAddress
        $Backend = Start-Process -PassThru @ProcessOptions `
            -FilePath $Maven `
            -ArgumentList @('-pl', 'agent', '-Dfrontend.skip=true', 'spring-boot:run') `
            -RedirectStandardOutput (Join-Path $RunDirectory 'backend.out') `
            -RedirectStandardError (Join-Path $RunDirectory 'backend.err')
    } finally {
        $env:SERVER_PORT = $PreviousServerPort
        $env:SERVER_ADDRESS = $PreviousServerAddress
    }

    $Frontend = Start-Process -PassThru @ProcessOptions `
        -FilePath $Npm `
        -WorkingDirectory (Join-Path $Root 'agent/frontend') `
        -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', [string]$FrontendPort) `
        -RedirectStandardOutput (Join-Path $RunDirectory 'frontend.out') `
        -RedirectStandardError (Join-Path $RunDirectory 'frontend.err')

    $Tracked = @{ backend = [int]$Backend.Id; frontend = [int]$Frontend.Id }
    Wait-StackReady -Tracked $Tracked
    Write-PidFileAtomically -Tracked $Tracked
    Write-Host "ready 확인 후 PID를 기록했습니다 (backend PID $($Tracked.backend), frontend PID $($Tracked.frontend))."
    Write-Host "대시보드 http://${BackendAddress}:$BackendPort / 로컬 Vite http://127.0.0.1:$FrontendPort"
} catch {
    $OriginalError = $_
    foreach ($Process in @($Frontend, $Backend)) {
        if ($null -ne $Process) {
            Stop-ProcessTree -Id $Process.Id
            Wait-Process -Id $Process.Id -Timeout 5 -ErrorAction SilentlyContinue
        }
    }
    if ($ComposeSnapshotTaken) {
        Stop-NewComposeServices -InitiallyRunning $InitiallyRunning
    }
    if (-not $PidFileExisted) {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    }
    throw $OriginalError
} finally {
    if ($null -ne $Lock) { $Lock.Dispose() }
}
