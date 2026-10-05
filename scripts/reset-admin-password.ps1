$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Maven = if ($IsWindows) { Join-Path $Root 'mvnw.cmd' } else { Join-Path $Root 'mvnw' }
$MinimumPasswordLength = 8

function Import-DotEnv([string]$Path) {
    Get-Content -LiteralPath $Path | ForEach-Object {
        $Line = $_.Trim()
        if ($Line -and -not $Line.StartsWith('#')) {
            $Parts = $Line.Split('=', 2)
            if ($Parts.Count -ne 2) { throw '잘못된 .env 항목이 있습니다.' }
            $Value = $Parts[1].Trim()
            if ($Value.StartsWith("'") -and $Value.EndsWith("'") -and $Value.Length -ge 2) {
                $Value = $Value.Substring(1, $Value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($Parts[0], $Value, 'Process')
        }
    }
}

function ConvertFrom-LocalSecureString([Security.SecureString]$Value) {
    $Pointer = [IntPtr]::Zero
    try {
        $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    } finally {
        if ($Pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
        }
    }
}

if (-not (Test-Path -LiteralPath '.env')) {
    throw '먼저 scripts/setup-local.ps1을 실행하세요.'
}
if (-not (Test-Path -LiteralPath $Maven)) {
    throw 'Maven wrapper를 찾을 수 없습니다.'
}
$Java = Get-Command java -ErrorAction SilentlyContinue
if (-not $Java) { throw 'JDK 21이 필요합니다.' }
$JavaVersionOutput = (& java -version 2>&1)
if ($LASTEXITCODE -ne 0 -or (($JavaVersionOutput | Select-Object -First 1) -join '') -notmatch '"21[\.]') {
    throw 'JDK 21이 필요합니다.'
}

& $Maven -q -pl agent -DskipTests '-Dfrontend.skip=true' package
$BuildExit = $LASTEXITCODE
if ($BuildExit -ne 0) {
    throw "ADMIN_PASSWORD_RESET_FAILED stage=build exit=$BuildExit"
}
$ResetJars = @(Get-ChildItem -LiteralPath (Join-Path $Root 'agent/target') `
    -Filter 'agent-*.jar' -File | Where-Object { $_.Name -notlike '*.original' })
if ($ResetJars.Count -ne 1) {
    throw 'ADMIN_PASSWORD_RESET_FAILED stage=build code=RESET_ARTIFACT_INVALID'
}
$ResetJar = $ResetJars[0]

Import-DotEnv '.env'
if ([string]::IsNullOrWhiteSpace($env:HERMES_DB_PASSWORD)) {
    throw 'HERMES_DB_PASSWORD가 필요합니다.'
}
if ([string]::IsNullOrWhiteSpace($env:HERMES_ADMIN_USERNAME)) {
    $env:HERMES_ADMIN_USERNAME = 'admin'
}

$First = Read-Host "새 admin 비밀번호(${MinimumPasswordLength}자 이상)" -AsSecureString
$Second = Read-Host '새 admin 비밀번호 확인' -AsSecureString
$PlainFirst = $null
$PlainSecond = $null
try {
    $PlainFirst = ConvertFrom-LocalSecureString $First
    $PlainSecond = ConvertFrom-LocalSecureString $Second
    if ($PlainFirst.Length -lt $MinimumPasswordLength) {
        throw "비밀번호는 ${MinimumPasswordLength}자 이상이어야 합니다."
    }
    if (-not [string]::Equals($PlainFirst, $PlainSecond, [StringComparison]::Ordinal)) {
        throw '비밀번호 확인이 일치하지 않습니다.'
    }
    $PlainFirst | & $Java.Source `
        '-Dloader.main=com.monitoring.agent.security.AdminPasswordResetCli' `
        -cp $ResetJar.FullName org.springframework.boot.loader.launch.PropertiesLauncher
    $ResetExit = $LASTEXITCODE
    if ($ResetExit -ne 0) {
        throw "ADMIN_PASSWORD_RESET_FAILED stage=reset-cli exit=$ResetExit"
    }
} finally {
    $PlainFirst = $null
    $PlainSecond = $null
    if ($null -ne $First) { $First.Dispose() }
    if ($null -ne $Second) { $Second.Dispose() }
    [GC]::Collect()
}
