import rateLimit from 'express-rate-limit'
import { config } from '../config.ts'

export const signalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
  },
})
