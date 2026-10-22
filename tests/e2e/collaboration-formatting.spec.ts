import { test, expect } from '@playwright/test';
import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from '../../server/node_modules/@hocuspocus/server';
import { createExpressApp } from '../../server/src/api';
import { createCollabServer } from '../../server/src/collaboration/server';
import { connectDB, disconnectDB } from '../../server/src/db/connection';

test.describe('Two-Browser Concurrent Collaboration & Rich-Text Formatting (E2E Test)', () => {
  let mongod: MongoMemoryServer;
  let expressServer: http.Server;
  let collabServer: Server;

  const apiPort = 5000;
  const collabPort = 1234;
  const apiUrl = `http://localhost:${apiPort}/api`;

  let aliceAuthToken: string;
  let bobAuthToken: string;
  let sharedDocId: string;
  let aliceDocToken: string;
  let bobDocToken: string;

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

    // Register Alice
    const aliceRes = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.format@example.com',
        password: 'Password123!',
        name: 'Alice',
        color: '#3B82F6',
      }),
    });
    aliceAuthToken = (await aliceRes.json()).token;

    // Register Bob
    const bobRes = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob.format@example.com',
        password: 'Password123!',
        name: 'Bob',
        color: '#10B981',
      }),
    });
    bobAuthToken = (await bobRes.json()).token;

    // Create shared document
    const docRes = await fetch(`${apiUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuthToken}`,
      },
      body: JSON.stringify({
        title: 'Initial Title',
      }),
    });
    sharedDocId = (await docRes.json()).document.id;

    // Add Bob as editor
    await fetch(`${apiUrl}/documents/${sharedDocId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuthToken}`,
      },
      body: JSON.stringify({
        email: 'bob.format@example.com',
        role: 'editor',
      }),
    });

    // Tokens
    const aTokenRes = await fetch(`${apiUrl}/documents/${sharedDocId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceAuthToken}` },
    });
    aliceDocToken = (await aTokenRes.json()).token;

    const bTokenRes = await fetch(`${apiUrl}/documents/${sharedDocId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobAuthToken}` },
    });
    bobDocToken = (await bTokenRes.json()).token;
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

  test('synchronizes rich-text formatting (bold, headings, blockquotes) and live title between concurrent browser contexts', async ({
    browser,
  }) => {
    // ── 1. Launch Alice and Bob Browser Contexts ──────────────────────────────
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await pageAlice.goto(`/?doc=${sharedDocId}&token=${aliceDocToken}&user=Alice&color=%233B82F6`);
    await expect(pageAlice.getByText('Connected')).toBeVisible({ timeout: 10000 });

    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await pageBob.goto(`/?doc=${sharedDocId}&token=${bobDocToken}&user=Bob&color=%2310B981`);
    await expect(pageBob.getByText('Connected')).toBeVisible({ timeout: 10000 });

    const aliceEditor = pageAlice.locator('.tiptap-editor-content .ProseMirror');
    const bobEditor = pageBob.locator('.tiptap-editor-content .ProseMirror');

    // ── 2. Live Title Synchronization ───────────────────────────────────────
    const aliceTitle = pageAlice.getByLabel('Document Title');
    const bobTitle = pageBob.getByLabel('Document Title');

    await expect(aliceTitle).toHaveValue('Initial Title', { timeout: 6000 });
    await expect(bobTitle).toHaveValue('Initial Title', { timeout: 6000 });

    // Alice updates the document title
    await aliceTitle.click();
    await aliceTitle.fill('Synchronized Roadmap Title');
    await pageAlice.keyboard.press('Enter');

    // Bob receives updated title in real-time via Yjs Map
    await expect(bobTitle).toHaveValue('Synchronized Roadmap Title', { timeout: 6000 });

    // ── 3. Rich Formatting: Alice applies Bold via Toolbar ───────────────────
    await aliceEditor.click();
    await pageAlice.keyboard.type('CRDT Bold Power');
    await aliceEditor.selectText();
    await pageAlice.getByRole('button', { name: 'Toggle Bold' }).click();

    // Bob's editor receives formatted text and contains <strong> tag
    await expect(bobEditor.locator('strong')).toContainText('CRDT Bold Power', {
      timeout: 6000,
    });

    // ── 4. Rich Formatting: Bob applies Blockquote via Toolbar ───────────────
    await bobEditor.click();
    await pageBob.keyboard.press('Enter');
    await pageBob.getByRole('button', { name: 'Toggle Blockquote' }).click();
    await pageBob.keyboard.type('Collaborative quote from Bob');

    // Alice's editor receives blockquote
    await expect(aliceEditor.locator('blockquote')).toContainText(
      'quote from Bob',
      { timeout: 6000 }
    );

    // ── 5. Rich Formatting: Heading 2 via Toolbar ───────────────────────────
    await aliceEditor.click();
    await pageAlice.keyboard.press('Enter');
    await pageAlice.getByRole('button', { name: 'Toggle Heading 2' }).click();
    await pageAlice.keyboard.type('Section Header Two');

    // Bob sees the h2 tag
    await expect(bobEditor.locator('h2')).toContainText('Header Two', {
      timeout: 6000,
    });

    await contextAlice.close();
    await contextBob.close();
  });
});
