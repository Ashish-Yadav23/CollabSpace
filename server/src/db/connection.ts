import mongoose from 'mongoose';
import { env } from '../config/env';

let isConnected = false;

export async function connectDB(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || env.MONGODB_URI;

  if (mongoose.connection.readyState >= 1) {
    isConnected = true;
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(uri);
    isConnected = true;
    return conn;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
