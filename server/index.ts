import express from "express";
import cors from 'cors'
import { config } from './config.ts'
import { connectPostgres } from './db/postgres.ts'
import { connectMongo } from './db/mongo.ts'
import { connectRedis } from './db/redis.ts'
import { ingestionRouter } from './ingestion/router.ts'
import { startWorker, stopWorker } from './queue/worker.ts'
import { closeQueue } from './queue/producer.ts'

const PORT = config.PORT
const app = express()

app.use(cors())
app.use(express.json())

function setupWebSocket(_port: number) { /* Phase 6 */ }
function startThroughputLogger() { /* Phase 6 */ }

// Graceful shutdown — stop accepting work before closing connections
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[IMS] Received ${signal} — shutting down gracefully…`)
  await stopWorker()
  await closeQueue()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))






app.use('/api', ingestionRouter)

app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

async function bootstrap() {
  await connectPostgres()
  await connectMongo()
  await connectRedis()

  setupWebSocket(Number(PORT))
  startWorker()
  startThroughputLogger()
 
  app.listen(PORT, () => {
    console.log(`IMS server running on :${PORT}`)
  })
}
 
bootstrap().catch(console.error)