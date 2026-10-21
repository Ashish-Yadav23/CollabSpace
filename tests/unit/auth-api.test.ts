import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createExpressApp } from '../../server/src/api';
import { UserModel } from '../../server/src/db/models/User';
import { connectDB, disconnectDB } from '../../server/src/db/connection';

describe('User Authentication API (Step 2 Tests)', () => {
  let mongod: MongoMemoryServer;
  const app = createExpressApp();

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
    }
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user successfully and returns token with user profile', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'securePassword123',
          name: 'Alice Cooper',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.name).toBe('Alice Cooper');
      expect(res.body.user.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.id).toBeDefined();

      const userInDb = await UserModel.findOne({ email: 'alice@example.com' });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.passwordHash).not.toBe('securePassword123');
    });

    it('normalizes email addresses to lowercase and trims whitespace', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: '   BOB@Example.COM  ',
          password: 'password123',
          name: 'Bob Ross',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('bob@example.com');

      const userInDb = await UserModel.findOne({ email: 'bob@example.com' });
      expect(userInDb).not.toBeNull();
    });

    it('rejects registration with duplicate email (409 Conflict)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'password123',
          name: 'First User',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'DUPLICATE@example.com',
          password: 'anotherPassword',
          name: 'Second User',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });

    it('validates required fields and email/password formats', async () => {
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '123',
          name: '',
        });

      expect(res1.status).toBe(400);
      expect(res1.body.error).toBe('Validation error');
      expect(res1.body.details).toBeInstanceOf(Array);
      expect(res1.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'loginuser@example.com',
          password: 'correctPassword123',
          name: 'Login User',
        });
    });

    it('logs in successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'LOGINUSER@example.com',
          password: 'correctPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('loginuser@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('rejects login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loginuser@example.com',
          password: 'wrongPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid email or password/i);
      expect(res.body.token).toBeUndefined();
    });

    it('rejects login with non-existent email (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'anyPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid email or password/i);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user profile when authenticated with valid Bearer token', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'me@example.com',
          password: 'password123',
          name: 'Current User',
        });

      const token = regRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('me@example.com');
      expect(res.body.user.name).toBe('Current User');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('rejects requests without Authorization header (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('rejects requests with an invalid or tampered token (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired token/i);
    });
  });
});
