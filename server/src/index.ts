/**
 * server/src/index.ts
 *
 * Development convenience entrypoint.
 * Starts both the Express REST API and the Hocuspocus collaboration server
 * in a single Node.js process.
 */

import 'dotenv/config';
import { createExpressApp } from './api';
import { createCollabServer } from './collaboration/server';
import { connectDB } from './db/connection';
import { DocumentModel } from './db/models/Document';
import { UserModel } from './db/models/User';
import { signDocToken } from './utils/tokens';
import { env } from './config/env';

async function main() {
  let mongodInstance: any = null;

  // 1. Database Connection (connect to local MongoDB or fallback to in-memory)
  try {
    await connectDB();
    console.log('[db]    Connected to MongoDB at', env.MONGODB_URI);
  } catch {
    console.log('[db]    Local MongoDB not reachable, starting in-memory database fallback...');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create();
    await connectDB(mongodInstance.getUri());
    console.log('[db]    Connected to in-memory MongoDB');
  }

  // 2. Express REST API
  const app = createExpressApp();
  const apiServer = app.listen(env.PORT, () => {
    console.log(`[api]   REST API listening on http://localhost:${env.PORT}`);
  });

  // 3. Hocuspocus Collaboration Server
  const collabServer = createCollabServer({ quiet: true });
  await collabServer.listen();
  console.log(`[collab] Hocuspocus listening on ws://localhost:${env.COLLAB_PORT}`);

  // 4. Seed Demo Document & Users for 2-user instant testing
  let alice = await UserModel.findOne({ email: 'alice@collabspace.dev' });
  if (!alice) {
    alice = await UserModel.create({
      email: 'alice@collabspace.dev',
      passwordHash: 'hash',
      name: 'Alice',
      color: '#3B82F6',
    });
  }

  let bob = await UserModel.findOne({ email: 'bob@collabspace.dev' });
  if (!bob) {
    bob = await UserModel.create({
      email: 'bob@collabspace.dev',
      passwordHash: 'hash',
      name: 'Bob',
      color: '#10B981',
    });
  }

  let demoDoc = await DocumentModel.findById('doc_demo');
  if (!demoDoc) {
    demoDoc = await DocumentModel.create({
      _id: 'doc_demo',
      title: 'CollabSpace Real-Time Collaboration Demo',
      ownerId: alice._id,
      collaborators: [{ userId: bob._id, role: 'editor' }],
      isPublic: true,
      publicRole: 'editor',
    });
  }

  const aliceToken = signDocToken({
    userId: alice._id.toString(),
    name: 'Alice',
    color: '#3B82F6',
    documentId: 'doc_demo',
    role: 'owner',
  });

  const bobToken = signDocToken({
    userId: bob._id.toString(),
    name: 'Bob',
    color: '#10B981',
    documentId: 'doc_demo',
    role: 'editor',
  });

  console.log('\n========================================================================');
  console.log('  🚀 CollabSpace is ready! Test in two browser windows or tabs:');
  console.log('========================================================================');
  console.log(`  👤 User 1 (Alice): http://localhost:5173/?doc=doc_demo&token=${aliceToken}&user=Alice&color=%233B82F6`);
  console.log(`  👤 User 2 (Bob):   http://localhost:5173/?doc=doc_demo&token=${bobToken}&user=Bob&color=%2310B981`);
  console.log('========================================================================\n');

  const shutdown = async () => {
    console.log('\nGracefully shutting down servers...');
    collabServer.hocuspocus.flushPendingStores();
    await collabServer.destroy();
    apiServer.close(async () => {
      if (mongodInstance) {
        await mongodInstance.stop();
      }
      console.log('Servers shut down cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start development servers:', err);
  process.exit(1);
});
