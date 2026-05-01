/**
 * Metrics logger for observability.
 * Tracks signals/sec and exposes basic health data.
 */

let signalsIngestedWindow = 0;
let signalsTotal = 0;
let intervalId: Timer | NodeJS.Timeout | null = null;
const START_TIME = Date.now();

export function recordSignalIngestion(count = 1): void {
  signalsIngestedWindow += count;
  signalsTotal += count;
}

export function startThroughputLogger(): void {
  if (intervalId) return;
  
  // Log throughput every 5 seconds
  intervalId = setInterval(() => {
    const rate = signalsIngestedWindow / 5;
    console.log(`Signals/sec: ${rate}`);
    signalsIngestedWindow = 0;
  }, 5000);
}

export function stopThroughputLogger(): void {
  if (intervalId) {
    clearInterval(intervalId as NodeJS.Timeout);
    intervalId = null;
  }
}

export function getHealthMetrics() {
  return {
    uptime_s: Math.floor((Date.now() - START_TIME) / 1000),
    signals_total: signalsTotal,
    throughput_per_sec: signalsIngestedWindow / 5,
  };
}
