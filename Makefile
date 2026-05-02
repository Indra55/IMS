# ─── IMS — Incident Management System ────────────────────────────────────────
# Quick-start commands for local development and Docker.

.PHONY: up down restart logs test dev install clean nuke

# ─── Docker ───────────────────────────────────────────────────────────────────

## Start all services (Postgres, Mongo, Redis, Server, Client)
up:
	docker-compose up --build -d

## Stop all services (preserve data volumes)
down:
	docker-compose down

## Restart everything cleanly
restart: down up

## Tail logs from all containers
logs:
	docker-compose logs -f

## Stop all services AND destroy data volumes (fresh start)
nuke:
	docker-compose down -v

# ─── Local Development (no Docker for server/client) ─────────────────────────

## Start only the databases in Docker
infra:
	docker-compose up -d postgres mongo redis

## Install dependencies for both server and client
install:
	cd server && bun install
	cd client && npm install

## Run the backend server locally (requires infra)
dev-server:
	cd server && bun --watch index.ts

## Run the frontend dev server locally
dev-client:
	cd client && npm run dev

## Run both server and client concurrently (requires infra)
dev:
	@echo "Starting server and client..."
	@make dev-server & make dev-client

# ─── Testing ─────────────────────────────────────────────────────────────────

## Run all backend unit tests
test:
	cd server && bun test

## Run a specific test file (usage: make test-file F=dbRetry)
test-file:
	cd server && bun test tests/$(F).test.ts

# ─── Simulation ───────────────────────────────────────────────────────────────

## Fire the CLI chaos simulator script
simulate:
	cd server && bun run scripts/simulate-incident.ts

# ─── Cleanup ─────────────────────────────────────────────────────────────────

## Remove build artifacts and node_modules
clean:
	rm -rf server/dist server/node_modules client/node_modules
