import Redis from 'ioredis'
import { config } from '../config.ts'

/**
 * Primary Redis client — used for caching, dashboard state, and counters.
 * BullMQ manages its own connections internally; do NOT share this client with it.
 */
export const redis = new Redis(config.REDIS_URL, {

  retryStrategy(times) {
    const delay = Math.min(times * 500, 10_000)
    console.warn(`Redis reconnect attempt #${times} retrying in ${delay}ms`)
    return delay
  },
  lazyConnect: true,
})

redis.on('connect', () => console.log('Redis connected'))
redis.on('error', (err) => console.error('Redis error:', err.message))
redis.on('close', () => console.warn('Redis connection closed'))

 
export async function connectRedis(): Promise<void> {
  await redis.connect()
  const pong = await redis.ping()
  if (pong !== 'PONG') {
    throw new Error(`Redis health check failed – expected PONG, got: ${pong}`)
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit()
  console.log('Redis disconnected gracefully')
}


const DASHBOARD_KEY = 'ims:dashboard:state'
const WORK_ITEM_PREFIX = 'ims:work_item:'
const SIGNAL_COUNT_PREFIX = 'ims:signals:'


const DASHBOARD_TTL = 60
const WORK_ITEM_TTL = 30
const SIGNAL_COUNT_TTL = 3600

// Dashboard Cache

export async function setDashboardState(state: Record<string, unknown>): Promise<void> {
  await redis.set(DASHBOARD_KEY, JSON.stringify(state), 'EX', DASHBOARD_TTL)
}

export async function getDashboardState(): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(DASHBOARD_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

// Work Item Cache

export async function setWorkItemCache(id: string, data: Record<string, unknown>): Promise<void> {
  await redis.set(`${WORK_ITEM_PREFIX}${id}`, JSON.stringify(data), 'EX', WORK_ITEM_TTL)
}

export async function getWorkItemCache(id: string): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(`${WORK_ITEM_PREFIX}${id}`)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

export async function invalidateWorkItemCache(id: string): Promise<void> {
  await redis.del(`${WORK_ITEM_PREFIX}${id}`)
}

// Signal Counters
export async function incrementSignalCount(componentId: string): Promise<number> {
  const key = `${SIGNAL_COUNT_PREFIX}${componentId}`
  const pipeline = redis.pipeline()
  pipeline.incr(key)
  pipeline.expire(key, SIGNAL_COUNT_TTL)
  const results = await pipeline.exec()
  const entry = results?.[0]
  if (!entry) throw new Error('Redis pipeline returned no results')
  if (entry[0]) throw entry[0]
  return entry[1] as number
}

export async function getSignalCount(componentId: string): Promise<number> {
  const val = await redis.get(`${SIGNAL_COUNT_PREFIX}${componentId}`)
  return val ? parseInt(val, 10) : 0
}

export async function resetSignalCount(componentId: string): Promise<void> {
  await redis.del(`${SIGNAL_COUNT_PREFIX}${componentId}`)
}