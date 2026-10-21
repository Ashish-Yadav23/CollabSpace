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
import { normalizeWsUrl } from '../../client/src/hooks/useCollaboration';

describe('Client Editor & Yjs CRDT Synchronization (Phase 4 Tests)', () => {
  let mongod: MongoMemoryServer;
  let server: Server;
  const testPort = 12346;
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
      email: 'alice@example.com',
      passwordHash: 'hash',
      name: 'Alice Owner',
      color: '#3B82F6',
    });

    editorUser = await UserModel.create({
      email: 'bob@example.com',
      passwordHash: 'hash',
      name: 'Bob Editor',
      color: '#10B981',
    });

    viewerUser = await UserModel.create({
      email: 'charlie@example.com',
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

  it('synchronizes real-time title changes between two peers using ydoc.getMap("meta")', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_title_sync',
      title: 'Initial Title',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const aliceToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const bobToken = signDocToken({
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
      token: aliceToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: bobToken,
      WebSocketPolyfill: WebSocket,
    });

    await Promise.all([
      waitForEvent(providerA, 'synced'),
      waitForEvent(providerB, 'synced'),
    ]);

    // Initial title loaded from server
    expect(docA.getMap('meta').get('title')).toBe('Initial Title');
    expect(docB.getMap('meta').get('title')).toBe('Initial Title');

    // Peer A updates title
    let bobObservedTitle: string | null = null;
    docB.getMap('meta').observe(() => {
      bobObservedTitle = docB.getMap('meta').get('title') as string;
    });

    docA.getMap('meta').set('title', 'CollabSpace Architecture Specification');

    await waitForCondition(() => bobObservedTitle === 'CollabSpace Architecture Specification', 3000);
    expect(docB.getMap('meta').get('title')).toBe('CollabSpace Architecture Specification');

    // Peer B updates title
    let aliceObservedTitle: string | null = null;
    docA.getMap('meta').observe(() => {
      aliceObservedTitle = docA.getMap('meta').get('title') as string;
    });

    docB.getMap('meta').set('title', 'Updated by Bob');
    await waitForCondition(() => aliceObservedTitle === 'Updated by Bob', 3000);
    expect(docA.getMap('meta').get('title')).toBe('Updated by Bob');

    providerA.destroy();
    providerB.destroy();
  });

  it('synchronizes Tiptap rich-text XML fragments between concurrent editors', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_rich_text_sync',
      title: 'Tiptap Collab Document',
      ownerId: ownerUser._id,
      collaborators: [{ userId: editorUser._id, role: 'editor' }],
      isPublic: false,
    });

    const aliceToken = signDocToken({
      userId: ownerUser._id.toString(),
      name: ownerUser.name,
      color: ownerUser.color,
      documentId: doc._id,
      role: 'owner',
    });

    const bobToken = signDocToken({
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
      token: aliceToken,
      WebSocketPolyfill: WebSocket,
    });

    const docB = new Y.Doc();
    const providerB = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: docB,
      token: bobToken,
      WebSocketPolyfill: WebSocket,
    });

    await Promise.all([
      waitForEvent(providerA, 'synced'),
      waitForEvent(providerB, 'synced'),
    ]);

    // Tiptap Collaboration extension uses ydoc.getXmlFragment('default')
    const fragmentA = docA.getXmlFragment('default');
    const fragmentB = docB.getXmlFragment('default');

    // Peer A inserts paragraph element
    const paragraphA = new Y.XmlElement('paragraph');
    const textNodeA = new Y.XmlText();
    textNodeA.insert(0, 'Collaborative paragraph written by Alice.');
    paragraphA.insert(0, [textNodeA]);
    fragmentA.insert(0, [paragraphA]);

    await waitForCondition(() => fragmentB.length > 0, 3000);
    expect(fragmentB.length).toBe(1);

    const receivedParagraph = fragmentB.get(0) as Y.XmlElement;
    expect(receivedParagraph.nodeName).toBe('paragraph');
    expect((receivedParagraph.get(0) as Y.XmlText).toString()).toBe('Collaborative paragraph written by Alice.');

    // Peer B inserts a second paragraph with formatted text
    const paragraphB = new Y.XmlElement('paragraph');
    const textNodeB = new Y.XmlText();
    textNodeB.insert(0, 'Bold text contributed by Bob', { bold: true });
    paragraphB.insert(0, [textNodeB]);
    fragmentB.insert(1, [paragraphB]);

    await waitForCondition(() => fragmentA.length === 2, 3000);
    expect(fragmentA.length).toBe(2);

    const secondParagraphInA = fragmentA.get(1) as Y.XmlElement;
    const secondTextInA = secondParagraphInA.get(0) as Y.XmlText;
    expect(secondTextInA.toString()).toBe('<bold>Bold text contributed by Bob</bold>');
    expect(secondTextInA.toDelta()).toEqual([
      { insert: 'Bold text contributed by Bob', attributes: { bold: true } },
    ]);

    providerA.destroy();
    providerB.destroy();
  });

  it('prevents viewer from modifying Tiptap XML fragments and CRDT title', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_viewer_tiptap_ro',
      title: 'Protected Project Plan',
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

    // 1. Owner writes initial content
    const ownerDoc = new Y.Doc();
    const ownerProvider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: ownerDoc,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(ownerProvider, 'synced');
    const ownerFragment = ownerDoc.getXmlFragment('default');
    const p = new Y.XmlElement('paragraph');
    const t = new Y.XmlText();
    t.insert(0, 'Authoritative text');
    p.insert(0, [t]);
    ownerFragment.insert(0, [p]);

    await new Promise((r) => setTimeout(r, 400));
    server.hocuspocus.flushPendingStores();
    ownerProvider.destroy();

    // 2. Viewer connects
    const viewerDoc = new Y.Doc();
    const viewerProvider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: viewerDoc,
      token: viewerToken,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(viewerProvider, 'synced');
    const viewerFragment = viewerDoc.getXmlFragment('default');
    expect(viewerFragment.length).toBe(1);

    // Viewer attempts unauthorized title change and XML fragment mutation
    viewerDoc.getMap('meta').set('title', 'Tampered by Viewer');
    const tamperP = new Y.XmlElement('paragraph');
    const tamperT = new Y.XmlText();
    tamperT.insert(0, 'Tampered by Viewer');
    tamperP.insert(0, [tamperT]);
    viewerFragment.insert(1, [tamperP]);

    await new Promise((r) => setTimeout(r, 500));
    server.hocuspocus.flushPendingStores();
    viewerProvider.destroy();

    // 3. Verify in MongoDB and with clean client that viewer modifications were discarded
    const savedDoc = await DocumentModel.findById(doc._id);
    expect(savedDoc?.title).toBe('Protected Project Plan');

    const freshDoc = new Y.Doc();
    const freshProvider = new HocuspocusProvider({
      url: serverUrl,
      name: `document.${doc._id}`,
      document: freshDoc,
      token: ownerToken,
      WebSocketPolyfill: WebSocket,
    });

    await waitForEvent(freshProvider, 'synced');
    expect(freshDoc.getMap('meta').get('title')).toBe('Protected Project Plan');
    const freshFragment = freshDoc.getXmlFragment('default');
    expect(freshFragment.length).toBe(1);
    expect((freshFragment.get(0) as Y.XmlElement).get(0)?.toString()).toBe('Authoritative text');

    freshProvider.destroy();
  });

  it('recovers seamlessly from disconnection and synchronizes offline updates upon reconnect', async () => {
    const doc = await DocumentModel.create({
      _id: 'doc_recovery_sync',
      title: 'Disconnection Recovery Test',
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

    // Initial synchronized baseline
    docA.getText('content').insert(0, 'Initial text. ');
    await waitForCondition(() => docB.getText('content').toString() === 'Initial text. ', 3000);

    // Simulate Client B temporary network disconnect
    clientB.configuration.websocketProvider.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // While Client B is disconnected, Client A inserts content
    docA.getText('content').insert(docA.getText('content').length, 'Appended while B was offline. ');

    // Client B reconnects
    clientB.configuration.websocketProvider.connect();

    // Both clients converge to identical state
    await waitForCondition(
      () =>
        docB.getText('content').toString() === docA.getText('content').toString() &&
        docB.getText('content').toString().includes('Appended while B was offline'),
      5000
    );

    expect(docB.getText('content').toString()).toBe('Initial text. Appended while B was offline. ');

    clientA.destroy();
    clientB.destroy();
  });

  it('normalizes WebSocket URLs for production cloud environments', () => {
    expect(normalizeWsUrl('https://collab.example.com')).toBe('wss://collab.example.com');
    expect(normalizeWsUrl('http://localhost:1234')).toBe('ws://localhost:1234');
    expect(normalizeWsUrl('wss://collab.example.com')).toBe('wss://collab.example.com');
    expect(normalizeWsUrl('ws://localhost:1234')).toBe('ws://localhost:1234');
    expect(normalizeWsUrl('collab.example.com')).toBe('ws://collab.example.com');
    expect(normalizeWsUrl('')).toBe('ws://localhost:1234');
    expect(normalizeWsUrl(undefined)).toBe('ws://localhost:1234');
  });
});
