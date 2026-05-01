---
trigger: model_decision
description: Use this file whenever writing or modifying code to ensure strict TypeScript rules, proper naming conventions, and formatting (like .js extensions) are perfectly followed.
---

# Code Style Guide

## TypeScript
- Strict mode always on -- no `any`, no `ts-ignore`
- Use `type` for unions/primitives, `interface` for object shapes
- Prefer `const` over `let`, never `var`
- No default exports except for React components
- Named exports only in backend code

## Naming
- Files: `camelCase.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants (e.g. `DEBOUNCE_TTL`)
- Enums/union string literals: `SCREAMING_SNAKE_CASE` (e.g. `'OPEN'`, `'P0'`)

## Formatting
- 2 space indentation
- Single quotes
- Semicolons
- Trailing commas in multiline objects/arrays
- Max line length 100 chars

## Comments
- Every exported function gets a one-line JSDoc comment describing what it does
- Non-obvious logic (debounce, state transitions, Redis TTL decisions) gets an inline comment
- No commented-out code in commits
- No `// TODO` without a paired GitHub issue reference

## Async
- Always `async/await` -- no raw `.then()/.catch()` chains
- Always handle errors with `try/catch` in route handlers and workers
- Never fire-and-forget without explicit error logging

## Imports
- Group imports: external packages first, then internal modules
- Use `.js` extensions on relative imports (Bun/ESM requirement)
- No circular imports -- `models/types.ts` is the only shared dependency