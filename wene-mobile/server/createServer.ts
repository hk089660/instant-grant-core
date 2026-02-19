/**
 * テスト起動しやすい HTTP サーバ
 * PORT=0 で起動可能（port 衝突回避）
 */

import express, { Express } from 'express';
import { createV1SchoolRouter } from './routes/v1School';
import { createApiRouter } from './routes/api';
import type { SchoolStorage } from './storage/MemoryStorage';
import type { Clock } from './clock';

export interface CreateServerOptions {
  storage: SchoolStorage;
  clock?: Clock;
  logger?: (msg: string) => void;
}

export function createServer(options: CreateServerOptions): Express {
  const { storage, logger = () => { } } = options;
  const app = express();

  app.use(express.json());

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  app.options('*', (_req, res) => res.sendStatus(204));

  app.use('/v1/school', createV1SchoolRouter({ storage }));

  // /api/users/register などの実装
  app.use('/api', createApiRouter({ storage }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

export function listen(app: Express, port: number): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          }),
      });
    });
    server.on('error', reject);
  });
}
