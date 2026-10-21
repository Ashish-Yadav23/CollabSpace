import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createExpressApp } from '../../server/src/api';
import { UserModel } from '../../server/src/db/models/User';
import { DocumentModel } from '../../server/src/db/models/Document';
import { connectDB, disconnectDB } from '../../server/src/db/connection';
import { verifyToken, DocTokenPayload } from '../../server/src/utils/tokens';

describe('Document Management and Authorization API (Step 4 Tests)', () => {
  let mongod: MongoMemoryServer;
  const app = createExpressApp();

  let ownerToken: string;
  let ownerId: string;
  let editorToken: string;
  let editorId: string;
  let viewerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await connectDB(uri);
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await UserModel.deleteMany({});
      await DocumentModel.deleteMany({});
    }

    // Register test users
    const ownerRes = await request(app).post('/api/auth/register').send({
      email: 'owner@example.com',
      password: 'password123',
      name: 'Document Owner',
    });
    ownerToken = ownerRes.body.token;
    ownerId = ownerRes.body.user.id;

    const editorRes = await request(app).post('/api/auth/register').send({
      email: 'editor@example.com',
      password: 'password123',
      name: 'Document Editor',
    });
    editorToken = editorRes.body.token;
    editorId = editorRes.body.user.id;

    const viewerRes = await request(app).post('/api/auth/register').send({
      email: 'viewer@example.com',
      password: 'password123',
      name: 'Document Viewer',
    });
    viewerToken = viewerRes.body.token;

    const outsiderRes = await request(app).post('/api/auth/register').send({
      email: 'outsider@example.com',
      password: 'password123',
      name: 'Outsider User',
    });
    outsiderToken = outsiderRes.body.token;
  });

  describe('POST /api/documents', () => {
    it('creates a new document with nanoid ID and associates with owner', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Q4 Product Roadmap',
          isPublic: true,
          publicRole: 'editor',
        });

      expect(res.status).toBe(201);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.id).toMatch(/^doc_/);
      expect(res.body.document.title).toBe('Q4 Product Roadmap');
      expect(res.body.document.ownerId).toBe(ownerId);
      expect(res.body.document.collaborators).toHaveLength(0);

      const inDb = await DocumentModel.findById(res.body.document.id);
      expect(inDb).not.toBeNull();
      expect(inDb?.title).toBe('Q4 Product Roadmap');
    });

    it('rejects unauthenticated document creation (401)', async () => {
      const res = await request(app)
        .post('/api/documents')
        .send({ title: 'Unauthorized Doc' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });
  });

  describe('GET /api/documents', () => {
    it('lists only documents where the user is an owner or collaborator', async () => {
      // Create Doc 1 (owned by owner)
      const doc1Res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Owner Doc 1' });

      // Add editor as collaborator on Doc 1
      await request(app)
        .post(`/api/documents/${doc1Res.body.document.id}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'editor' });

      // Create Doc 2 (owned by outsider)
      await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Outsider Doc' });

      // Owner should see Doc 1
      const ownerList = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerList.status).toBe(200);
      expect(ownerList.body.documents).toHaveLength(1);
      expect(ownerList.body.documents[0].title).toBe('Owner Doc 1');

      // Editor should see Doc 1 (as collaborator)
      const editorList = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${editorToken}`);
      expect(editorList.status).toBe(200);
      expect(editorList.body.documents).toHaveLength(1);
      expect(editorList.body.documents[0].title).toBe('Owner Doc 1');

      // Viewer should see 0 documents
      const viewerList = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(viewerList.status).toBe(200);
      expect(viewerList.body.documents).toHaveLength(0);
    });
  });

  describe('GET /api/documents/:id (Permissions & Roles)', () => {
    it('returns document metadata and assigned role for owner, editor, and viewer', async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Shared Architecture' });

      const docId = docRes.body.document.id;

      // Add editor
      await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'editor' });

      // Add viewer
      await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'viewer@example.com', role: 'viewer' });

      // Owner check
      const rOwner = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(rOwner.status).toBe(200);
      expect(rOwner.body.role).toBe('owner');

      // Editor check
      const rEditor = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${editorToken}`);
      expect(rEditor.status).toBe(200);
      expect(rEditor.body.role).toBe('editor');

      // Viewer check
      const rViewer = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(rViewer.status).toBe(200);
      expect(rViewer.body.role).toBe('viewer');
    });

    it('denies access if document is private and user is not a member (403)', async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Top Secret', isPublic: false });

      const docId = docRes.body.document.id;

      const res = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access denied/i);
    });

    it('returns 404 for non-existent document ID', async () => {
      const res = await request(app)
        .get('/api/documents/doc_nonexistent999')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Document not found/i);
    });
  });

  describe('PATCH & DELETE /api/documents/:id (Ownership Enforcement)', () => {
    let docId: string;

    beforeEach(async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Owner Protected Doc', isPublic: true });

      docId = docRes.body.document.id;

      // Add editor
      await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'editor' });
    });

    it('allows owner to update document settings', async () => {
      const res = await request(app)
        .patch(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isPublic: false, publicRole: 'viewer' });

      expect(res.status).toBe(200);
      expect(res.body.document.isPublic).toBe(false);
      expect(res.body.document.publicRole).toBe('viewer');
    });

    it('forbids editor and viewer from updating document settings (403)', async () => {
      const res = await request(app)
        .patch(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ isPublic: false });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Insufficient permissions/i);
    });

    it('allows owner to delete document and removes it from database', async () => {
      const res = await request(app)
        .delete(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted successfully/i);

      const inDb = await DocumentModel.findById(docId);
      expect(inDb).toBeNull();
    });

    it('forbids non-owner from deleting document (403)', async () => {
      const res = await request(app)
        .delete(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Insufficient permissions/i);

      const inDb = await DocumentModel.findById(docId);
      expect(inDb).not.toBeNull();
    });
  });

  describe('POST /api/documents/:id/token (WebSocket Token Generation)', () => {
    it('generates a signed JWT containing documentId and role for valid members', async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Live Collab Doc' });

      const docId = docRes.body.document.id;

      const tokenRes = await request(app)
        .post(`/api/documents/${docId}/token`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.token).toBeDefined();
      expect(tokenRes.body.documentId).toBe(docId);
      expect(tokenRes.body.role).toBe('owner');

      const decoded = verifyToken<DocTokenPayload>(tokenRes.body.token);
      expect(decoded.documentId).toBe(docId);
      expect(decoded.role).toBe('owner');
      expect(decoded.userId).toBe(ownerId);
    });

    it('generates a guest token with publicRole for unauthenticated requests on public documents', async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Public Guest Doc', isPublic: true, publicRole: 'viewer' });

      const docId = docRes.body.document.id;

      const tokenRes = await request(app)
        .post(`/api/documents/${docId}/token`);

      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.token).toBeDefined();
      expect(tokenRes.body.role).toBe('viewer');

      const decoded = verifyToken<DocTokenPayload>(tokenRes.body.token);
      expect(decoded.documentId).toBe(docId);
      expect(decoded.role).toBe('viewer');
      expect(decoded.userId).toMatch(/^anon_/);
    });
  });

  describe('Collaborator Management (/api/documents/:id/collaborators)', () => {
    let docId: string;

    beforeEach(async () => {
      const docRes = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Collab Management Doc', isPublic: false });
      docId = docRes.body.document.id;
    });

    it('allows owner to add a collaborator and update their role', async () => {
      // Add editor
      const addRes = await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'editor' });

      expect(addRes.status).toBe(200);
      expect(addRes.body.document.collaborators).toHaveLength(1);
      expect(addRes.body.document.collaborators[0].role).toBe('editor');

      // Update same collaborator to viewer
      const updateRes = await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'viewer' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.document.collaborators).toHaveLength(1);
      expect(updateRes.body.document.collaborators[0].role).toBe('viewer');
    });

    it('forbids adding the owner as a collaborator (400)', async () => {
      const res = await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'owner@example.com', role: 'editor' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot add document owner/i);
    });

    it('forbids non-owner from adding collaborators (403)', async () => {
      const res = await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ email: 'viewer@example.com', role: 'editor' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access denied|Insufficient permissions/i);
    });

    it('allows owner to remove a collaborator and revokes their access', async () => {
      // Add editor
      await request(app)
        .post(`/api/documents/${docId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'editor@example.com', role: 'editor' });

      // Editor can access doc
      const accessBefore = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${editorToken}`);
      expect(accessBefore.status).toBe(200);

      // Remove editor
      const removeRes = await request(app)
        .delete(`/api/documents/${docId}/collaborators/${editorId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(removeRes.status).toBe(200);

      // Editor is now denied access (403)
      const accessAfter = await request(app)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${editorToken}`);
      expect(accessAfter.status).toBe(403);
    });
  });
});
