import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useDocument } from '../../hooks/useDocument';
import { DocumentCard } from './DocumentCard';
import { ShareModal } from './ShareModal';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  FileText,
  Plus,
  Search,
  LogOut,
  FolderOpen,
  Users,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react';
import type { DocumentMeta } from '../../types';

interface DashboardProps {
  onOpenDocument: (documentId: string) => void;
}

export function Dashboard({ onOpenDocument }: DashboardProps) {
  const { user, logout } = useAuth();
  const {
    documents,
    isLoading,
    fetchDocuments,
    createDocument,
    deleteDocument,
  } = useDocument();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'owned' | 'shared'>('all');
  const [activeShareDoc, setActiveShareDoc] = useState<DocumentMeta | null>(null);

  // Create document modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocPublic, setNewDocPublic] = useState(true);
  const [newDocRole, setNewDocRole] = useState<'editor' | 'viewer'>('editor');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Filtered documents calculation
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Filter by tab
      const isOwner = doc.userRole === 'owner' || (user && doc.ownerId === user.id);
      if (filterTab === 'owned' && !isOwner) return false;
      if (filterTab === 'shared' && isOwner) return false;

      // Filter by search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = (doc.title || 'Untitled Document').toLowerCase().includes(q);
      const matchPreview = (doc.previewText || '').toLowerCase().includes(q);
      const matchId = doc.id.toLowerCase().includes(q);
      return matchTitle || matchPreview || matchId;
    });
  }, [documents, filterTab, searchQuery, user]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const doc = await createDocument({
        title: newDocTitle.trim() || 'Untitled Document',
        isPublic: newDocPublic,
        publicRole: newDocRole,
      });
      setIsCreateModalOpen(false);
      setNewDocTitle('');
      onOpenDocument(doc.id);
    } catch (err) {
      console.error('Failed to create document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const userInitial = user?.name ? user.name[0].toUpperCase() : 'U';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* ── Top Dashboard Header ───────────────────────────────── */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 text-blue-600 font-bold text-lg select-none">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <span>CollabSpace</span>
          </div>

          {/* Quick Search Bar */}
          <div className="hidden md:flex items-center w-72">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                className="w-full bg-slate-100 hover:bg-slate-200/70 focus:bg-white border border-transparent focus:border-blue-400 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Document
          </Button>

          <div className="h-5 w-[1px] bg-slate-200" />

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200/60">
            <div
              className="w-6 h-6 rounded-full text-white font-bold text-[11px] flex items-center justify-center shadow-2xs"
              style={{ backgroundColor: user?.color || '#3B82F6' }}
            >
              {userInitial}
            </div>
            <span className="text-xs font-semibold text-slate-800 hidden sm:inline">
              {user?.name || 'User'}
            </span>
          </div>

          <button
            type="button"
            onClick={logout}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Main Content Container ─────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 sm:p-8 text-white shadow-md mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Real-Time Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {user?.name || 'Collaborator'}!
            </h1>
            <p className="mt-1 text-blue-100 text-sm max-w-xl">
              Create and edit documents collaboratively. Every keystroke, live caret, and title rename converges deterministically with Yjs CRDTs.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setIsCreateModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
            className="bg-white text-blue-600 hover:bg-blue-50 shadow-sm flex-shrink-0"
          >
            Create Document
          </Button>
        </div>

        {/* Filter Tabs and Mobile Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 border-b sm:border-b-0 border-slate-200 pb-2 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              All Documents ({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('owned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterTab === 'owned'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Created by me
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('shared')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterTab === 'shared'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              Shared with me
            </button>
          </div>

          {/* Search bar on mobile */}
          <div className="md:hidden relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchQuery('');
              }}
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Document Grid ───────────────────────────────────────── */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading your documents...</p>
          </div>
        ) : filteredDocuments.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onOpen={onOpenDocument}
                onShare={(documentToShare) => setActiveShareDoc(documentToShare)}
                onDelete={handleDelete}
                currentUserId={user?.id}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto my-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              {searchQuery ? (
                <FolderOpen className="w-7 h-7" />
              ) : filterTab === 'shared' ? (
                <Users className="w-7 h-7" />
              ) : (
                <FileText className="w-7 h-7" />
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              {searchQuery
                ? 'No matching documents'
                : filterTab === 'shared'
                ? 'No shared documents'
                : 'No documents yet'}
            </h3>
            <p className="text-xs text-slate-500 mb-5 max-w-xs leading-relaxed">
              {searchQuery
                ? `No documents matched "${searchQuery}". Try a different keyword.`
                : filterTab === 'shared'
                ? 'When someone invites you to collaborate, their documents will appear here.'
                : 'Create your first collaborative document to get started.'}
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setFilterTab('all');
                setIsCreateModalOpen(true);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              Create New Document
            </Button>
          </div>
        )}
      </main>

      {/* ── Modal: Create New Document ──────────────────────────── */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Document"
        description="Start a fresh real-time collaborative canvas."
        maxWidth="sm"
      >
        <form onSubmit={handleCreateDocument} className="space-y-4">
          <Input
            label="Document Title"
            placeholder="e.g. Q4 Product Roadmap"
            value={newDocTitle}
            onChange={(e) => setNewDocTitle(e.target.value)}
            autoFocus
          />

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="font-semibold text-slate-800">
                Enable Public Link Sharing
              </span>
              <input
                type="checkbox"
                checked={newDocPublic}
                onChange={(e) => setNewDocPublic(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
            <p className="text-[11px] text-slate-500">
              Anyone with the link will be able to access this document.
            </p>

            {newDocPublic && (
              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-200">
                <span className="text-slate-600">Default access level:</span>
                <select
                  value={newDocRole}
                  onChange={(e) =>
                    setNewDocRole(e.target.value as 'editor' | 'viewer')
                  }
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 font-medium"
                >
                  <option value="editor">Editor (Can edit)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isCreating}
              icon={<Plus className="w-4 h-4" />}
            >
              Create Document
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Modal: Share Document ───────────────────────────────── */}
      {activeShareDoc && (
        <ShareModal
          isOpen={!!activeShareDoc}
          onClose={() => setActiveShareDoc(null)}
          document={activeShareDoc}
          onUpdate={(updated) => {
            fetchDocuments();
            setActiveShareDoc(updated);
          }}
        />
      )}
    </div>
  );
}
