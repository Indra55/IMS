import { expect, test, describe, beforeEach, afterEach } from 'bun:test'
import { addSignal, setFlushHandler, shutdown } from '../ingestion/debouncer.ts'
import { config } from '../config.ts'
import type { SignalInput } from '../ingestion/schema.ts'

describe('Debouncer', () => {
  let flushed: { componentId: string; signals: SignalInput[] }[] = []

  beforeEach(() => {
    flushed = []
    setFlushHandler((componentId, signals) => {
      flushed.push({ componentId, signals })
    })
    
    // Mutate config for fast deterministic tests
    config.DEBOUNCE_WINDOW_MS = 50 
    config.DEBOUNCE_THRESHOLD = 5
  })

  afterEach(() => {
    shutdown() // Ensure all buckets are cleared between tests
  })

  test('threshold triggers flush immediately', () => {
    for (let i = 0; i < 5; i++) {
      addSignal({
        signal_id: `s${i}`,
        component_id: 'comp_1',
        component_type: 'API',
        severity: 'HIGH',
        message: 'test',
        timestamp: new Date().toISOString()
      })
    }

    // Since threshold is 5, it should flush synchronously on the 5th signal
    expect(flushed.length).toBe(1)
    expect(flushed[0].componentId).toBe('comp_1')
    expect(flushed[0].signals.length).toBe(5)
  })

  test('different component_ids are bucketed separately', () => {
    addSignal({ signal_id: '1', component_id: 'c1', component_type: 'API', severity: 'HIGH', message: 'test', timestamp: new Date().toISOString() })
    addSignal({ signal_id: '2', component_id: 'c2', component_type: 'API', severity: 'HIGH', message: 'test', timestamp: new Date().toISOString() })

    // Threshold not met, window not expired yet
    expect(flushed.length).toBe(0)
    
    // Forcefully shutdown to flush everything
    shutdown()

    expect(flushed.length).toBe(2)
  })

  test('window timeout triggers flush', async () => {
    addSignal({ signal_id: '1', component_id: 'c3', component_type: 'API', severity: 'HIGH', message: 'test', timestamp: new Date().toISOString() })
    
    expect(flushed.length).toBe(0)

    // Wait for the 50ms window to expire
    await new Promise(r => setTimeout(r, 60))

    expect(flushed.length).toBe(1)
    expect(flushed[0].componentId).toBe('c3')
  })
})
