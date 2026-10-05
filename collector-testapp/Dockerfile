FROM tomcat:9.0-jdk17-temurin-jammy

RUN rm -rf /usr/local/tomcat/webapps/*
COPY collector-testapp/target/collector-testapp-0.1.0-SNAPSHOT.war \
  /usr/local/tomcat/webapps/ROOT.war

EXPOSE 8080
