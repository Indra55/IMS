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

import { broadcastEvent } from '../websocket/server.js';
import { redis } from '../db/redis.js';

export async function recordDroppedSignal(count = 1): Promise<void> {
  try {
    await redis.incrby('metrics:signals:dropped', count);
  } catch (err) {
    // Ignore metric logging failures
  }
}

export function startThroughputLogger(): void {
  if (intervalId) return;
  
  // Log throughput every 5 seconds
  intervalId = setInterval(async () => {
    const rate = signalsIngestedWindow / 5;
    
    let dropped = 0;
    try {
      const droppedStr = await redis.get('metrics:signals:dropped');
      dropped = parseInt(droppedStr || '0', 10);
      if (dropped > 0) {
        await redis.del('metrics:signals:dropped');
      }
    } catch (err) {
      // Ignore Redis errors for metrics
    }

    if (rate > 0 || dropped > 0) {
      console.log(`Signals/sec: ${rate} | Dropped: ${dropped}`);
    }
    
    // Broadcast to UI
    broadcastEvent('metrics:throughput', { count: rate, dropped, timestamp: Date.now() });
    
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
