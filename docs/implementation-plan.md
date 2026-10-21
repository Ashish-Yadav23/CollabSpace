# CollabSpace – Revised Architecture & Implementation Plan
**Real-Time Collaborative Document Editor · Yjs CRDT · Hocuspocus 4.7.1 · Node ≥22**

> [!IMPORTANT]
> All type signatures in this document were verified by inspecting the actual compiled
> TypeScript definitions of `@hocuspocus/extension-database@4.7.1` and
> `@hocuspocus/server@4.7.1` from the npm registry before writing any code.

---

## 1. Verified Runtime Prerequisites

| Requirement | Required | Installed | Action Required |
| :--- | :---: | :---: | :--- |
| Node.js | **≥22** (`engines` field in `@hocuspocus/server@4.7.1`) | **20.20.2** ❌ | `nvm install 24 && nvm use 24` (Node 24 LTS available) |
| npm | ≥10 | 10.8.2 ✅ | None |
| MongoDB | ≥6 | — | Start locally or use Atlas |

> [!CAUTION]
> Running `@hocuspocus/server@4.7.1` on Node 20 violates the published `engines`
> constraint. While it may work in practice today, it is unsupported and could break
> on any patch. **The project `.nvmrc` file will pin Node 24.**

---

## 2. Verified Hocuspocus 4.7.1 Type Signatures

These are read directly from the compiled definition files — not inferred from documentation.

### 2.1 `@hocuspocus/extension-database` — `fetch` and `store` callbacks

```typescript
// from dist/index.d.ts (extension-database@4.7.1)

interface DatabaseConfiguration {
  fetch: (data: fetchPayload) => Promise<Uint8Array | null>;
  store: (data: storePayload) => Promise<void>;
}

// from @hocuspocus/server dist/index.d.ts

interface fetchPayload<Context = any> {
  context: Context;
  document: Document;        // live Y.Doc — usable for seeding on first load
  documentName: string;
  instance: Hocuspocus;
  requestHeaders: Headers;
  requestParameters: URLSearchParams;
  socketId: string;
  connectionConfig: ConnectionConfiguration;
}

interface onStoreDocumentPayload<Context = any> {
  clientsCount: number;
  document: Document;        // live Y.Doc
  lastContext: Context;
  lastTransactionOrigin: unknown;
  documentName: string;
  instance: Hocuspocus;
}

interface storePayload<Context = any> extends onStoreDocumentPayload<Context> {
  state: Buffer;             // Y.encodeStateAsUpdate(document) already encoded
}
```

**Key finding:** `storePayload.document` is the **live in-memory `Y.Doc`**.
There is no need to decode the binary `state` into a temporary `Y.Doc` to read
metadata. Read `document.getMap('meta')` directly and save `state` to MongoDB.

### 2.2 `onAuthenticate` hook payload

```typescript
// from @hocuspocus/server dist/index.d.ts

interface ConnectionConfiguration {
  readOnly: boolean;
  isAuthenticated: boolean;
}

interface onAuthenticatePayload<Context = any> {
  context: Context;
  documentName: string;
  instance: Hocuspocus;
  requestHeaders: Headers;
  requestParameters: URLSearchParams;
  request: Request;
  socketId: string;
  token: string;
  connectionConfig: ConnectionConfiguration;   // mutate this to set readOnly
  providerVersion: string | null;
}
```

**Setting read-only on the connection:**
Mutate `data.connectionConfig.readOnly = true` inside `onAuthenticate`.
Do **not** attempt to return a `readOnly` flag — it is not read from the return value.

---

## 3. System Architecture

