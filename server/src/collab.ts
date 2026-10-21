/**
 * server/src/collab.ts
 *
 * Hocuspocus collaboration server entrypoint.
 * Can be started independently for production or development.
 *
 * Usage:
 *   npm run dev:collab    → tsx watch src/collab.ts
 *   npm run start:collab  → node dist/collab.js
 */

import 'dotenv/config';
import { createCollabServer } from './collaboration/server';
import { connectDB, disconnectDB } from './db/connection';
import { env } from './config/env';

export { createCollabServer };

if (require.main === module) {
  connectDB().then(() => {
    console.log('[db]    Connected to MongoDB for collaboration server');
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : env.COLLAB_PORT;
    const address = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
    const server = createCollabServer({ port, address, quiet: false });

    server.listen().then(() => {
      console.log(`[collab] Hocuspocus collaboration server listening on ws://${address}:${port}`);
    });

    const shutdown = async () => {
      console.log('\n[collab] Shutting down collaboration server...');
      server.hocuspocus.flushPendingStores();
      await server.destroy();
      await disconnectDB();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((err) => {
    console.error('Failed to initialize collaboration server:', err);
    process.exit(1);
  });
}
