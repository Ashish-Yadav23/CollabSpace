import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      yjs: path.resolve(__dirname, 'server/node_modules/yjs'),
      supertest: path.resolve(__dirname, 'server/node_modules/supertest'),
      'mongodb-memory-server': path.resolve(__dirname, 'server/node_modules/mongodb-memory-server'),
      mongoose: path.resolve(__dirname, 'server/node_modules/mongoose'),
      bcryptjs: path.resolve(__dirname, 'server/node_modules/bcryptjs'),
      jsonwebtoken: path.resolve(__dirname, 'server/node_modules/jsonwebtoken'),
      zod: path.resolve(__dirname, 'server/node_modules/zod'),
      express: path.resolve(__dirname, 'server/node_modules/express'),
      cors: path.resolve(__dirname, 'server/node_modules/cors'),
      helmet: path.resolve(__dirname, 'server/node_modules/helmet'),
      nanoid: path.resolve(__dirname, 'server/node_modules/nanoid'),
      ws: path.resolve(__dirname, 'server/node_modules/ws'),
      '@hocuspocus/provider': path.resolve(__dirname, 'server/node_modules/@hocuspocus/provider'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
