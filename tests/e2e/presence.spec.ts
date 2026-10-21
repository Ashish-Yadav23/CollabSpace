import { test, expect } from '@playwright/test';
import { MongoMemoryServer } from '../../server/node_modules/mongodb-memory-server';
import { Server } from '../../server/node_modules/@hocuspocus/server';
import { createCollabServer } from '../../server/src/collaboration/server';
import { DocumentModel } from '../../server/src/db/models/Document';
import { UserModel } from '../../server/src/db/models/User';
import { connectDB, disconnectDB } from '../../server/src/db/connection';
import { signDocToken } from '../../server/src/utils/tokens';

test.describe('Real-Time Presence, Collaborator List & Live Cursors (E2E Browser Test)', () => {
  let mongod: MongoMemoryServer;
  let collabServer: Server;
  const collabPort = 1234;

  let ownerUser: any;
  let editorUser: any;
  let aliceToken: string;
  let bobToken: string;
  const docId = 'doc_e2e_presence';

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

    ownerUser = await UserModel.create({
      email: 'alice.e2e@example.com',
      passwordHash: 'hash',
      name: 'Alice Owner',
      color: '#3B82F6',
    });

    editorUser = await UserModel.create({
      email: 'bob.e2e@example.com',
      passwordHash: 'hash',
      name: 'Bob Editor',
      color: '#10B981',
    });

    await DocumentModel.create({
      _id: docId,
      title: 'E2E Presence Collaborative Document',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    aliceToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: 'Alice',
      color: '#3B82F6',
      documentId: docId,
      role: 'owner',
    });

    bobToken = signDocToken({
      userId: editorUser._id.toString(),
      name: 'Bob',
      color: '#10B981',
      documentId: docId,
      role: 'editor',
    });
  });

  test.afterAll(async () => {
    if (collabServer) {
      collabServer.hocuspocus.flushPendingStores();
      await collabServer.destroy();
    }
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  });

  test('renders live collaborator avatars, remote cursor caret and user label in the browser editor', async ({ browser }) => {
    // Open Context & Page 1 for Alice
    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    const aliceUrl = `/?doc=${docId}&token=${aliceToken}&user=Alice&color=%233B82F6`;
    await pageAlice.goto(aliceUrl);

    // Verify Alice is connected
    await expect(pageAlice.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(pageAlice.getByTestId('avatar-alice')).toBeVisible();

    // Open Context & Page 2 for Bob
    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    const bobUrl = `/?doc=${docId}&token=${bobToken}&user=Bob&color=%2310B981`;
    await pageBob.goto(bobUrl);

    // Verify Bob is connected
    await expect(pageBob.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.getByTestId('avatar-bob')).toBeVisible();

    // Feature 2 Check: Bob's avatar appears in Alice's header CollaboratorList
    await expect(pageAlice.getByTestId('avatar-bob')).toBeVisible({ timeout: 6000 });
    // Alice's avatar appears in Bob's header CollaboratorList
    await expect(pageBob.getByTestId('avatar-alice')).toBeVisible({ timeout: 6000 });

    // Focus Bob's editor and type content
    const bobEditor = pageBob.locator('.tiptap-editor-content .ProseMirror');
    await bobEditor.click();
    await pageBob.keyboard.type('Hello from Bob in browser!');

    // Wait for text synchronization into Alice's page
    const aliceEditor = pageAlice.locator('.tiptap-editor-content .ProseMirror');
    await expect(aliceEditor).toContainText('Hello from Bob in browser!', { timeout: 6000 });

    // Feature 3 Check: Remote live cursor caret and label appear in Alice's DOM
    const remoteCursorCaret = pageAlice.locator('.collaboration-cursor__caret');
    await expect(remoteCursorCaret).toBeVisible({ timeout: 6000 });

    const remoteCursorLabel = pageAlice.locator('.collaboration-cursor__label');
    await expect(remoteCursorLabel).toBeVisible({ timeout: 6000 });
    await expect(remoteCursorLabel).toHaveText('Bob');

    // Clean up
    await contextAlice.close();
    await contextBob.close();
  });
});
