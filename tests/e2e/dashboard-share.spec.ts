import { test, expect } from '@playwright/test';
import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from '../../server/node_modules/@hocuspocus/server';
import { createExpressApp } from '../../server/src/api';
import { createCollabServer } from '../../server/src/collaboration/server';
import { connectDB, disconnectDB } from '../../server/src/db/connection';

test.describe('Document Dashboard & Share Modal (Phase 6 E2E Tests)', () => {
  let mongod: MongoMemoryServer;
  let expressServer: http.Server;
  let collabServer: Server;

  const apiPort = 5000;
  const collabPort = 1234;
  const apiUrl = `http://localhost:${apiPort}/api`;

  test.beforeAll(async () => {
    // 1. Start MongoDB in-memory database
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());

    // 2. Start Hocuspocus Collaboration WebSocket Server
    collabServer = createCollabServer({
      port: collabPort,
      debounce: 100,
      maxDebounce: 300,
      quiet: true,
    });
    await collabServer.listen();

    // 3. Start Express REST API Server
    const app = createExpressApp();
    await new Promise<void>((resolve) => {
      expressServer = app.listen(apiPort, () => {
        resolve();
      });
    });

    // 4. Seed test user Alice via API
    await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.dash@example.com',
        password: 'Password123!',
        name: 'Alice Dashboard',
        color: '#3B82F6',
      }),
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

  test('verifies document creation, editing, share modal viewer/editor role toggle, and deletion', async ({
    browser,
  }) => {
    // ── 1. User A (Alice) signs in via UI ───────────────────────────────────
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();

    await pageAlice.goto('/');

    // Verify Landing page is shown
    await expect(pageAlice.getByText('Without Merge Conflicts.')).toBeVisible();

    // Open Sign In Modal
    await pageAlice.getByRole('button', { name: 'Sign In' }).first().click();
    await expect(pageAlice.getByText('Welcome back to CollabSpace')).toBeVisible();

    // Fill credentials
    await pageAlice.getByLabel('Email address').fill('alice.dash@example.com');
    await pageAlice.getByLabel('Password').fill('Password123!');
    await pageAlice.getByRole('button', { name: 'Sign In' }).last().click();

    // Verify redirected to Dashboard
    await expect(pageAlice.getByText('Welcome back, Alice Dashboard!')).toBeVisible({
      timeout: 10000,
    });

    // ── 2. Alice creates a new document ─────────────────────────────────────
    await pageAlice.getByRole('button', { name: 'New Document', exact: true }).click();
    await expect(pageAlice.getByRole('heading', { name: 'Create New Document' })).toBeVisible();

    await pageAlice.getByLabel('Document Title').fill('Phase 6 Launch Roadmap');
    await pageAlice.getByRole('dialog').getByRole('button', { name: 'Create Document' }).click();

    // Verify transitioned to editor
    const aliceTitleInput = pageAlice.getByLabel('Document Title');
    await expect(aliceTitleInput).toHaveValue('Phase 6 Launch Roadmap', {
      timeout: 10000,
    });
    await expect(pageAlice.getByText('Connected')).toBeVisible({ timeout: 10000 });

    // Type content into collaborative editor
    const aliceEditor = pageAlice.locator('.tiptap-editor-content .ProseMirror');
    await aliceEditor.click();
    await pageAlice.keyboard.type('Roadmap milestone 1: Complete Phase 6.');
    await expect(aliceEditor).toContainText('Roadmap milestone 1: Complete Phase 6.');

    // ── 3. Alice opens Share Modal and sets public access to Viewer ──────────
    await pageAlice.getByRole('button', { name: 'Share' }).click();
    await expect(pageAlice.getByRole('heading', { name: 'Share Document' })).toBeVisible();

    // Set permission to "Can view" (read-only)
    await pageAlice.getByRole('button', { name: 'Can view' }).click();
    await expect(pageAlice.getByRole('button', { name: 'Can view' })).toHaveClass(
      /bg-amber-100/
    );

    // Read the document share URL
    const docUrl = pageAlice.url();
    const docId = new URL(docUrl).searchParams.get('doc');
    expect(docId).toBeTruthy();

    // Close share modal
    await pageAlice.getByLabel('Close dialog').click();

    // ── 4. User B (Guest) opens document via public link in View-Only Mode ──
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();

    await pageBob.goto(`/?doc=${docId}`);

    // Verify Bob connects
    await expect(pageBob.getByText('Connected')).toBeVisible({ timeout: 10000 });

    // Verify Bob sees title and content
    const bobTitleInput = pageBob.getByLabel('Document Title');
    await expect(bobTitleInput).toHaveValue('Phase 6 Launch Roadmap', { timeout: 6000 });
    const bobEditor = pageBob.locator('.tiptap-editor-content .ProseMirror');
    await expect(bobEditor).toContainText('Roadmap milestone 1: Complete Phase 6.', {
      timeout: 6000,
    });

    // Verify Bob sees Read-Only indication
    await expect(pageBob.getByText('Viewing only:')).toBeVisible();
    await expect(pageBob.getByText('Read-Only', { exact: true })).toBeVisible();

    // Verify Bob's editor is read-only (contenteditable is false)
    await expect(bobEditor).toHaveAttribute('contenteditable', 'false');

    // ── 5. Alice updates public access to Editor in Share Modal ─────────────
    await pageAlice.getByRole('button', { name: 'Share' }).click();
    await pageAlice.getByRole('button', { name: 'Can edit' }).click();
    await expect(pageAlice.getByRole('button', { name: 'Can edit' })).toHaveClass(
      /bg-emerald-100/
    );
    await pageAlice.getByLabel('Close dialog').click();

    // ── 6. Bob reloads and can now edit ─────────────────────────────────────
    await pageBob.reload();
    await expect(pageBob.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(bobEditor).toHaveAttribute('contenteditable', 'true');

    await bobEditor.click();
    await pageBob.keyboard.press('End');
    await pageBob.keyboard.type(' Approved by Bob.');

    // Verify Alice sees Bob's synchronized changes
    await expect(aliceEditor).toContainText(
      'Roadmap milestone 1: Complete Phase 6. Approved by Bob.',
      { timeout: 6000 }
    );

    await contextBob.close();

    // ── 7. Alice navigates back to Dashboard ────────────────────────────────
    await pageAlice.getByRole('button', { name: 'Documents' }).click();
    await expect(pageAlice.getByText('Welcome back, Alice Dashboard!')).toBeVisible({
      timeout: 10000,
    });

    // Document card is listed on the dashboard
    const docCard = pageAlice.getByTestId(`document-card-${docId}`);
    await expect(docCard).toBeVisible();
    await expect(docCard.getByText('Phase 6 Launch Roadmap')).toBeVisible();
    await expect(docCard.getByText('Owner')).toBeVisible();

    // ── 8. Alice deletes the document ───────────────────────────────────────
    pageAlice.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await docCard.hover();
    await docCard.getByTitle('Delete document').click();

    // Document card disappears from dashboard
    await expect(docCard).not.toBeVisible({ timeout: 6000 });

    await contextAlice.close();
  });
});
