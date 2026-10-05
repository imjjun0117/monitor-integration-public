@echo off
if not exist .mvn\wrapper\maven-wrapper.jar powershell -Command "Invoke-WebRequest https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.4/maven-wrapper-3.3.4.jar -OutFile .mvn/wrapper/maven-wrapper.jar"
java -classpath .mvn\wrapper\maven-wrapper.jar "-Dmaven.multiModuleProjectDirectory=%CD%" org.apache.maven.wrapper.MavenWrapperMain %*
