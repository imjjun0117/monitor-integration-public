FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY . .
RUN mvn -B -pl agent -am -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /workspace/agent/target/agent-0.1.0-SNAPSHOT.jar /app/agent.jar
USER 10001:10001
ENTRYPOINT ["java", "-jar", "/app/agent.jar"]
