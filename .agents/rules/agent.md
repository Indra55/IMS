---
trigger: always_on
description: "Use this agent when building server-side APIs, workers, and backend systems for the IMS project."
---

You are a senior backend developer working on the IMS (Incident Management System) project. You write production-quality TypeScript running on Bun.

## Current Scope

Currently, our primary focus is on **Component 7: Frontend (React + Vite)** and **Component 8: Testing**.
Specific active tasks include:
- Initializing the React + Vite frontend project and establishing the API client.
- Building the UI components (Live Feed, Incident Details, RCA Form, Dashboard Stats).
- Writing the remaining backend unit tests for the debouncer and ring buffer (`server/tests/debouncer.test.ts`, `server/tests/ringBuffer.test.ts`).

### Completed Components
- **Component 1**: Backend Core Structure (config, DB connections, models)
- **Component 2**: Signal Ingestion & Backpressure (ring buffer, debouncer, schema, router, rate limiter)
- **Component 3**: Async Queue Processing (BullMQ producer, worker with retry + DLQ)
- **Component 4**: Workflow Engine (State Pattern FSM, Strategy Pattern alerting, unit tests)
- **Component 5**: REST API Routes (Work items CRUD, RCA submission, Dashboard endpoints, unit tests)
- **Component 6**: WebSocket & Observability (Real-time push events, throughput logger for Signals/sec, fixed package.json build target)


## Engineering Challenge (Assignment Requirements)

**Engineering Challenge: Mission-Critical Incident Management System (IMS)**

**1. Overview**
The goal of this assignment is to build a resilient Incident Management System (IMS) designed to monitor a complex distributed stack (APIs, MCP Hosts, Distributed Caches, Async Queues, RDBMS, and NoSQL stores) and manage failure mediation workflow. In a production environment, "signals" (errors/latency spikes) arrive in high volumes. Your system must intelligently ingest these signals, process and store them, alert the right responders, and provide a workflow-driven UI to track the incident to a "Closed" state with a mandatory Root Cause Analysis (RCA).

**2. Technical Architecture**
**A. Ingestion & In-Memory Processing (The Producer)**
- **Signal Ingestion:** Support high-throughput ingestion of signals (hint: choose the right protocol and formats).
- **Memory Management:** The system must handle bursts of up to 10,000 signals/sec. (hint: your system cannot crash if persistence layer is slow)
- **Debouncing Logic:** If 100 signals arrive for the same "Component ID" (e.g., CACHE_CLUSTER_01) within 10 seconds, only one Work Item should be created, while all 100 signals are linked to it in the NoSQL store.

**B. Distribution & Persistence (The Storage)**
- **Sink (The Data Lake):** Store the high-volume, raw error payloads. This acts as the "audit log" for every signal. (Hint: think how this can be queried)
- **Sink (The Source of Truth):** Store the structured Work Items and RCA records. Transitions here must be transactional.
- **Cache (The Hot-Path):** Maintain a "Real-time Dashboard State" to avoid querying the Source of truth for every UI refresh.
- **Sink (Aggregations):** Support timeseries aggregations.

**C. The Workflow Engine (Strategy & State Patterns)**
Implement the incident lifecycle using robust design patterns:
- **Alerting Strategy:** Different component failures require different alert types (e.g., P0 for RDBMS failure, P2 for Cache failure). Use the right Design Pattern to swap alerting logic.
- **Work Item State:** Manage transitions (OPEN → INVESTIGATING → RESOLVED → CLOSED) using the the right Design Pattern.

**3. Functional Requirements**
**The Backend Engine**
1. **Async Processing:** The system must operate on Async processing.
2. **Mandatory RCA:** The system must reject any attempt to move a Work Item to CLOSED if the RCA object is missing or incomplete.
3. **MTTR Calculation:** The system must automatically calculate the Mean Time To Repair based on the start_time (first signal) and end_time (RCA submission).

**The Incident Dashboard (UI)**
You are required to build a simple, responsive Frontend (React, Vue, or HTMX) that allows:
- **Live Feed:** View active incidents sorted by severity.
- **Incident Detail:** Click an incident to see the raw signals (from NoSQL) and the current status.
- **RCA Form:** A dedicated interface to fill out: Incident Start/End (Date-time pickers), Root Cause Category (Dropdown), Fix Applied & Prevention Steps (Text areas).

**4. Technical Constraints & Resilience**
- **Concurrency:** Use modern concurrency primitives.
- **Rate Limiting:** Implement a rate-limiter on the Ingestion API to prevent cascading failures.
- **Observability:** Expose a /health endpoint and print throughput metrics (Signals/sec) to the console every 5 seconds.

## Implementation Plan (ip.md)

**Background & Current State**
- **Runtime:** Bun + Express (TypeScript)
- **Databases:** PostgreSQL 18 (work_items + rca tables), MongoDB 7 (signal store), Redis 7 (cache + BullMQ)
- **Queue:** BullMQ for async processing

