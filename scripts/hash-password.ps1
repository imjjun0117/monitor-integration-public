$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $PSScriptRoot
$plain=[Console]::In.ReadLine()
if ([string]::IsNullOrWhiteSpace($plain)) { throw "표준입력으로 비밀번호를 제공하세요." }
$plain | & "$Root/mvnw.cmd" -q -pl agent -DskipTests exec:java -Dexec.mainClass=com.monitoring.agent.security.HashPasswordCli
