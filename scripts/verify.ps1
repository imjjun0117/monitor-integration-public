$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Invoke-Checked([scriptblock]$Step, [string]$Message) {
    $global:LASTEXITCODE = 0
    & $Step
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

function Resolve-RequiredJava([string]$Variable, [string]$VersionPattern) {
    $RuntimeHome = [Environment]::GetEnvironmentVariable($Variable, 'Process')
    if ([string]::IsNullOrWhiteSpace($RuntimeHome)) {
        throw "$Variable must identify an approved runtime"
    }
    $Executable = Join-Path $RuntimeHome ($(if ($IsWindows) { 'bin/java.exe' } else { 'bin/java' }))
    if (-not (Test-Path $Executable -PathType Leaf)) {
        throw "$Variable does not contain a Java executable"
    }
    $Version = (& $Executable -version 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $Version -notmatch $VersionPattern) {
        throw "$Variable has the wrong Java version"
    }
    return $Executable
}

$Maven = if ($IsWindows) { Join-Path $Root 'mvnw.cmd' } else { Join-Path $Root 'mvnw' }
# Run the independent dependency gate before approved-runtime discovery so a missing
# Java 7/8 home cannot hide vulnerability results. Both remain fail-closed.
Invoke-Checked { & (Join-Path $Root 'scripts/dependency-vulnerability-gate.ps1') } "dependency vulnerability gate failed"

$Java7 = Resolve-RequiredJava 'HERMES_JAVA7_HOME' 'version "1\.7\.'
$Java8 = Resolve-RequiredJava 'HERMES_JAVA8_HOME' 'version "1\.8\.'
$Java21Version = (& java -version 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $Java21Version -notmatch 'version "21(?:\.|\")') {
    throw "Active Java 21 runtime is required"
}

Invoke-Checked { node tools/scan-secrets.mjs } "secret/log scan failed"
Invoke-Checked { node --test tests/*.test.mjs } "repository contract/schema tests failed"
Invoke-Checked { & $Maven clean verify } "Maven clean verify or Java license gate failed"

$AgentJar = Join-Path $Root 'monitor-agent/target/monitor-agent-0.1.0-SNAPSHOT.jar'
Invoke-Checked { java tools/VerifyAgentJar.java $AgentJar } "not every shaded agent class is Java 7"
Invoke-Checked {
    & $Java7 -cp $AgentJar com.hermes.monitoring.agent.AgentCompatibilityProbe
} "approved Java 7 agent runtime gate failed"
Invoke-Checked {
    & $Java8 -cp $AgentJar com.hermes.monitoring.agent.AgentCompatibilityProbe
} "approved Java 8 agent runtime gate failed"

Push-Location monitor-center/frontend
try {
    Invoke-Checked { npm ci } "npm ci failed"
    Invoke-Checked { npm run validate:openapi } "OpenAPI validation failed"
    Invoke-Checked { npm run generate:api:check } "generated API diff gate failed"
    Invoke-Checked { npm run lint } "frontend TypeScript check failed"
    Invoke-Checked { npm run test:run } "frontend unit tests failed"
    Invoke-Checked { npm run build } "frontend production build failed"
    Invoke-Checked { npm run license:check } "npm license gate failed"
    Invoke-Checked { npm audit --audit-level=high } "npm high/critical audit failed"
    Invoke-Checked { npm run test:e2e } "authenticated real-backend Playwright E2E failed"
} finally {
    Pop-Location
}

Invoke-Checked { node tools/scan-secrets.mjs } "final secret/log scan failed"
$ArtifactDirectory = Join-Path $Root '.run/final'
New-Item -ItemType Directory -Force -Path $ArtifactDirectory | Out-Null
$ImmutableJar = Join-Path $ArtifactDirectory 'monitor-center-final.jar'
Copy-Item -Force `
    (Join-Path $Root 'monitor-center/target/monitor-center-0.1.0-SNAPSHOT.jar') `
    $ImmutableJar
$BuildManifest = Join-Path $ArtifactDirectory 'build-manifest.json'
Invoke-Checked {
    node tools/artifact-manifest.mjs create $BuildManifest $ImmutableJar $AgentJar
} "artifact manifest creation failed"
Invoke-Checked {
    node tools/artifact-manifest.mjs verify $BuildManifest
} "immutable artifact provenance verification failed"
Write-Host "All available verification gates passed."
