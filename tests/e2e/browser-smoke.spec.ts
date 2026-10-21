import { test, expect } from '@playwright/test';
import http from 'http';
import { MongoMemoryServer } from '../../server/node_modules/mongodb-memory-server';
import { Server } from '../../server/node_modules/@hocuspocus/server';
import { createExpressApp } from '../../server/src/api';
import { createCollabServer } from '../../server/src/collaboration/server';
import { connectDB, disconnectDB } from '../../server/src/db/connection';

test.describe('CollabSpace Real Browser-Based End-to-End Smoke Test', () => {
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
    // 1. Start MongoDB in-memory database
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());

    // 2. Start Hocuspocus Collaboration WebSocket Server on port 1234
    collabServer = createCollabServer({
      port: collabPort,
      debounce: 100,
      maxDebounce: 300,
      quiet: true,
    });
    await collabServer.listen();

    // 3. Start Express REST API Server on port 5000
    const app = createExpressApp();
    await new Promise<void>((resolve) => {
      expressServer = app.listen(apiPort, () => {
        resolve();
      });
    });

    // 4. Register Alice via REST API
    const aliceRegRes = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.smoke@example.com',
        password: 'Password123!',
        name: 'Alice',
        color: '#3B82F6',
      }),
    });
    expect(aliceRegRes.status).toBe(201);
    const aliceData = await aliceRegRes.json();
    aliceAuthToken = aliceData.token;

    // 5. Register Bob via REST API
    const bobRegRes = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob.smoke@example.com',
        password: 'Password123!',
        name: 'Bob',
        color: '#10B981',
      }),
    });
    expect(bobRegRes.status).toBe(201);
    const bobData = await bobRegRes.json();
    bobAuthToken = bobData.token;

    // 6. Alice creates shared document via REST API
    const createDocRes = await fetch(`${apiUrl}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuthToken}`,
      },
      body: JSON.stringify({
        title: 'Real-Time Browser Smoke Test Document',
      }),
    });
    expect(createDocRes.status).toBe(201);
    const docData = await createDocRes.json();
    sharedDocId = docData.document.id;

    // 7. Alice grants Bob access as 'editor' via REST API
    const addCollabRes = await fetch(`${apiUrl}/documents/${sharedDocId}/collaborators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAuthToken}`,
      },
      body: JSON.stringify({
        email: 'bob.smoke@example.com',
        role: 'editor',
      }),
    });
    expect(addCollabRes.status).toBe(200);

    // 8. Issue document-scoped WebSocket tokens for Alice and Bob
    const aliceTokenRes = await fetch(`${apiUrl}/documents/${sharedDocId}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceAuthToken}`,
      },
    });
    expect(aliceTokenRes.status).toBe(200);
    aliceDocToken = (await aliceTokenRes.json()).token;

    const bobTokenRes = await fetch(`${apiUrl}/documents/${sharedDocId}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bobAuthToken}`,
      },
    });
    expect(bobTokenRes.status).toBe(200);
    bobDocToken = (await bobTokenRes.json()).token;
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

  test('verifies bidirectional editing, live cursors, avatar presence, and disconnect cleanup in real browsers', async ({
    browser,
  }) => {
    const aliceErrors: string[] = [];
    const bobErrors: string[] = [];

    // ── 1. Create Context and Page for Alice ─────────────────────────────────
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();

    pageAlice.on('console', (msg) => {
      if (msg.type() === 'error') {
        aliceErrors.push(msg.text());
      }
    });
    pageAlice.on('pageerror', (err) => {
      aliceErrors.push(err.message);
    });

    const aliceUrl = `/?doc=${sharedDocId}&token=${aliceDocToken}&user=Alice&color=%233B82F6`;
    await pageAlice.goto(aliceUrl);

    // Verify Alice is connected
    await expect(pageAlice.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(pageAlice.getByTestId('avatar-alice')).toBeVisible();

    // ── 2. Create Independent Context and Page for Bob ──────────────────────
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    pageBob.on('console', (msg) => {
      if (msg.type() === 'error') {
        bobErrors.push(msg.text());
      }
    });
    pageBob.on('pageerror', (err) => {
      bobErrors.push(err.message);
    });

    const bobUrl = `/?doc=${sharedDocId}&token=${bobDocToken}&user=Bob&color=%2310B981`;
    await pageBob.goto(bobUrl);

    // Verify Bob is connected
    await expect(pageBob.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.getByTestId('avatar-bob')).toBeVisible();

    // ── 3. Verify Collaborator List Shows Both Users ─────────────────────────
    await expect(pageAlice.getByTestId('avatar-bob')).toBeVisible({ timeout: 6000 });
    await expect(pageBob.getByTestId('avatar-alice')).toBeVisible({ timeout: 6000 });

    // ── 4. Verify Direction 1: Bob types -> Alice sees text and Bob's live caret ─
    const bobEditor = pageBob.locator('.tiptap-editor-content .ProseMirror');
    await bobEditor.click();
    await pageBob.keyboard.type('Hello from Bob in browser!');

    const aliceEditor = pageAlice.locator('.tiptap-editor-content .ProseMirror');
    await expect(aliceEditor).toContainText('Hello from Bob in browser!', { timeout: 6000 });

    // Verify Bob's colored caret and name label appear in Alice's editor
    const bobsCaretInAlice = pageAlice.locator('.collaboration-cursor__caret');
    await expect(bobsCaretInAlice).toBeVisible({ timeout: 6000 });
    const bobsLabelInAlice = pageAlice.locator('.collaboration-cursor__label');
    await expect(bobsLabelInAlice).toBeVisible({ timeout: 6000 });
    await expect(bobsLabelInAlice).toHaveText('Bob');

    // ── 5. Verify Direction 2: Alice types -> Bob sees text and Alice's live caret ─
    await aliceEditor.click();
    await pageAlice.keyboard.press('End');
    await pageAlice.keyboard.type(' And hello back from Alice!');

    await expect(bobEditor).toContainText(
      'Hello from Bob in browser! And hello back from Alice!',
      { timeout: 6000 }
    );

    // Verify Alice's colored caret and name label appear in Bob's editor
    const alicesCaretInBob = pageBob.locator('.collaboration-cursor__caret');
    await expect(alicesCaretInBob).toBeVisible({ timeout: 6000 });
    const alicesLabelInBob = pageBob.locator('.collaboration-cursor__label');
    await expect(alicesLabelInBob).toBeVisible({ timeout: 6000 });
    await expect(alicesLabelInBob).toHaveText('Alice');

    // ── 6. Disconnect Bob & Verify Awareness Cleanup ─────────────────────────
    await contextBob.close();

    // Verify Bob disappears from Alice's collaborator list
    await expect(pageAlice.getByTestId('avatar-bob')).not.toBeVisible({ timeout: 8000 });

    // Verify Bob's caret is cleaned up in Alice's editor
    await expect(pageAlice.locator('.collaboration-cursor__label')).not.toBeVisible({ timeout: 6000 });

    // Alice remains connected and alone in the collaborator list
    await expect(pageAlice.getByTestId('avatar-alice')).toBeVisible();

    // ── 7. Verify No Console Errors or Failed WebSocket Auth Occurred ────────
    // Filter out expected non-critical network aborts if any
    const criticalAliceErrors = aliceErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ResizeObserver')
    );
    const criticalBobErrors = bobErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ResizeObserver')
    );

    expect(criticalAliceErrors).toEqual([]);
    expect(criticalBobErrors).toEqual([]);

    await contextAlice.close();
  });
});
