# Commitment Platform

A polished, full-stack collaboration workspace for turning group plans into visible, owned commitments. It shows who is responsible, what must happen first, and which downstream work is at risk when a commitment changes.

## Highlights

- A responsive dashboard with plan, commitment, completion, and risk signals.
- Plan workspaces with ownership, deadlines, priorities, activity history, and dependency maps.
- Full-workspace commitments and activity views.
- Dependency validation for self-links, duplicates, cross-plan links, and cycles.
- Impact analysis, cancellation alerts, notifications, and replacement workflows.
- A polished first-run demo workspace, seeded automatically and safe to explore.

## Run locally with Docker

Docker Desktop is the quickest route to a complete experience:

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). The frontend is served by Nginx and proxies API calls to Spring Boot, so the browser only needs one URL. The health endpoint is available at [http://localhost:8080/api/health](http://localhost:8080/api/health).

## Run without Docker

Requirements: Java 21, Maven, and Node.js 20+.

The backend uses a temporary H2 database by default, so no database setup is needed for a presentation:

```bash
cd backend
mvn spring-boot:run
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). To use PostgreSQL, set `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` before starting the backend.

## Deploy

For a single-server deployment, build and run the included Compose stack. The production frontend image serves compiled assets through Nginx and proxies `/api` to the backend.

For split hosting, deploy `backend/` as a Java 21 web service with a PostgreSQL database. Set:

```text
DB_URL=jdbc:postgresql://HOST:5432/social_commitment
DB_USERNAME=...
DB_PASSWORD=...
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com
```

Deploy `frontend/` as a static site with `npm run build` and set `VITE_API_URL=https://your-api.example.com/api` at build time. See `frontend/.env.example`.

## Production note

This demonstration intentionally does not include authentication or role-based authorization. Add those controls before storing real personal or organizational data.

## Project structure

```text
backend/             Spring Boot API and data model
frontend/            React interface and production Nginx container
docker-compose.yml   Full local / single-host stack
```
