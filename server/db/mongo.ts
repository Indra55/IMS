import mongoose from 'mongoose'
import { config } from '../config.ts'

mongoose.connection.on('connected', () => console.log('MongoDB connected'))
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'))
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err.message))

export async function connectMongo(maxRetries = 5): Promise<typeof mongoose> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await mongoose.connect(config.MONGODB_URL, {
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 20,
      })
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(`MongoDB connection failed after ${maxRetries} attempts: ${(err as Error).message}`)
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000)
      console.warn(
        `⏳ MongoDB connection attempt ${attempt}/${maxRetries} failed – retrying in ${delay}ms…`,
        (err as Error).message,
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw new Error('connectMongo: unexpected control flow')
}


export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect()
  console.log('🔌 MongoDB disconnected gracefully')
}