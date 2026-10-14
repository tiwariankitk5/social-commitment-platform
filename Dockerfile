FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app
COPY backend/pom.xml .
COPY backend/src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend-build /app/target/social-commitment-platform-0.0.1-SNAPSHOT.jar app.jar
COPY --from=frontend-build /app/dist /app/static
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
ENV STATIC_ASSETS=file:/app/static/
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
