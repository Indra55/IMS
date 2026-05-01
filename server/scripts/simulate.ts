import { parseArgs } from 'util'

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    rate: { type: 'string', default: '1000' },
    duration: { type: 'string', default: '10' },
  },
  strict: true,
  allowPositionals: true,
});

const rate = parseInt(values.rate as string, 10);
const duration = parseInt(values.duration as string, 10);

// Point this to your backend Express server
const BASE_URL = 'http://localhost:5555/api/signals';

const SCENARIOS = [
  { component_id: 'RDBMS_PRIMARY_01', component_type: 'RDBMS', severity: 'CRITICAL', weight: 50 }, // 500/1000 signals approx
  { component_id: 'CACHE_CLUSTER_01', component_type: 'CACHE', severity: 'MEDIUM', weight: 20 },
  { component_id: 'CACHE_CLUSTER_02', component_type: 'CACHE', severity: 'MEDIUM', weight: 20 },
  { component_id: 'MCP_HOST_01', component_type: 'MCP_HOST', severity: 'HIGH', weight: 30 },
  { component_id: 'API_GATEWAY_01', component_type: 'API', severity: 'LOW', weight: 80 }
];

function pickScenario() {
  const total = SCENARIOS.reduce((sum, s) => sum + s.weight, 0);
  let rand = Math.random() * total;
  for (const s of SCENARIOS) {
    if (rand < s.weight) return s;
    rand -= s.weight;
  }
  return SCENARIOS[0]!;
}

async function fireSignal() {
  const sc = pickScenario();
  const payload = {
    signal_id: crypto.randomUUID(),
    component_id: sc.component_id,
    component_type: sc.component_type,
    severity: sc.severity,
    message: `Simulated failure for ${sc.component_id}`,
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Ignore fetch errors to keep simulation running at max throughput
  }
}

async function run() {
  console.log(`🚀 Starting simulation: ${rate} signals/sec for ${duration} seconds`);
  
  const totalSignals = rate * duration;
  const batchSize = Math.floor(rate / 10); // 10 batches per second (100ms interval)
  let sent = 0;

  const interval = setInterval(async () => {
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      if (sent >= totalSignals) break;
      promises.push(fireSignal());
      sent++;
    }
    await Promise.all(promises);

    if (sent >= totalSignals) {
      clearInterval(interval);
      console.log(`✅ Completed simulation. Sent ${sent} signals.`);
      process.exit(0);
    }
  }, 100);
}

run();