### 3.1 Communication Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                React Frontend  (Vite · Port 5173)                   │
│                                                                     │
│  ┌─────────────────────┐   ┌────────────────────┐                   │
│  │ DocumentTitleBar    │   │  Tiptap Editor      │                  │
│  │ useTitleSync()      │   │  CollaborationCursor│                  │
│  │ Y.Map('meta')       │   │  XmlFragment('default')               │
│  └──────────┬──────────┘   └────────────┬───────┘                   │
│             │                           │       Awareness (cursors) │
│             └────────────┬──────────────┘                           │
│                          ▼                                          │
│                    Y.Doc (CRDT state)                               │
│                          │                                          │
│                  HocuspocusProvider                                 │
│                  token = <doc-scoped JWT>                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
           ┌───────────────┴────────────────┐
           │ WebSocket                      │ HTTP REST
           │ ws://localhost:1234            │ http://localhost:5000
           ▼                               ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│  Hocuspocus Server   │    │  Express REST API                    │
│  (Port 1234)         │    │  (Port 5000)                         │
│  Process A           │    │  Process B (or same process)         │
│                      │    │                                      │
│  onAuthenticate      │    │  POST /api/auth/register             │
│  · verify doc JWT    │    │  POST /api/auth/login                │
│  · check doc still   │    │  GET  /api/auth/me                   │
│    accessible        │    │  POST /api/documents                 │
│  · set readOnly      │    │  GET  /api/documents                 │
│    for viewers       │    │  GET  /api/documents/:id             │
│                      │    │  PATCH /api/documents/:id/title      │
│  extension-database  │    │  DELETE /api/documents/:id           │
│  · fetch → MongoDB   │    │  POST /api/documents/:id/token       │
│  · store → MongoDB   │    │  POST /api/documents/:id/collaborators│
└──────────┬───────────┘    └──────────────────┬───────────────────┘
           │                                   │
           └───────────────┬───────────────────┘
                           ▼
             ┌─────────────────────────┐
             │         MongoDB         │
             │ collections:            │
             │  · users                │
             │  · documents            │
             └─────────────────────────┘
