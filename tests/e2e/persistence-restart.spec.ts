import { test, expect } from '@playwright/test';
import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from '../../server/node_modules/@hocuspocus/server';
import { createExpressApp } from '../../server/src/api';
import { createCollabServer } from '../../server/src/collaboration/server';
import { DocumentModel } from '../../server/src/db/models/Document';
import { UserModel } from '../../server/src/db/models/User';
import { connectDB, disconnectDB } from '../../server/src/db/connection';
import { signDocToken } from '../../server/src/utils/tokens';

test.describe('Document Restoration After Server Restart (E2E Test)', () => {
  let mongod: MongoMemoryServer;
  let expressServer: http.Server;
  let collabServer: Server;

  const apiPort = 5000;
  const collabPort = 1234;
  const docId = 'doc_restart_persistence';
  let aliceToken: string;

  test.beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());

    collabServer = createCollabServer({
      port: collabPort,
      debounce: 100,
      maxDebounce: 300,
      quiet: true,
    });
    await collabServer.listen();

    const app = createExpressApp();
    await new Promise<void>((resolve) => {
      expressServer = app.listen(apiPort, () => resolve());
    });

    const user = await UserModel.create({
      email: 'alice.persist@example.com',
      passwordHash: 'hash',
      name: 'Alice Persist',
      color: '#3B82F6',
    });

    await DocumentModel.create({
      _id: docId,
      title: 'Original Title Before Restart',
      ownerId: user._id,
      collaborators: [],
      isPublic: true,
      publicRole: 'editor',
    });

    aliceToken = signDocToken({
      userId: user._id.toString(),
      name: 'Alice',
      color: '#3B82F6',
      documentId: docId,
      role: 'owner',
    });
  }, 45000);

  test.afterAll(async () => {
    if (expressServer) {
      await new Promise<void>((resolve) => expressServer.close(() => resolve()));
    }
    if (collabServer) {
      collabServer.hocuspocus.flushPendingStores();
      await collabServer.destroy();
    }
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  });

  test('survives complete collaboration server restart and restores binary Yjs state and title', async ({
    browser,
  }) => {
    // ── 1. Alice connects and types content ──────────────────────────────────
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto(`/?doc=${docId}&token=${aliceToken}&user=Alice&color=%233B82F6`);
    await expect(page1.getByText('Connected')).toBeVisible({ timeout: 10000 });

    // Update title
    const titleInput = page1.getByLabel('Document Title');
    await titleInput.click();
    await titleInput.fill('Architecture Blueprint Post-Restart');
    await page1.keyboard.press('Enter');

    // Type content
    const editor = page1.locator('.tiptap-editor-content .ProseMirror');
    await editor.click();
    await page1.keyboard.type('State that must survive server restart and process termination.');
    await expect(editor).toContainText(
      'State that must survive server restart and process termination.',
      { timeout: 6000 }
    );

    // ── 2. Flush pending stores to MongoDB ───────────────────────────────────
    collabServer.hocuspocus.flushPendingStores();
    await new Promise((r) => setTimeout(r, 600));

    // Verify persisted in MongoDB
    const persistedInMongo = await DocumentModel.findById(docId);
    expect(persistedInMongo?.yjsState).not.toBeNull();
    expect(persistedInMongo?.title).toBe('Architecture Blueprint Post-Restart');

    // Close browser context
    await context1.close();

    // ── 3. Terminate the collaboration server completely ─────────────────────
    await collabServer.destroy();

    // ── 4. Boot a fresh collaboration server instance ───────────────────────
    collabServer = createCollabServer({
      port: collabPort,
      debounce: 100,
      maxDebounce: 300,
      quiet: true,
    });
    await collabServer.listen();

    // ── 5. Open new browser context and verify restoration ───────────────────
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(`/?doc=${docId}&token=${aliceToken}&user=Alice&color=%233B82F6`);
    await expect(page2.getByText('Connected')).toBeVisible({ timeout: 10000 });

    // Verify title was restored from MongoDB
    const restoredTitle = page2.getByLabel('Document Title');
    await expect(restoredTitle).toHaveValue('Architecture Blueprint Post-Restart', {
      timeout: 8000,
    });

    // Verify editor text content was restored from binary Yjs state in MongoDB
    const restoredEditor = page2.locator('.tiptap-editor-content .ProseMirror');
    await expect(restoredEditor).toContainText(
      'State that must survive server restart and process termination.',
      { timeout: 8000 }
    );

    await context2.close();
  });
});
