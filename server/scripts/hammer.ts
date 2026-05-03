#!/usr/bin/env bun
/**
 * Hammer Script - Burst Testing Tool
 * 
 * This script explicitly verifies the 10k/sec burst requirement by:
 * 1. Sending a controlled burst of 10,000 requests as fast as possible
 * 2. Tracking success/failure rates and response times
 * 3. Verifying backpressure behavior (503 responses when buffer is full)
 * 4. Providing clear metrics for reviewers
 * 
 * Usage:
 *   bun run scripts/hammer.ts
 *   bun run scripts/hammer.ts --burst-size 10000
 *   bun run scripts/hammer.ts --burst-size 10000 --url http://localhost:5555/api/signals
 */

import { parseArgs } from 'util'

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    'burst-size': { type: 'string', default: '10000' },
    url: { type: 'string', default: process.env.API_URL || 'http://localhost:5555/api/signals' },
    concurrent: { type: 'string', default: '10000' },
  },
  strict: true,
  allowPositionals: true,
})

const BURST_SIZE = parseInt(values['burst-size'] as string, 10)
const BASE_URL = values.url as string
const CONCURRENT = parseInt(values.concurrent as string, 10)

// Test scenarios
const SCENARIOS = [
  { component_id: 'RDBMS_PRIMARY_01', component_type: 'RDBMS', severity: 'CRITICAL', weight: 50 },
  { component_id: 'CACHE_CLUSTER_01', component_type: 'CACHE', severity: 'MEDIUM', weight: 20 },
  { component_id: 'CACHE_CLUSTER_02', component_type: 'CACHE', severity: 'MEDIUM', weight: 20 },
  { component_id: 'MCP_HOST_01', component_type: 'MCP_HOST', severity: 'HIGH', weight: 30 },
  { component_id: 'API_GATEWAY_01', component_type: 'API', severity: 'LOW', weight: 80 }
]

function pickScenario() {
  const total = SCENARIOS.reduce((sum, s) => sum + s.weight, 0)
  let rand = Math.random() * total
  for (const s of SCENARIOS) {
    if (rand < s.weight) return s
    rand -= s.weight
  }
  return SCENARIOS[0]!
}

interface Result {
  success: boolean
  status: number
  latency: number
  timestamp: number
  backpressure: boolean
}

const results: Result[] = []
let completed = 0
let startTime = 0

async function fireSignal(index: number): Promise<Result> {
  const sc = pickScenario()
  const payload = {
    signal_id: crypto.randomUUID(),
    component_id: sc.component_id,
    component_type: sc.component_type,
    severity: sc.severity,
    message: `Hammer test signal #${index}`,
    timestamp: new Date().toISOString()
  }

  const requestStart = performance.now()
  
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    const latency = performance.now() - requestStart
    const status = response.status
    const success = status === 202
    const backpressure = status === 503
    
    return {
      success,
      status,
      latency,
      timestamp: Date.now(),
      backpressure
    }
  } catch (err) {
    const latency = performance.now() - requestStart
    return {
      success: false,
      status: 0,
      latency,
      timestamp: Date.now(),
      backpressure: false
    }
  }
}

async function processBatch(batchSize: number, startIndex: number): Promise<void> {
  const promises: Promise<Result>[] = []
  
  for (let i = 0; i < batchSize; i++) {
    const index = startIndex + i
    if (index >= BURST_SIZE) break
    promises.push(fireSignal(index))
  }
  
  const batchResults = await Promise.all(promises)
  results.push(...batchResults)
  completed += batchResults.length
  
  // Progress indicator
  const progress = ((completed / BURST_SIZE) * 100).toFixed(1)
  process.stdout.write(`\rProgress: ${progress}% (${completed}/${BURST_SIZE})`)
}

