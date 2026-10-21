import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Server } from '@hocuspocus/server';
import { createCollabServer } from '../../server/src/collaboration/server';
import { DocumentModel } from '../../server/src/db/models/Document';
import { UserModel } from '../../server/src/db/models/User';
import { connectDB, disconnectDB } from '../../server/src/db/connection';
import { signDocToken } from '../../server/src/utils/tokens';

describe('Presence, Collaborator Awareness & Live Cursors (Phase 5 Tests)', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  const testPort = 12347;
  const serverUrl = `ws://127.0.0.1:${testPort}`;

  let ownerUser: any;
  let editorUser: any;
  let viewerUser: any;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());

    server = createCollabServer({
      port: testPort,
      debounce: 100,
      maxDebounce: 300,
      quiet: true,
    });
    await server.listen();
  }, 30000);

  afterAll(async () => {
    if (server) {
      server.hocuspocus.flushPendingStores();
      await server.destroy();
    }
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await DocumentModel.deleteMany({});

    ownerUser = await UserModel.create({
      email: 'owner@collab.com',
      passwordHash: 'hash',
      name: 'Alice Owner',
      color: '#3B82F6',
    });

    editorUser = await UserModel.create({
      email: 'editor@collab.com',
      passwordHash: 'hash',
      name: 'Bob Editor',
      color: '#10B981',
    });

    viewerUser = await UserModel.create({
      email: 'viewer@collab.com',
      passwordHash: 'hash',
      name: 'Charlie Viewer',
      color: '#F59E0B',
    });
  });

  function waitForEvent(provider: HocuspocusProvider, eventName: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for provider event '${eventName}'`));
      }, timeout);

      provider.on(eventName, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function waitForCondition(predicate: () => boolean, timeout = 5000, step = 50): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (predicate()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for condition'));
        }
      }, step);
    });
  }

  it('exchanges awareness presence (user names, colors, and IDs) between independent peers', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_awareness_exchange',
      title: 'Awareness Test',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const ownerToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const editorToken = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const docA = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docA,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: editorToken,
      WebSocketPolyfill: WebSocket,
    });

    // Set awareness presence state
    providerA.setAwarenessField('user', {
      id: ownerUser._id.toString(),
      name: 'Alice Owner',
      color: '#3B82F6',
    });

    providerB.setAwarenessField('user', {
      id: editorUser._id.toString(),
      name: 'Bob Editor',
      color: '#10B981',
    });

    await Promise.all([
      waitForEvent(providerA, 'synced'),
      waitForEvent(providerB, 'synced'),
    ]);

    // Client B observes Client A's presence
    await waitForCondition(() => {
      const states = providerB.awareness.getStates();
      let foundAlice = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Alice Owner' && s.user?.color === '#3B82F6') {
          foundAlice = true;
        }
      });
      return foundAlice;
    }, 4000);

    // Client A observes Client B's presence
    await waitForCondition(() => {
      const states = providerA.awareness.getStates();
      let foundBob = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Bob Editor' && s.user?.color === '#10B981') {
          foundBob = true;
        }
      });
      return foundBob;
    }, 4000);

    const statesInB = Array.from(providerB.awareness.getStates().values());
    const userNamesInB = statesInB.map((s: any) => s.user?.name).filter(Boolean);
    expect(userNamesInB).toContain('Alice Owner');
    expect(userNamesInB).toContain('Bob Editor');

    providerA.destroy();
    providerB.destroy();
  });

  it('updates collaborator awareness dynamically when a user changes their status or cursor', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_cursor_move',
      title: 'Cursor Motion Test',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const ownerToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const editorToken = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const docA = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docA,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: editorToken,
      WebSocketPolyfill: WebSocket,
    });

    providerA.setAwarenessField('user', {
      name: 'Alice Owner',
      color: '#3B82F6',
    });

    providerB.setAwarenessField('user', {
      name: 'Bob Editor',
      color: '#10B981',
    });

    await Promise.all([
      waitForEvent(providerA, 'synced'),
      waitForEvent(providerB, 'synced'),
    ]);

    // Simulate cursor position and selection change from Client A
    providerA.setAwarenessField('cursor', {
      anchor: 12,
      head: 15,
    });

    await waitForCondition(() => {
      const states = providerB.awareness.getStates();
      let cursorMatches = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Alice Owner' && s.cursor?.anchor === 12 && s.cursor?.head === 15) {
          cursorMatches = true;
        }
      });
      return cursorMatches;
    }, 3000);

    // Now Alice updates her display name and avatar color
    providerA.setAwarenessField('user', {
      name: 'Alice (Lead Architect)',
      color: '#6366F1',
    });

    await waitForCondition(() => {
      const states = providerB.awareness.getStates();
      let updatedUserFound = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Alice (Lead Architect)' && s.user?.color === '#6366F1') {
          updatedUserFound = true;
        }
      });
      return updatedUserFound;
    }, 3000);

    providerA.destroy();
    providerB.destroy();
  });

  it('removes collaborator presence and cleans up awareness state when client disconnects or destroys', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_cleanup_awareness',
      title: 'Cleanup Test',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const ownerToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const editorToken = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const docA = new Y.Doc();
    const providerA = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docA,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: editorToken,
      WebSocketPolyfill: WebSocket,
    });

    providerA.setAwarenessField('user', { name: 'Alice Owner', color: '#3B82F6' });
    providerB.setAwarenessField('user', { name: 'Bob Editor', color: '#10B981' });

    await Promise.all([
      waitForEvent(providerA, 'synced'),
      waitForEvent(providerB, 'synced'),
    ]);

    // Verify Bob is initially visible in Alice's awareness
    await waitForCondition(() => {
      const states = providerA.awareness.getStates();
      let foundBob = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Bob Editor') foundBob = true;
      });
      return foundBob;
    }, 3000);

    // Client B disconnects / destroys
    providerB.destroy();

    // Alice should observe Bob's departure from awareness
    await waitForCondition(() => {
      const states = providerA.awareness.getStates();
      let foundBob = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Bob Editor') foundBob = true;
      });
      return !foundBob;
    }, 4000);

    const remainingStates = Array.from(providerA.awareness.getStates().values());
    const remainingNames = remainingStates.map((s: any) => s.user?.name).filter(Boolean);
    expect(remainingNames).not.toContain('Bob Editor');
    expect(remainingNames).toContain('Alice Owner');

    providerA.destroy();
  });

  it('allows viewer to observe active editors and cursors while server rejects viewer modifications', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_viewer_awareness',
      title: 'Viewer Awareness Spec',
      ownerId: ownerUser._id,
      collaborators: [{ userId: viewerUser._id, role: 'viewer' }],
      isPublic: false,
    });

    const ownerToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const viewerToken = signDocToken({
      userId: viewerUser._id.toString(),
      name: viewerUser.name,
      color: viewerUser.color,
      documentId: doc._id,
      role: 'viewer',
    });

    const docOwner = new Y.Doc();
    const providerOwner = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docOwner,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    const docViewer = new Y.Doc();
    const providerViewer = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docViewer,
      token: viewerToken,
      WebSocketPolyfill: WebSocket,
    });

    providerOwner.setAwarenessField('user', { name: 'Alice Owner', color: '#3B82F6' });
    providerOwner.setAwarenessField('cursor', { anchor: 42, head: 42 });

    providerViewer.setAwarenessField('user', { name: 'Charlie Viewer', color: '#F59E0B' });

    await Promise.all([
      waitForEvent(providerOwner, 'synced'),
      waitForEvent(providerViewer, 'synced'),
    ]);

    // Viewer successfully observes owner's cursor and presence
    await waitForCondition(() => {
      const states = providerViewer.awareness.getStates();
      let foundOwnerCursor = false;
      states.forEach((s: any) => {
        if (s.user?.name === 'Alice Owner' && s.cursor?.anchor === 42) {
          foundOwnerCursor = true;
        }
      });
      return foundOwnerCursor;
    }, 4000);

    // Owner writes content
    docOwner.getText('content').insert(0, 'Authorized text from Owner.');
    await waitForCondition(
      () => docViewer.getText('content').toString() === 'Authorized text from Owner.',
      3000
    );

    // Viewer attempts unauthorized document write
    docViewer.getText('content').insert(0, 'Unauthorized text from Viewer. ');
    await new Promise((r) => setTimeout(r, 400));
    server.hocuspocus.flushPendingStores();

    // Verify in database that viewer write was rejected and dropped
    const docInDb = await DocumentModel.findById(doc._id);
    const verifyDoc = new Y.Doc();
    if (docInDb?.yjsState) {
      Y.applyUpdate(verifyDoc, new Uint8Array(docInDb.yjsState));
    }
    expect(verifyDoc.getText('content').toString()).toBe('Authorized text from Owner.');
    expect(verifyDoc.getText('content').toString()).not.toContain('Unauthorized text');

    providerOwner.destroy();
    providerViewer.destroy();
  });
});
