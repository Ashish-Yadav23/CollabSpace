import { useState, useEffect, useMemo, useCallback } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useCollaboration } from './hooks/useCollaboration';
import { useTitleSync } from './hooks/useTitleSync';
import { api } from './lib/api';
import { Editor } from './components/editor/Editor';
import { DocumentTitleBar } from './components/editor/DocumentTitleBar';
import { ConnectionStatus } from './components/editor/ConnectionStatus';
import { CollaboratorList } from './components/editor/CollaboratorList';
import { Dashboard } from './components/dashboard/Dashboard';
import { ShareModal } from './components/dashboard/ShareModal';
import { AuthModal } from './components/auth/AuthModal';
import { Button } from './components/ui/Button';
import {
  FileText,
  Share2,
  ChevronLeft,
  AlertCircle,
  Eye,
  Users,
  Shield,
  Zap,
  Sparkles,
  ArrowRight,
  LogIn,
} from 'lucide-react';
import type { DocumentMeta, DocumentRole } from './types';

function EditorView({
  docId,
  onBack,
  onOpenAuth,
}: {
  docId: string;
  onBack: () => void;
  onOpenAuth: () => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenParam = urlParams.get('token') || undefined;
  const roleParam = (urlParams.get('role') as DocumentRole) || undefined;
  const userParam = urlParams.get('user') || urlParams.get('name') || undefined;
  const colorParam = urlParams.get('color') || undefined;

  const initialUser = useMemo(() => {
    if (user) {
      return {
        id: user.id,
        name: user.name,
        color: user.color,
      };
    }
    if (userParam) {
      return {
        name: userParam,
        color: colorParam || '#3B82F6',
      };
    }
    return undefined;
  }, [user, userParam, colorParam]);

  const {
    doc,
    provider,
    status,
    isReadOnly,
    error,
    currentUser,
    reconnect,
  } = useCollaboration({
    documentId: docId,
    token: tokenParam,
    role: roleParam,
    user: initialUser,
  });

  const { title, setTitle } = useTitleSync({
    doc,
    defaultTitle: 'Untitled Document',
    isReadOnly,
  });

  // Document metadata for Share modal
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Fetch document metadata if possible (for role, permissions, and sharing)
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const res = await api.documents.get(docId);
        if (isMounted) {
          setDocMeta({
            ...res.document,
            userRole: res.role,
          });
        }
      } catch {
        // Unauthenticated or restricted; fallback to default public metadata representation
        if (isMounted) {
          setDocMeta({
            id: docId,
            title: title || 'Collaborative Document',
            ownerId: '',
            isPublic: true,
            publicRole: isReadOnly ? 'viewer' : 'editor',
            userRole: isReadOnly ? 'viewer' : 'editor',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [docId, title, isReadOnly]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 mr-4">
          {/* Back to Dashboard Button */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Return to Dashboard"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Documents</span>
          </button>

          <div className="h-5 w-[1px] bg-slate-200 hidden sm:block" />

          {/* Logo */}
          <div className="flex items-center gap-2 text-blue-600 font-bold text-base select-none">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
              <FileText className="w-4 h-4" />
            </div>
            <span className="hidden md:inline">CollabSpace</span>
          </div>

          <div className="h-5 w-[1px] bg-slate-200" />

          {/* Collaborative Title Bar */}
          <div className="flex-1 min-w-0 max-w-md">
            <DocumentTitleBar
              title={title}
              onTitleChange={setTitle}
              isReadOnly={isReadOnly}
            />
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Collaborator Presence Avatar List */}
          <CollaboratorList provider={provider} currentUser={currentUser} />

          <div className="h-5 w-[1px] bg-slate-200 hidden sm:block" />

          <ConnectionStatus
            status={status}
            isReadOnly={isReadOnly}
            onReconnect={reconnect}
          />

          {/* Share Modal Trigger */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsShareModalOpen(true)}
            icon={<Share2 className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">Share</span>
          </Button>

          {/* Auth status avatar / sign in */}
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Read-Only Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Viewing only:</strong> You have read-only access to this document. Contact the owner to request editing rights.
            </span>
          </div>
        </div>
      )}

      {/* Error notification banner */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={reconnect}
            className="underline font-semibold hover:text-rose-950 cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Editor Main Canvas */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        <Editor
          doc={doc}
          provider={provider}
          currentUser={currentUser}
          isReadOnly={isReadOnly}
          className="flex-1 shadow-sm"
          placeholder="Start typing collaboratively. Changes and live cursors sync instantly..."
        />
      </main>

      {/* Footer Info */}
      <footer className="py-3 px-6 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        <span>
          Room: <code className="bg-slate-50 px-1.5 py-0.5 rounded text-slate-600 font-mono">document.{docId}</code>
        </span>
        <span className="mx-2">•</span>
        <span>Yjs CRDT Engine</span>
        <span className="mx-2">•</span>
        <span>Live Awareness & Cursors</span>
      </footer>

      {/* Share Modal */}
      {docMeta && isShareModalOpen && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          document={docMeta}
          onUpdate={(updated) =>
            setDocMeta((prev) => ({
              ...updated,
              userRole: prev?.userRole || 'owner',
            }))
          }
        />
      )}
    </div>
  );
}

function LandingView({
  onOpenAuth,
  onTryDemo,
}: {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onTryDemo: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* ── Landing Navigation ─────────────────────────────────── */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5 text-blue-600 font-bold text-lg select-none">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <span>CollabSpace</span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenAuth('login')}
            icon={<LogIn className="w-4 h-4" />}
          >
            Sign In
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onOpenAuth('register')}
          >
            Get Started
          </Button>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Real-Time CRDT Collaboration Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 max-w-3xl leading-tight">
          Collaborative Editing,{' '}
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Without Merge Conflicts.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
          CollabSpace delivers fluid multi-user document collaboration with live colored cursors, floating collaborator labels, atomic Yjs CRDT synchronization, and granular link permissions.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => onOpenAuth('register')}
            icon={<ArrowRight className="w-5 h-5" />}
            className="w-full sm:w-auto"
          >
            Start Collaborating Free
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onTryDemo}
            className="w-full sm:w-auto"
          >
            Try Live Interactive Demo
          </Button>
        </div>

        {/* ── Feature Cards Grid ─────────────────────────────────── */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">
              Conflict-Free CRDTs
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Every keystroke merges deterministically via Yjs. Concurrent edits across collaborators never produce race conditions or lost updates.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">
              Live Presence & Cursors
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Display colored carets, floating collaborator name pills, remote text selections, and live collaborator avatars that clean up gracefully upon disconnect.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1.5">
              Granular Link Sharing
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Share documents publicly or with invited team members. Toggle read-only viewer mode to strictly prevent unauthorized edits at both client and server transport layers.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        CollabSpace • Built with React, Tiptap v2, Yjs, Hocuspocus & MongoDB
      </footer>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Route state
  const [docId, setDocId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('doc');
  });

  // Auth modal state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Synchronize browser history / URL query parameter
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setDocId(params.get('doc'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openDocument = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('doc', id);
    window.history.pushState({}, '', url.toString());
    setDocId(id);
  }, []);

  const handleBackToDashboard = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('doc');
    url.searchParams.delete('token');
    url.searchParams.delete('role');
    url.searchParams.delete('user');
    url.searchParams.delete('name');
    url.searchParams.delete('color');
    window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
    setDocId(null);
  }, []);

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── VIEW 1: Document Editor View ──────────────────────────────────
  if (docId) {
    return (
      <>
        <EditorView
          docId={docId}
          onBack={handleBackToDashboard}
          onOpenAuth={() => handleOpenAuth('login')}
        />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          defaultMode={authMode}
        />
      </>
    );
  }

  // ── VIEW 2: Dashboard View (Logged-in User) ────────────────────────
  if (isAuthenticated) {
    return <Dashboard onOpenDocument={openDocument} />;
  }

  // ── VIEW 3: Landing / Welcome View (Guest) ─────────────────────────
  return (
    <>
      <LandingView
        onOpenAuth={handleOpenAuth}
        onTryDemo={() => openDocument('doc_demo')}
      />
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        defaultMode={authMode}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