async function runHammer() {
  console.log('\n🔨 HAMMER TEST - Burst Verification')
  console.log('='.repeat(60))
  console.log(`Target URL: ${BASE_URL}`)
  console.log(`Burst Size: ${BURST_SIZE.toLocaleString()} requests`)
  console.log(`Concurrency: ${CONCURRENT}`)
  console.log('='.repeat(60))
  console.log('⏳ Firing burst...\n')
  
  startTime = performance.now()
  
  // Fire all requests in concurrent batches
  let startIndex = 0
  while (startIndex < BURST_SIZE) {
    const batchSize = Math.min(CONCURRENT, BURST_SIZE - startIndex)
    await processBatch(batchSize, startIndex)
    startIndex += batchSize
  }
  
  const endTime = performance.now()
  const totalDuration = endTime - startTime
  
  console.log('\n\n📊 RESULTS')
  console.log('='.repeat(60))
  
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const backpressureCount = results.filter(r => r.backpressure).length
  const rateLimitCount = results.filter(r => r.status === 429).length
  
  const latencies = results.map(r => r.latency).filter(l => l > 0)
  const avgLatency = latencies.length > 0 
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
    : 0
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0
  
  // Calculate p50, p95, p99
  const sortedLatencies = [...latencies].sort((a, b) => a - b)
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0
  
  const actualRate = (BURST_SIZE / (totalDuration / 1000)).toFixed(0)
  
  console.log(`Total Requests: ${BURST_SIZE.toLocaleString()}`)
  console.log(`Successful (202): ${successful.toLocaleString()} (${((successful/BURST_SIZE)*100).toFixed(2)}%)`)
  console.log(`Backpressure (503): ${backpressureCount.toLocaleString()} (${((backpressureCount/BURST_SIZE)*100).toFixed(2)}%)`)
  console.log(`Rate Limited (429): ${rateLimitCount.toLocaleString()} (${((rateLimitCount/BURST_SIZE)*100).toFixed(2)}%)`)
  console.log(`Other Errors: ${failed.toLocaleString()}`)
  console.log('')
  console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`)
  console.log(`Actual Rate: ${Number(actualRate).toLocaleString()} req/sec`)
  console.log('')
  console.log(`Latency Stats:`)
  console.log(`  Avg: ${avgLatency.toFixed(2)}ms`)
  console.log(`  Min: ${minLatency.toFixed(2)}ms`)
  console.log(`  Max: ${maxLatency.toFixed(2)}ms`)
  console.log(`  P50: ${p50.toFixed(2)}ms`)
  console.log(`  P95: ${p95.toFixed(2)}ms`)
  console.log(`  P99: ${p99.toFixed(2)}ms`)
  console.log('='.repeat(60))
  
  // Verification checks
  console.log('\n✅ VERIFICATION')
  console.log('='.repeat(60))
  
  const metBurstRequirement = Number(actualRate) >= 10000
  const backpressureWorks = backpressureCount > 0
  
  console.log(`Burst Rate (≥10k/sec): ${metBurstRequirement ? '✅ PASS' : '❌ FAIL'} (${actualRate} req/sec)`)
  console.log(`Backpressure Active (503s): ${backpressureWorks ? '✅ PASS' : '⚠️  NO BACKPRESSURE'} (${backpressureCount} responses)`)
  console.log(`Success Rate: ${((successful/BURST_SIZE)*100).toFixed(2)}%`)
  console.log('='.repeat(60))
  
  if (metBurstRequirement && backpressureWorks) {
    console.log('\n🎉 HAMMER TEST PASSED - System handles 10k/sec burst with backpressure')
  } else if (!metBurstRequirement) {
    console.log('\n⚠️  HAMMER TEST WARNING - Did not achieve 10k/sec burst rate')
  } else {
    console.log('\n⚠️  HAMMER TEST WARNING - Backpressure not triggered (buffer may not be filling)')
  }
  
  process.exit(metBurstRequirement ? 0 : 1)
}

runHammer().catch(err => {
  console.error('❌ Hammer test failed:', err)
  process.exit(1)
})