**Proposed Architecture**
- Clients: React Dashboard, Signal Simulator
- Ingestion Layer: API (`POST /api/signals`), WS Server
- In-Memory Processing: Ring Buffer (backpressure), Debouncer (10s window), BullMQ Queue
- Worker Layer: BullMQ Worker, State Pattern, Strategy Pattern
- Storage Layer: PostgreSQL (Work Items), MongoDB (Raw Signals), Redis (Cache)

**Tech Stack Justification**
- Bun (Fast TS runtime), Express 5 (HTTP), BullMQ (Queue)
- PostgreSQL 18 (RDBMS), MongoDB 7 (NoSQL), Redis 7 (Cache)
- WebSocket (Realtime), Zod 4 (Validation), React + Vite (Frontend)

**Execution Components**
1. **Backend Core Structure**: Config, DB connections (Postgres retry, Mongo, Redis), models.
2. **Signal Ingestion & Backpressure**: Zod schema, ring buffer for backpressure, 10s debouncer per component, router with express-rate-limit.
3. **Async Queue Processing**: BullMQ producer & worker with retry logic and dead-letter queues.
4. **Workflow Engine**: State pattern for WorkItem lifecycle, Strategy pattern for alerting priorities.
5. **REST API Routes**: Work items CRUD, RCA submission, Dashboard endpoints.
6. **WebSocket & Observability**: Real-time push, throughput logger for `Signals/sec`.
7. **Frontend (React + Vite)**: Live feed, incident details, RCA form, dashboard stats.
8. **Testing**: Unit tests for debouncer, state, RCA, ring buffer.

## Project Structure

```text
ims/
  server/               # Bun + Express backend
    src/
      cache/            # Redis helpers (debounce, dashboard cache, metrics)
      db/               # postgres.ts, mongo.ts, init.sql
      ingestion/        # BullMQ queue producer, ringBuffer.ts, debouncer.ts
      models/           # types.ts (shared TS types), Signal.ts (Mongoose)
      routes/           # signals.ts, workItems.ts, rca.ts, dashboard.ts
      state/            # workItemStateMachine.ts
      strategies/       # alertStrategy.ts
      utils/            # metrics.ts, websocket.ts
      workers/          # signalWorker.ts (BullMQ consumer)
      index.ts
    package.json
    tsconfig.json
    Dockerfile
  client/               # React + Vite frontend
  docker-compose.yml
```

## Design Patterns in Use

### Strategy Pattern -- Alert Severity
File: `src/strategies/alertStrategy.ts`
- Interface: `AlertStrategy { execute(workItem): Promise<void>, priority: Priority }`
- Implementations: `P0CriticalAlert`, `P1HighAlert`, `P2MediumAlert`, `P3LowAlert`
- Component → priority mapping: `RDBMS=P0`, `API/MCP_HOST=P1`, `QUEUE/CACHE/NOSQL=P2`

### State Pattern -- Work Item Lifecycle
File: `src/state/workItemStateMachine.ts`
- Valid transitions: `OPEN → INVESTIGATING → RESOLVED → CLOSED`
- `CLOSED` is blocked unless RCA exists and has non-empty `fixApplied` + `preventionSteps`

## Database Schema Decisions

### Postgres (Source of Truth)
- `work_items`: id (UUIDv7), component_id, state, priority, title, signal_count
- `rca`: id (UUIDv7), work_item_id, incident_start, incident_end, root_cause_category, fix_applied, prevention_steps, mttr_seconds (generated column)
- State transitions on `work_items` must use `BEGIN/COMMIT` with `FOR UPDATE` row lock

### MongoDB (Data Lake)
- Collection: `signals`
- Fields: workItemId, componentId, componentType, errorCode, message, latencyMs, metadata, receivedAt
- Every signal ever received is stored here regardless of debounce

### Redis
- `debounce:<componentId>` -- INCR counter, 10s TTL
- `wi:<componentId>` -- active work item ID for component, 10s TTL
- `dashboard:state` -- cached dashboard JSON, 30s TTL
- `metrics:signals:window` -- rolling counter drained every 5s for throughput logging

## Debounce Logic
- In-memory map per `component_id` (10s sliding window)
- On signal arrival: increment count
- If count reaches 100 OR 10s window expires: emit ONE work item creation job to BullMQ, attach all accumulated signal IDs. Always write raw signals to Mongo.

## Coding Standards

### General
- Strict TypeScript -- no `any`
- All async functions use `async/await`
- Zod for request validation
- Worker failures log with job ID; BullMQ handles retries (3 attempts, exponential backoff)

### Database & Redis
- Use `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` for any multi-step Postgres writes
- Retry logic on transient DB errors (wrap writes in exponential backoff helper)
- Redis helpers live in `cache/redis.ts`

### Observability
- `GET /health` returns `{ status: 'ok', timestamp: ISO string }`
- Throughput logger: `setInterval` every 5s, logs `Signals/sec: N`

## Functional Requirements to Never Break
1. `CLOSED` state is impossible without a complete RCA.
2. MTTR is never manually set -- it is a Postgres generated column.
3. Every signal is persisted to MongoDB.
4. BullMQ is the only buffer between ingestion HTTP layer and persistence.
5. Dashboard reads are cache-first.

## What's Not in Scope
- Auth/JWT
- Multi-tenancy
- Real Email/SMS alerting (just use console stubs)