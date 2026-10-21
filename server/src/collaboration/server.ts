import { Server, ServerConfiguration } from '@hocuspocus/server';
import { env } from '../config/env';
import { authenticateConnection, handleTokenSync, CollaborationContext } from './auth';
import { mongoDatabaseExtension } from './persistence';

export interface CreateCollabServerOptions {
  port?: number;
  address?: string;
  debounce?: number;
  maxDebounce?: number;
  quiet?: boolean;
}

export function createCollabServer(options?: CreateCollabServerOptions): Server<CollaborationContext> {
  const port = options?.port !== undefined ? options.port : env.COLLAB_PORT;
  const address = options?.address;

  const config: Partial<ServerConfiguration<CollaborationContext>> = {
    port,
    ...(address ? { address } : {}),
    timeout: 30000,
    debounce: options?.debounce !== undefined ? options.debounce : 2000,
    maxDebounce: options?.maxDebounce !== undefined ? options.maxDebounce : 10000,
    quiet: options?.quiet !== undefined ? options.quiet : true,
    unloadImmediately: false,
    onAuthenticate: authenticateConnection,
    onTokenSync: handleTokenSync,
    extensions: [mongoDatabaseExtension],
  };

  return new Server(config);
}
