import express from "express";
import cors from 'cors'
import { config } from './config.ts'
import { connectPostgres, pool } from './db/postgres.ts'
import { connectMongo } from './db/mongo.ts'
import { connectRedis } from './db/redis.ts'
import { ingestionRouter } from './ingestion/router.ts'
import { workItemsRouter } from './routes/workItems.ts'
import { rcaRouter } from './routes/rca.ts'
import { dashboardRouter } from './routes/dashboard.ts'
import { apiDocsRouter } from './routes/apiDocs.ts'
import { startWorker, stopWorker } from './queue/worker.ts'
import { closeQueue } from './queue/producer.ts'

const PORT = config.PORT
const app = express()

app.use(cors())
app.use(express.json())

import { setupWebSocket } from './websocket/server.ts'
import { startThroughputLogger, stopThroughputLogger, getHealthMetrics } from './observability/metrics.ts'

// Graceful shutdown — stop accepting work before closing connections
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[IMS] Received ${signal} — shutting down gracefully…`)
  stopThroughputLogger()
  await stopWorker()
  await closeQueue()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))






app.use('/api', ingestionRouter)
app.use('/api', workItemsRouter)
app.use('/api', rcaRouter)
app.use('/api', dashboardRouter)
app.use('/', apiDocsRouter)

app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), ...getHealthMetrics() })
})

async function bootstrap() {
  await connectPostgres()
  await connectMongo()
  await connectRedis()

  startWorker()
  startThroughputLogger()
 
  const server = app.listen(PORT, () => {
    console.log(`IMS server running on :${PORT}`)
  })
  
  setupWebSocket(server)
}
 
bootstrap().catch(console.error)