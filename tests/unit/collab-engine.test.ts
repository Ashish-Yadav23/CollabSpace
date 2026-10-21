import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Server } from '@hocuspocus/server';
import { createCollabServer } from '../../server/src/collaboration/server';
import { DocumentModel } from '../../server/src/db/models/Document';
import { UserModel } from '../../server/src/db/models/User';
import { connectDB, disconnectDB } from '../../server/src/db/connection';
import { signDocToken } from '../../server/src/utils/tokens';

describe('Real-Time Collaboration Engine & Persistence (Phase 3 Tests)', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  const testPort = 12345;
  const serverUrl = `ws://127.0.0.1:${testPort}`;

  let ownerUser: any;
  let editorUser: any;
  let viewerUser: any;
  let outsiderUser: any;

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
      email: 'owner@example.com',
      passwordHash: 'hash',
      name: 'Owner User',
      color: '#3B82F6',
    });

    editorUser = await UserModel.create({
      email: 'editor@example.com',
      passwordHash: 'hash',
      name: 'Editor User',
      color: '#10B981',
    });

    viewerUser = await UserModel.create({
      email: 'viewer@example.com',
      passwordHash: 'hash',
      name: 'Viewer User',
      color: '#F59E0B',
    });

    outsiderUser = await UserModel.create({
      email: 'outsider@example.com',
      passwordHash: 'hash',
      name: 'Outsider User',
      color: '#EF4444',
    });
  });

  function waitForEvent(provider: HocuspocusProvider, eventName: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event '${eventName}'`));
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

  it('connects a valid editor and synchronizes Yjs document updates', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_editor_sync',
      title: 'Initial Title',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const token = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: ydoc,
      token,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(provider, 'authenticated');
    await waitForEvent(provider, 'synced');

    const metaMap = ydoc.getMap('meta');
    expect(metaMap.get('title')).toBe('Initial Title');

    const text = ydoc.getText('content');
    text.insert(0, 'Hello from Editor!');

    await new Promise((r) => setTimeout(r, 500));
    provider.destroy();
  });

  it('connects a viewer in read-only mode and drops unauthorized client edits on the server', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_viewer_ro',
      title: 'Protected Spec',
      ownerId: ownerUser._id,
      collaborators: [{ userId: viewerUser._id, role: 'viewer' }],
      isPublic: false,
    });

    const viewerToken = signDocToken({
      userId: viewerUser._id.toString(),
      name: viewerUser.name,
      color: viewerUser.color,
      documentId: doc._id,
      role: 'viewer',
    });

    const viewerDoc = new Y.Doc();
    const viewerProvider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: viewerDoc,
      token: viewerToken,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(viewerProvider, 'authenticated');
    await waitForEvent(viewerProvider, 'synced');

    // Attempt to mutate document from viewer
    viewerDoc.getText('content').insert(0, 'Illegal edit from viewer');

    await new Promise((r) => setTimeout(r, 500));
    server.hocuspocus.flushPendingStores();

    // Check in database to verify viewer's edit was dropped
    const docInDb = await DocumentModel.findById(doc._id);
    const serverCheckDoc = new Y.Doc();
    if (docInDb?.yjsState) {
      Y.applyUpdate(serverCheckDoc, new Uint8Array(docInDb.yjsState));
    }

    expect(serverCheckDoc.getText('content').toString()).not.toContain('Illegal edit');
    viewerProvider.destroy();
  });

  it('rejects connection with invalid, expired, or room-mismatched token', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_token_mismatch',
      title: 'Mismatch Test',
      ownerId: ownerUser._id,
      isPublic: false,
    });

    // Token generated for a different document ID
    const mismatchedToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: 'doc_different_room',
      role: 'owner',
    });

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: ydoc,
      token: mismatchedToken,
      WebSocketPolyfill: WebSocket,
      maxAttempts: 1,
    });

    let closeOrAuthFailed = false;
    provider.on('authenticationFailed', () => {
      closeOrAuthFailed = true;
    });
    provider.on('close', () => {
      closeOrAuthFailed = true;
    });

    await waitForCondition(() => closeOrAuthFailed, 4000);
    expect(closeOrAuthFailed).toBe(true);
    provider.destroy();
  });

  it('disconnects active session when permissions are revoked via onTokenSync', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_revoke_session',
      title: 'Revoke Test',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const token = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: ydoc,
      token,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(provider, 'authenticated');
    await waitForEvent(provider, 'synced');

    // Revoke collaborator permission from MongoDB
    await DocumentModel.findByIdAndUpdate(doc._id, {
      $set: { collaborators: [] },
    });

    let disconnectedOrClosed = false;
    provider.on('close', () => {
      disconnectedOrClosed = true;
    });
    provider.on('disconnect', () => {
      disconnectedOrClosed = true;
    });

    // Send token sync request
    provider.configuration.token = token;
    provider.sendToken();

    await waitForCondition(() => disconnectedOrClosed, 4000);
    expect(disconnectedOrClosed).toBe(true);
    provider.destroy();
  });

  it('demotes editor to viewer on active session and drops subsequent writes', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_demote_session',
      title: 'Demote Test',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const token = signDocToken({
      userId: editorUser._id.toString(),
      name: editorUser.name,
      color: editorUser.color,
      documentId: doc._id,
      role: 'editor',
    });

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: ydoc,
      token,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(provider, 'authenticated');
    await waitForEvent(provider, 'synced');

    // First write as editor: should succeed
    ydoc.getText('content').insert(0, 'Allowed edit as editor.');
    await new Promise((r) => setTimeout(r, 400));
    server.hocuspocus.flushPendingStores();

    let docInDb = await DocumentModel.findById(doc._id);
    let checkDoc = new Y.Doc();
    if (docInDb?.yjsState) {
      Y.applyUpdate(checkDoc, new Uint8Array(docInDb.yjsState));
    }
    expect(checkDoc.getText('content').toString()).toBe('Allowed edit as editor.');

    // Demote editor to viewer in MongoDB
    await DocumentModel.findByIdAndUpdate(doc._id, {
      $set: { 'collaborators.0.role': 'viewer' },
    });

    // Send token sync request to update server connection state
    provider.configuration.token = token;
    provider.sendToken();
    await new Promise((r) => setTimeout(r, 400));

    // Attempt second write after demotion to viewer: should be dropped by server
    ydoc.getText('content').insert(ydoc.getText('content').length, ' Disallowed after demotion.');
    await new Promise((r) => setTimeout(r, 500));
    server.hocuspocus.flushPendingStores();

    docInDb = await DocumentModel.findById(doc._id);
    const serverVerifyDoc = new Y.Doc();
    if (docInDb?.yjsState) {
      Y.applyUpdate(serverVerifyDoc, new Uint8Array(docInDb.yjsState));
    }

    expect(serverVerifyDoc.getText('content').toString()).toBe('Allowed edit as editor.');
    expect(serverVerifyDoc.getText('content').toString()).not.toContain('Disallowed after demotion');

    provider.destroy();
  });

  it('synchronizes concurrent edits between two independent clients and converges', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_convergence',
      title: 'Convergence Test',
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
    const clientA = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docA,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const clientB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: editorToken,
      WebSocketPolyfill: WebSocket,
    });

    await Promise.all([
      waitForEvent(clientA, 'synced'),
      waitForEvent(clientB, 'synced'),
    ]);

    // Client A inserts at index 0
    docA.getText('text').insert(0, 'Hello ');
    // Client B inserts concurrently
    docB.getText('text').insert(0, 'World! ');

    await waitForCondition(() => {
      return (
        docA.getText('text').toString() === docB.getText('text').toString() &&
        docA.getText('text').toString().length >= 13
      );
    }, 4000);

    expect(docA.getText('text').toString()).toBe(docB.getText('text').toString());

    clientA.destroy();
    clientB.destroy();
  });

  it('persists binary Yjs state and live title to MongoDB and restores state upon reconnect', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_persist_restore',
      title: 'Original Title',
      ownerId: ownerUser._id,
      isPublic: true,
      publicRole: 'editor',
    });

    const token = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const docClient1 = new Y.Doc();
    const client1 = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docClient1,
      token,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(client1, 'synced');

    // Update live title via Yjs CRDT meta map
    docClient1.getMap('meta').set('title', 'Renamed Collaborative Document');
    // Add text content
    docClient1.getText('body').insert(0, 'Critical persisted text content.');

    // Wait for debounced write and flush pending stores
    await new Promise((r) => setTimeout(r, 500));
    server.hocuspocus.flushPendingStores();
    client1.destroy();

    // Verify MongoDB document record was updated atomically with mirrored title and binary state
    const savedDoc = await DocumentModel.findById(doc._id);
    expect(savedDoc?.title).toBe('Renamed Collaborative Document');
    expect(savedDoc?.yjsState).not.toBeNull();
    expect(savedDoc?.yjsState!.length).toBeGreaterThan(0);

    // Connect a fresh client with an empty Y.Doc to verify restoration from MongoDB
    const docClient2 = new Y.Doc();
    const client2 = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docClient2,
      token,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(client2, 'synced');

    expect(docClient2.getMap('meta').get('title')).toBe('Renamed Collaborative Document');
    expect(docClient2.getText('body').toString()).toBe('Critical persisted text content.');

    client2.destroy();
  });

  it('responds with HTTP 200 on health check endpoints for cloud deployment platforms', async () => {
    const resRoot = await fetch(`http://127.0.0.1:${testPort}/`);
    expect(resRoot.status).toBe(200);

    const resHealth = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(resHealth.status).toBe(200);
  });

  it('rejects WebSocket connections from unauthorized origins in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const doc = await DocumentModel.create({
        _id: 'doc_origin_test',
        title: 'Origin Test Document',
        ownerId: ownerUser._id,
        isPublic: true,
        publicRole: 'editor',
      });

      const token = signDocToken({
        userId: ownerUser._id.toString(),
        name: ownerUser.name,
        color: ownerUser.color,
        documentId: doc._id,
        role: 'owner',
      });

      // Attempt connection simulating an unauthorized browser origin
      const client = new HocuspocusProvider({
        url: serverUrl,
        name: `document.${doc._id}`,
        document: new Y.Doc(),
        token,
        parameters: {},
        WebSocketPolyfill: class MockWebSocket extends (WebSocket as any) {
          constructor(url: string, protocols?: string | string[]) {
            super(url, protocols, {
              headers: {
                origin: 'https://malicious-site.example.com',
              },
            });
          }
        },
      });

      const authFailed = await new Promise<boolean>((resolve) => {
        client.on('authenticationFailed', () => resolve(true));
        client.on('synced', () => resolve(false));
        setTimeout(() => resolve(false), 2000);
      });

      expect(authFailed).toBe(true);
      client.destroy();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
