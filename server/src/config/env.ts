import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  COLLAB_PORT: z.coerce.number().default(1234),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/collabspace'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long').default('dev_collabspace_super_secret_jwt_key_2026'),
  JWT_EXPIRY_HOURS: z.coerce.number().default(24),
  DOC_TOKEN_EXPIRY_SECONDS: z.coerce.number().default(3600),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsedEnv.data;
