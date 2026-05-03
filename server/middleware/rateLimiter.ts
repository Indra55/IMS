import rateLimit from 'express-rate-limit'
import { config } from '../config.ts'
import type { Request, Response, NextFunction } from 'express'

export const signalRateLimiter = config.DISABLE_RATE_LIMIT
  ? (_req: Request, _res: Response, next: NextFunction) => next() // No-op when disabled
  : rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many requests',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
      },
    })
