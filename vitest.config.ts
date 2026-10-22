import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

function resolveModule(name: string): string {
  const serverPath = path.resolve(__dirname, 'server/node_modules', name);
  if (fs.existsSync(serverPath)) return serverPath;
  const rootPath = path.resolve(__dirname, 'node_modules', name);
  if (fs.existsSync(rootPath)) return rootPath;
  return name;
}

export default defineConfig({
  resolve: {
    alias: {
      yjs: resolveModule('yjs'),
      supertest: resolveModule('supertest'),
      'mongodb-memory-server': resolveModule('mongodb-memory-server'),
      mongoose: resolveModule('mongoose'),
      bcryptjs: resolveModule('bcryptjs'),
      jsonwebtoken: resolveModule('jsonwebtoken'),
      zod: resolveModule('zod'),
      express: resolveModule('express'),
      cors: resolveModule('cors'),
      helmet: resolveModule('helmet'),
      nanoid: resolveModule('nanoid'),
      ws: resolveModule('ws'),
      '@hocuspocus/provider': resolveModule('@hocuspocus/provider'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