```

### 3.2 Life of a Keystroke

1. User A presses a key in Tiptap. ProseMirror creates a transaction.
2. `@tiptap/extension-collaboration` maps the transaction to a Yjs `XmlFragment('default')` update.
3. The local `Y.Doc` emits an `update` event. `HocuspocusProvider` serializes it to a binary frame and sends it over the WebSocket.
4. Hocuspocus receives the frame. `onAuthenticate` has already run and marked the connection trusted.
5. Hocuspocus applies the update to the server-side in-memory `Y.Doc` and broadcasts the binary frame to all other clients in the room.
6. User B's provider receives the frame, calls `Y.applyUpdate(ydoc, frame)`, and `y-prosemirror` produces a local ProseMirror transaction that updates User B's view without displacing their cursor.
7. After `debounce` ms of inactivity (default 2000 ms), Hocuspocus triggers `onStoreDocument`, which `extension-database` translates into the `store(storePayload)` call. The store function saves `state` (binary) and derived metadata to MongoDB in one atomic `findByIdAndUpdate`.

---

## 4. Process Architecture Decision

### Decision: Two ports, one Node.js process (development) — separate processes (production option)

**Rationale:**

In development, Express and Hocuspocus share one `tsx`-launched process:
- Simpler startup (`npm run dev:server` starts both listeners).
- Shared Mongoose connection and environment variables.
- A server restart during REST API development **will** disconnect active WebSocket sessions. This is acceptable in development.

In production, separate processes are recommended:
- Run `node dist/api.js` (Express, port 5000) and `node dist/collab.js` (Hocuspocus, port 1234) under `pm2` or similar.
- The REST API can restart independently without affecting collaboration sessions.
- Each process gets its own MongoDB connection pool.

**For Phase 1 scaffolding**, the server `package.json` provides **both** scripts:
```
npm run dev          → starts Express + Hocuspocus in one process
npm run dev:api      → starts Express only
npm run dev:collab   → starts Hocuspocus only
```

The server entry points are split accordingly:
```
server/src/index.ts        → starts both (development convenience)
server/src/api.ts          → starts Express only (production / independent restart)
server/src/collab.ts       → starts Hocuspocus only (production / independent restart)
```

---

## 5. Data Models

### 5.1 User Model

```typescript
// server/src/db/models/User.ts
interface IUser {
  _id: Types.ObjectId;       // auto-generated
  email: string;             // unique, lowercase, trimmed
  passwordHash: string;      // bcrypt, never returned in API responses
  name: string;              // display name, max 50 chars
  color: string;             // hex color for collaborative caret, e.g. '#10B981'
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.2 Document Model

```typescript
// server/src/db/models/Document.ts
type DocumentRole = 'owner' | 'editor' | 'viewer';

interface ICollaborator {
  userId: Types.ObjectId;   // ref: User
  role: 'editor' | 'viewer';
}

interface IDocument {
  _id: string;               // nanoid, e.g. 'doc_k7X2m9P1'
  title: string;             // mirrored from Y.Map('meta').get('title') on every store
  ownerId: Types.ObjectId;   // ref: User
  collaborators: ICollaborator[];
  isPublic: boolean;         // whether anyone with the link can access
  publicRole: 'editor' | 'viewer'; // role granted to unauthenticated / link-only users
  yjsState: Buffer | null;   // Y.encodeStateAsUpdate — the CRDT source of truth
  previewText: string;       // plain text excerpt, max 300 chars, for dashboard cards
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:
- `{ updatedAt: -1 }` — fast dashboard sort.
- `{ ownerId: 1, updatedAt: -1 }` — owner's document list.
- `{ 'collaborators.userId': 1 }` — collaborator's document list.

---

## 6. Single-Path Persistence: `@hocuspocus/extension-database`

```typescript
// server/src/collaboration/persistence.ts
import { Database } from '@hocuspocus/extension-database';
import * as Y from 'yjs';
import { DocumentModel } from '../db/models/Document';

export const mongoDatabaseExtension = new Database({
  /**
   * fetch(data: fetchPayload): Promise<Uint8Array | null>
   *
   * Called when the first client joins a room.
   * Returns the raw binary state or null for a brand-new document.
   * Do NOT instantiate a new Y.Doc here — the extension applies the
   * update to data.document automatically after fetch resolves.
   */
  fetch: async ({ documentName }) => {
    const record = await DocumentModel.findById(documentName).select('yjsState title');
    if (!record?.yjsState) return null;
    return new Uint8Array(record.yjsState);
  },

  /**
   * store(data: storePayload): Promise<void>
   *
   * storePayload extends onStoreDocumentPayload and adds:
   *   state: Buffer   ← Y.encodeStateAsUpdate(document), already encoded
   *   document: Y.Doc ← live in-memory document; read getMap('meta') directly
   *
   * Called debounced (default 2 s) and on room teardown.
   * Performs ONE atomic MongoDB write.
   */
  store: async ({ documentName, state, document }) => {
    // Read title from the shared CRDT map (no decode needed — document is live)
    const metaMap = document.getMap('meta');
    const title = metaMap.get('title') as string | undefined;

    // Extract plain-text preview from the XmlFragment
    const xmlFragment = document.getXmlFragment('default');
    const previewText = xmlFragment.toString()
      .replace(/<[^>]*>/g, '')
      .slice(0, 300);

    await DocumentModel.findByIdAndUpdate(
      documentName,
      {
        $set: {
          yjsState: state,          // Buffer from storePayload
          previewText,
          ...(title ? { title } : {}),
        },
      },
      { new: false },
    );
  },
});
```

---

## 7. Live Title Synchronization

### 7.1 Mechanism

The document title is stored inside the shared `Y.Doc` as `ydoc.getMap('meta')`:

```
Y.Doc
├── XmlFragment('default')  ← rich text content
└── Map('meta')             ← { title: string }
```

- On every keystroke in the title bar: `metaMap.set('title', newValue)`.
- This generates a CRDT update frame that propagates to all peers through Hocuspocus identically to content edits.
- Every peer's `metaMap.observe()` listener updates the local UI.

### 7.2 Conflict Semantics (documented accurately)

Yjs `Y.Map` uses **last-write-wins per key**, where "last" is determined by the Yjs
Lamport clock. This means:

> If two users type different titles concurrently (e.g. User A types "Sprint Goals"
> while User B types "Q4 Roadmap"), **one title will win deterministically** — the
> write with the higher logical timestamp. There is no character-by-character merge
> for Map values (unlike `Y.Text`).

**Consequence:** Simultaneous title edits by two users can discard one user's input.
This is a known, documented trade-off of using `Y.Map` for atomic string values.

**Mitigation options (deferred to a future phase):**
1. Use `Y.Text` for the title field to get character-level merge (same as the body).
2. Show a visible indicator when another user is editing the title (via awareness).
3. Accept the current semantics as sufficient for the MVP — the title is rarely edited
   simultaneously by two users in practice.

The implementation plan documents option 2 (awareness indicator in the title bar)
as a Phase 5 improvement. Option 1 requires changes to the client binding and is
deferred.

### 7.3 Title Seeding on Document Creation

When a document is first created via `POST /api/documents`, the server stores the
initial title in MongoDB. On first load, `fetch` returns null (no Yjs state yet).
The client checks `metaMap.get('title')` after the provider connects; if it is
empty, it calls `metaMap.set('title', doc.title)` (fetched from REST). This seeds
the map so subsequent persistence cycles capture the correct title.

---

## 8. Authentication, Authorization & Token Lifecycle

### 8.1 User Session Tokens (REST API)

- On `POST /api/auth/login`, the server issues a **user session JWT** (HS256):
  ```json
  { "sub": "<userId>", "name": "Alex", "email": "alex@example.com", "iat": ..., "exp": ... }
  ```
  Expiry: **24 hours** (configurable via `JWT_EXPIRY_HOURS` env var).
- Stored in `Authorization: Bearer <token>` header on all REST requests.
- Validated by `authMiddleware.ts` using `jwt.verify(token, JWT_SECRET)`.

### 8.2 Document-Scoped WebSocket Tokens

WebSocket sessions require a **separate short-lived token** issued per document:

```
POST /api/documents/:id/token
Authorization: Bearer <user session JWT>
→ { token: "<doc-scoped JWT>", expiresIn: 3600 }
```

The doc-scoped JWT payload:
```json
{
  "sub": "<userId>",
  "name": "Alex",
  "color": "#10B981",
  "documentId": "doc_k7X2m9P1",
  "role": "editor",
  "iat": ...,
  "exp": ...  (1 hour)
}
```

### 8.3 `onAuthenticate` Hook — Verified Implementation

```typescript
// server/src/collaboration/auth.ts
import jwt from 'jsonwebtoken';
import { DocumentModel } from '../db/models/Document';
import type { onAuthenticatePayload } from '@hocuspocus/server';

interface DocTokenPayload {
  sub: string;
  name: string;
  color: string;
  documentId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export async function authenticateConnection(data: onAuthenticatePayload) {
  const { token, documentName, connectionConfig } = data;

  // 1. Require a token
  if (!token) throw new Error('Authentication token required');

  // 2. Verify signature and expiry
  let decoded: DocTokenPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as DocTokenPayload;
  } catch {
    throw new Error('Invalid or expired token');
  }

