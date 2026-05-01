import express from "express";
import cors from 'cors'
import { config } from './config.ts'
import { connectPostgres } from './db/postgres.ts'
import { connectMongo } from './db/mongo.ts'
import { connectRedis } from './db/redis.ts'
import { ingestionRouter } from './ingestion/router.ts'

const PORT = config.PORT
const app = express()

app.use(cors())
app.use(express.json())

function setupWebSocket(_port: number) { /* Phase 6 */ }
function startWorker() { /* Phase 3 */ }
function startThroughputLogger() { /* Phase 6 */ }






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