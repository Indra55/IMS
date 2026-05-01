// Sends 200 signals to POST /api/signals and prints a summary.
// Run with: bun run tests/signalTest.js

const BASE_URL = 'http://localhost:5555/api/signals'

const COMPONENT_TYPES = ['API', 'MCP_HOST', 'CACHE', 'QUEUE', 'RDBMS', 'NOSQL']
const SEVERITIES      = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function post(body) {
  const res = await fetch(BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

// Good signals
const validPayloads = Array.from({ length: 200 }, (_, i) => ({
  signal_id:      crypto.randomUUID(),
  component_id:   'comp_123',
  component_type: randomItem(COMPONENT_TYPES),
  severity:       randomItem(SEVERITIES),
  message:        `Test failure signal #${i}`,
  timestamp:      new Date().toISOString(),
}))

// Bad signals 
const badPayloads = [
  { signal_id: 'not-a-uuid',   component_id: 'comp_1', component_type: 'API',    severity: 'HIGH',     message: 'bad uuid',            timestamp: new Date().toISOString() },
  { signal_id: crypto.randomUUID(), component_id: '',  component_type: 'API',    severity: 'HIGH',     message: 'empty component_id',  timestamp: new Date().toISOString() },
  { signal_id: crypto.randomUUID(), component_id: 'x', component_type: 'button', severity: 'HIGH',     message: 'invalid type',        timestamp: new Date().toISOString() },
  { signal_id: crypto.randomUUID(), component_id: 'x', component_type: 'CACHE',  severity: 'EXTREME',  message: 'invalid severity',    timestamp: new Date().toISOString() },
  { signal_id: crypto.randomUUID(), component_id: 'x', component_type: 'CACHE',  severity: 'LOW',      message: '',                    timestamp: new Date().toISOString() },
  { signal_id: crypto.randomUUID(), component_id: 'x', component_type: 'CACHE',  severity: 'LOW',      message: 'missing timestamp'  },
  {},
]

const [validResults, badResults] = await Promise.all([
  Promise.all(validPayloads.map(p => post(p))),
  Promise.all(badPayloads.map(p => post(p))),
])

function summarise(label, results, expectedStatus) {
  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const passed = results.filter(r => r.status === expectedStatus).length
  const failed = results.length - passed

  console.log(`\n=== ${label} (expected ${expectedStatus}) ===`)
  for (const [status, count] of Object.entries(counts)) {
    const ok = Number(status) === expectedStatus
    console.log(`  HTTP ${status}: ${count}  ${ok ? '✅' : '❌'}`)
  }
  console.log(`  → ${passed} passed, ${failed} unexpected`)
}

summarise('Valid signals  (200 requests)', validResults, 202)
summarise('Invalid signals (7 requests)', badResults,   400)

console.log('\n─── Invalid signal responses ───')
badResults.forEach((r, i) => {
  console.log(`\n[bad #${i + 1}] HTTP ${r.status}`)
  console.dir(r.body, { depth: null })
})