  // 3. Token must be bound to this exact room
  if (decoded.documentId !== documentName) {
    throw new Error('Token does not match requested document room');
  }

  // 4. Re-validate current permissions against the live database
  //    This ensures revoked access or role downgrades are enforced
  //    even if the token has not expired yet.
  const doc = await DocumentModel.findById(documentName).select('ownerId collaborators isPublic publicRole');
  if (!doc) throw new Error('Document not found');

  const effectiveRole = resolveRole(doc, decoded.sub);
  if (!effectiveRole) throw new Error('Access denied');

  // 5. Enforce read-only for viewers by mutating connectionConfig
  if (effectiveRole === 'viewer') {
    connectionConfig.readOnly = true;
  }

  // 6. Return context that flows into all subsequent hook payloads
  return {
    user: { id: decoded.sub, name: decoded.name, color: decoded.color },
    role: effectiveRole,
  };
}

function resolveRole(doc: any, userId: string): 'owner' | 'editor' | 'viewer' | null {
  if (doc.ownerId.toString() === userId) return 'owner';
  const collab = doc.collaborators.find((c: any) => c.userId.toString() === userId);
  if (collab) return collab.role;
  if (doc.isPublic) return doc.publicRole;
  return null;
}
```

**Critical properties of this design:**
- The token is cryptographically bound to `documentId` and verified against `documentName` (the Hocuspocus room name). A token for `doc_A` cannot open room `doc_B`.
- Current permissions are re-checked from MongoDB at connection time, not only from the token. If an owner removes a collaborator after the token was issued, the next connection attempt is rejected.

### 8.4 Permission Revocation & Token Expiry Policy

| Scenario | Behaviour |
| :--- | :--- |
| Doc-scoped token expires (1 hr) | Provider reconnects; client must request a fresh token via REST before reconnecting. |
| User removed from collaborators while connected | Active WebSocket session continues until the connection closes (Hocuspocus has no server-push disconnect mechanism). On the next `onAuthenticate` (reconnect), access is denied. |
| `isPublic` toggled off while public users connected | Same as above — existing sessions persist; new connections are rejected. |
| Owner deletes the document | The next `store` call finds no MongoDB document and throws; the error is logged. The room closes naturally when all clients disconnect. |

> [!NOTE]
> Implementing server-push revocation (force-closing a WebSocket on permission change)
> is possible via `hocuspocusInstance.closeConnections(documentName)` but is
> deferred to a future phase. The 1-hour token expiry provides a reasonable security
> window for the MVP.

---

## 9. REST API Routes

| Method | Route | Auth | Permission | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | None | — | Create account, return user JWT |
| `POST` | `/api/auth/login` | None | — | Authenticate, return user JWT |
| `GET` | `/api/auth/me` | Bearer JWT | — | Return current user profile |
| `POST` | `/api/documents` | Bearer JWT | — | Create document, return id + share URL |
| `GET` | `/api/documents` | Bearer JWT | — | List owned + collaborated documents |
| `GET` | `/api/documents/:id` | Bearer JWT or public | `viewer` | Fetch document metadata |
| `PATCH` | `/api/documents/:id/title` | Bearer JWT | `editor` | Update title (REST fallback; not primary sync) |
| `POST` | `/api/documents/:id/collaborators` | Bearer JWT | `owner` | Add/update collaborator role |
| `DELETE` | `/api/documents/:id/collaborators/:userId` | Bearer JWT | `owner` | Remove collaborator |
| `POST` | `/api/documents/:id/token` | Bearer JWT or public | `viewer` | Issue doc-scoped WebSocket JWT |
| `DELETE` | `/api/documents/:id` | Bearer JWT | `owner` | Delete document + Yjs state |

---

## 10. Folder Structure

```
collabspace/
├── .gitignore
├── .nvmrc                             ← "24" — enforces Node 24 LTS
├── README.md
├── package.json                       ← root scripts (concurrently orchestration)
├── docs/
│   └── implementation-plan.md
│
├── client/                            ← React + Vite + Tailwind + Tiptap
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   ├── auth/
│       │   │   ├── AuthModal.tsx
│       │   │   ├── LoginForm.tsx
│       │   │   └── RegisterForm.tsx
│       │   ├── dashboard/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── DocumentCard.tsx
│       │   │   └── ShareModal.tsx
│       │   ├── editor/
│       │   │   ├── CollaboratorList.tsx
│       │   │   ├── ConnectionStatus.tsx
│       │   │   ├── DocumentTitleBar.tsx
│       │   │   ├── Editor.tsx
│       │   │   └── Toolbar.tsx
│       │   └── ui/
│       │       ├── Button.tsx
│       │       ├── Dialog.tsx
│       │       └── Input.tsx
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useCollaboration.ts
│       │   ├── useDocument.ts
│       │   └── useTitleSync.ts
│       ├── lib/
│       │   ├── api.ts
│       │   ├── colors.ts
│       │   └── token.ts
│       └── types/
│           └── index.ts
│
├── server/                            ← Node.js + Express + Hocuspocus
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   ← combined entrypoint (dev convenience)
│       ├── api.ts                     ← Express-only entrypoint (prod)
│       ├── collab.ts                  ← Hocuspocus-only entrypoint (prod)
│       ├── config/
│       │   └── env.ts                 ← Zod-validated env config
│       ├── db/
│       │   ├── connection.ts
│       │   └── models/
│       │       ├── Document.ts
│       │       └── User.ts
│       ├── api/
│       │   ├── routes/
│       │   │   ├── authRoutes.ts
│       │   │   └── documentRoutes.ts
│       │   ├── controllers/
│       │   │   ├── authController.ts
│       │   │   └── documentController.ts
│       │   └── middlewares/
│       │       ├── authMiddleware.ts
│       │       ├── documentAuth.ts
│       │       └── errorMiddleware.ts
│       ├── collaboration/
│       │   ├── server.ts              ← Hocuspocus Server.configure()
│       │   ├── auth.ts                ← onAuthenticate hook
│       │   └── persistence.ts        ← extension-database fetch/store
│       └── utils/
│           ├── logger.ts
│           └── tokens.ts
│
└── tests/
    ├── playwright.config.ts
    ├── e2e/
    │   ├── auth.spec.ts               ← register, login, protected routes
    │   ├── collaboration.spec.ts      ← 2-browser concurrent edit & formatting
    │   ├── permissions.spec.ts        ← viewer read-only enforcement
    │   ├── persistence.spec.ts        ← server restart & data restoration
    │   ├── presence.spec.ts           ← live cursors, names, color badges
    │   ├── recovery.spec.ts           ← offline → reconnect → convergence
    │   └── title-sync.spec.ts         ← real-time title propagation
    └── unit/
        ├── auth-api.test.ts
        └── crdt-convergence.test.ts
```

---

## 11. Implementation Phases

### Phase 1 — Workspace Setup ✅
Scaffold directory structure, package configs, dev scripts, env files, README.
Enforces Node 24 LTS via `.nvmrc`.

### Phase 2 — User Auth & Document Management REST API ✅
User model with unique normalized email and bcryptjs, Document model with nanoid ID, ownership, collaborators, and binary Yjs state. REST API routes for authentication, document CRUD, and doc-scoped token generation.
- Verified: 10/10 Auth API tests passing, 11/11 Document API tests passing.

### Phase 3 — Real-Time Collaboration Engine ✅
Hocuspocus v4.7.1 server, room parsing and validation (`document.<id>`), doc-scoped token verification, live permission re-validation against MongoDB, server-side read-only enforcement for viewers, onTokenSync active session demotion/revocation, single-path binary persistence via `@hocuspocus/extension-database`.
- Verified: 7/7 Collab engine tests passing, including active session demotion from editor to viewer.

### Phase 4 — Client Tiptap Editor & Yjs Sync ✅
Client library with typed REST API client and token helpers. `useCollaboration` hook encapsulating `Y.Doc` and `HocuspocusProvider` with lifecycle management, connection status tracking (`connecting`, `connected`, `syncing`, `disconnected`), and read-only flag. `useTitleSync` hook and `DocumentTitleBar` with `ydoc.getMap('meta')` synchronization. Tiptap rich-text editor with `Toolbar` (bold, italic, strike, headings, lists, quotes, code, undo/redo). Disconnected recovery and XML fragment synchronization verified.
- Verified: 4/4 Client editor sync tests passing; 33/33 total test suite passing; client and server TypeScript compilation and production builds clean.

### Phase 5 — Presence, Collaborator Awareness & Live Cursors ✅
`@tiptap/extension-collaboration-cursor`, provider awareness protocol, collaborator presence list (`CollaboratorList.tsx`), live cursor carets and user labels, remote selections, and active user avatar badges.
- Verified: 4/4 Awareness unit/integration tests passing.
- Verified: Playwright multi-browser E2E test (`tests/e2e/presence.spec.ts`) passing in Chromium, validating rendered remote cursor caret and label elements in the DOM.
- Verified: 37/37 total test suite passing; client and server TypeScript compilation and production builds clean.

### Phase 6 — Document Dashboard & Share Modal ✅
Dashboard view, new-document flow, shareable URL, viewer/editor role toggle, collaborator management, and public access enforcement.
- Built reusable UI primitives: `Button.tsx`, `Input.tsx`, and accessible `Dialog.tsx`.
- Implemented `AuthProvider` and `useAuth` hook with localStorage token persistence and session hydration.
- Implemented `LoginForm.tsx`, `RegisterForm.tsx` (with collaborator color swatch picker), and `AuthModal.tsx`.
- Implemented `useDocument` hook with CRUD and collaborator management operations.
- Implemented `DocumentCard.tsx` with role badges, public/private indicators, preview text, relative timestamps, and deletion.
- Implemented `ShareModal.tsx` supporting live public access toggle, viewer vs editor role toggle, instant link copying, and teammate invitation/removal.
- Implemented `Dashboard.tsx` with search filtering, view tabs (All / Created by me / Shared with me), and "+ New Document" modal.
- Integrated unified application routing in `App.tsx` smoothly switching between Landing view, Dashboard, and Document Editor.
- Enforced viewer read-only permissions across client editor (`contenteditable="false"`, read-only badge) and server transport.
- Verified: Complete Playwright multi-browser E2E suite (`tests/e2e/dashboard-share.spec.ts`, `tests/e2e/browser-smoke.spec.ts`, `tests/e2e/presence.spec.ts`) passing 100%.
- Verified: 37/37 unit/integration tests passing; client and server TypeScript compilation and production builds clean.

### Phase 7 — Testing & Final Polish ⏳ (Next phase)
Vitest CRDT unit tests, Playwright multi-browser E2E suite, README completion.

**Acceptance criteria:**
- `npm run test:unit` passes all Vitest tests.
- `npm run test:e2e` passes all Playwright tests.

---

## 12. Security & Environment

### `server/.env.example`
```env
NODE_ENV=development
PORT=5000
COLLAB_PORT=1234
MONGODB_URI=mongodb://localhost:27017/collabspace
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRY_HOURS=24
DOC_TOKEN_EXPIRY_SECONDS=3600
CLIENT_URL=http://localhost:5173
```

### `client/.env.example`
```env
VITE_API_URL=http://localhost:5000/api
VITE_COLLAB_WS_URL=ws://localhost:1234
```

### Security measures
- Passwords hashed with bcrypt (cost factor 12).
- All secrets in `.env` (`.gitignore`d), validated with Zod at startup.
- CORS restricted to `CLIENT_URL`.
- Helmet on Express for HTTP security headers.
- Doc-scoped JWT cryptographically bound to `documentId` and verified against `documentName` in `onAuthenticate`.
- Live permission re-validation in `onAuthenticate` from MongoDB (not just token claims).
- Viewer connections set `connectionConfig.readOnly = true` — writes rejected at transport.
- Hocuspocus payload size limited via configuration.
