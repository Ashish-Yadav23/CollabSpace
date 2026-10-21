import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface UserTokenPayload {
  userId: string;
  email: string;
  name: string;
}

export interface DocTokenPayload {
  userId: string;
  name: string;
  color: string;
  documentId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export function signUserToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRY_HOURS}h`,
  });
}

export function signDocToken(payload: DocTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.DOC_TOKEN_EXPIRY_SECONDS,
  });
}

export function verifyToken<T>(token: string): T {
  return jwt.verify(token, env.JWT_SECRET) as T;
}
