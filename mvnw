#!/bin/sh
set -eu
JAR=.mvn/wrapper/maven-wrapper.jar
if [ ! -f "$JAR" ]; then curl -fsSL https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.4/maven-wrapper-3.3.4.jar -o "$JAR"; fi
exec java -classpath "$JAR" -Dmaven.multiModuleProjectDirectory="$PWD" org.apache.maven.wrapper.MavenWrapperMain "$@"
