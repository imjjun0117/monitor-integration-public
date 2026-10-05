$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Maven = if ($IsWindows) { Join-Path $Root 'mvnw.cmd' } else { Join-Path $Root 'mvnw' }
if (Test-Path .run/pids) {
    throw "개발 서버가 실행 중입니다. scripts/dev-down.ps1로 먼저 종료한 뒤 빌드하세요. 실행 중인 JAR을 덮어쓰면 classpath가 손상될 수 있습니다."
}
& $Maven clean package
if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }

$ArtifactDirectory = Join-Path $Root ".run/final"
New-Item -ItemType Directory -Force -Path $ArtifactDirectory | Out-Null
$ImmutableJar = Join-Path $ArtifactDirectory "agent-final.jar"
$ImmutableCollectorJar = Join-Path $ArtifactDirectory "collector-final.jar"
Copy-Item -Force `
    (Join-Path $Root "agent/target/agent-0.1.0-SNAPSHOT.jar") `
    $ImmutableJar
Copy-Item -Force `
    (Join-Path $Root "collector/target/collector-0.1.0-SNAPSHOT.jar") `
    $ImmutableCollectorJar
& node (Join-Path $Root "tools/artifact-manifest.mjs") create `
    (Join-Path $ArtifactDirectory "build-manifest.json") $ImmutableJar $ImmutableCollectorJar
if ($LASTEXITCODE -ne 0) { throw "산출물 manifest 생성 실패" }
& node (Join-Path $Root "tools/artifact-manifest.mjs") verify `
    (Join-Path $ArtifactDirectory "build-manifest.json")
if ($LASTEXITCODE -ne 0) { throw "산출물 provenance 검증 실패" }
