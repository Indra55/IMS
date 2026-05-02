import { randomUUID } from 'crypto';

const API_URL = 'http://localhost:5555/api/signals';

/**
 * Helper to send a single signal to the ingestion API.
 */
async function sendSignal(componentId: string, componentType: string, severity: string, message: string) {
  const signal = {
    signal_id: randomUUID(),
    component_id: componentId,
    component_type: componentType,
    severity,
    message,
    timestamp: new Date().toISOString(),
    payload: { source: 'chaos_simulator' }
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal)
    });
    
    if (res.status === 503) {
      console.log('⚠️ Rate limited / Backpressure hit');
    } else if (!res.ok) {
      console.log(`❌ Error: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error('❌ Network error:', e);
  }
}

/**
 * Simulates a massive database outage that cascades into API failures.
 */
async function runChaosSimulation() {
  console.log('🔥 Starting Chaos Engineering Simulation...\n');
  
  // Phase 1: RDBMS Starts failing (Spike of 50 signals)
  console.log('🚨 [Phase 1] Database cluster "PG_PROD_01" is dropping connections...');
  for (let i = 0; i < 50; i++) {
    await sendSignal('PG_PROD_01', 'RDBMS', 'CRITICAL', `Connection timeout error (Pool exhausted) attempt #${i}`);
  }
  
  // Wait a second...
  await new Promise(r => setTimeout(r, 1000));
  
  // Phase 2: Microservices start timing out due to DB
  console.log('⚠️ [Phase 2] API Gateway "API_GW_US_EAST" cascading failure...');
  for (let i = 0; i < 150; i++) {
    await sendSignal('API_GW_US_EAST', 'API', 'HIGH', `504 Gateway Timeout while contacting upstream RDBMS. Request trace: ${randomUUID()}`);
  }

  // Phase 3: Cache drops because of load
  console.log('ℹ️ [Phase 3] Redis Cache "REDIS_CLUSTER_1" memory maxed out...');
  for (let i = 0; i < 20; i++) {
    await sendSignal('REDIS_CLUSTER_1', 'CACHE', 'MEDIUM', `OOM command not allowed when used memory > 'maxmemory'.`);
  }

  console.log('\n✅ Simulation complete! Check your Discord (if configured) and database.');
  console.log('You can now use the new Work Items to test your RCA generator.');
}

runChaosSimulation().catch(console.error);
