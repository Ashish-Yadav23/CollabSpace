/**
 * server/src/api.ts
 *
 * Express REST API entrypoint.
 * Can be started independently for production deployments where
 * the REST API must restart without affecting WebSocket sessions.
 *
 * Usage:
 *   npm run dev:api    → tsx watch src/api.ts
 *   npm run start:api  → node dist/api.js
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './api/routes/authRoutes';
import documentRoutes from './api/routes/documentRoutes';
import { errorHandler } from './api/middlewares/errorMiddleware';
import { connectDB, disconnectDB } from './db/connection';
import { env } from './config/env';

export function createExpressApp() {
  const app = express();

  // ── Security middleware ──────────────────────────────────────────────
  app.use(helmet());

  const allowedOrigins = env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
        }
      },
      credentials: true,
    }),
  );

  // ── Body parsing ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));

  // ── Health check ─────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'collabspace-api', version: '1.0.0' });
  });

  // ── API routes ───────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);

  // ── Error handling ───────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

// Allow running this file directly: `npx tsx src/api.ts`
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : env.PORT;
  const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
  connectDB().then(() => {
    const app = createExpressApp();
    const server = app.listen(PORT, HOST, () => {
      console.log(`[api] REST API listening on http://${HOST}:${PORT}`);
    });

    const shutdown = async () => {
      console.log('\n[api] Shutting down REST API server...');
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((err) => {
    console.error('Failed to connect database or start API:', err);
    process.exit(1);
  });
}
