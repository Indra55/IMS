---
trigger: model_decision
description: Use this file whenever making architectural decisions about where a new piece of logic belongs (routes vs. workers vs. state) or how to wire components together.
---

# Code Generation Guide

## Module Structure
- `src/index.ts` is the entry point -- it only wires things together (connects DBs, registers routes, starts workers)
- Do not put business logic in `index.ts` or route handlers
- Each distinct piece of functionality lives in its own file in the correct directory:
  - Data access → `db/` or `cache/`
  - Business logic → `state/` or `strategies/`
  - Queue I/O → `ingestion/` or `workers/`
  - HTTP surface → `routes/`
  - Shared types → `models/types.ts`

## Route Handlers
- Route files are thin controllers only -- validate input with Zod, call a helper/class, return response
- If a route handler exceeds ~30 lines, extract the logic into a separate module

## Adding a New Feature
1. Define types in `models/types.ts` first
2. Implement logic in the appropriate directory as a new file or class
3. Wire it into the route or worker that needs it
4. Export only what is needed -- keep internals private

## Worker Logic
- `signalWorker.ts` orchestrates -- it calls helpers from `cache/`, `db/`, `strategies/`, `state/`
- Do not inline Redis commands or SQL queries directly in the worker
- Each helper function does one thing and is testable in isolation

## Tests
- Unit tests live in `src/tests/`
- Test file naming: `<module>.test.ts`
- Each test file covers one module
- Business logic (state machine, RCA validation, debounce) must have unit tests
- Do not test Express routes in unit tests -- that's integration territory

## Example: Adding a New Alert Channel
- Wrong: add email logic inside `signalWorker.ts`
- Right: create `strategies/emailAlert.ts` implementing `AlertStrategy`, register it in `resolveAlertStrategy()`