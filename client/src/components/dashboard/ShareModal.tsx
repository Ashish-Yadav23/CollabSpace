import { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import {
  Globe,
  Lock,
  Copy,
  Check,
  UserPlus,
  Trash2,
  AlertCircle,
  Eye,
  Edit3,
} from 'lucide-react';
import type { DocumentMeta, DocumentCollaborator } from '../../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentMeta;
  onUpdate?: (updatedDoc: DocumentMeta) => void;
}

export function ShareModal({
  isOpen,
  onClose,
  document,
  onUpdate,
}: ShareModalProps) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentMeta>(document);
  const [copied, setCopied] = useState(false);

  // Link settings
  const [isPublic, setIsPublic] = useState(document.isPublic);
  const [publicRole, setPublicRole] = useState<'editor' | 'viewer'>(
    document.publicRole || 'editor'
  );
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Invite collaborators
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [isInviting, setIsInviting] = useState(false);
  const [collaborators, setCollaborators] = useState<DocumentCollaborator[]>(
    document.collaborators || []
  );

  const [error, setError] = useState<string | null>(null);

  const ownerIdStr =
    typeof doc.ownerId === 'object' && doc.ownerId
      ? ((doc.ownerId as any)._id?.toString() || (doc.ownerId as any).id?.toString() || '')
      : (doc.ownerId?.toString() || '');

  const isOwner =
    doc.userRole === 'owner' ||
    (user && (user.id === ownerIdStr || user.id === doc.ownerId));

  // Sync state when document prop changes
  useEffect(() => {
    setDoc(document);
    setIsPublic(document.isPublic);
    setPublicRole(document.publicRole || 'editor');
    setCollaborators(document.collaborators || []);
    setError(null);
  }, [document, isOpen]);

  // Construct the shareable URL
  const shareUrl = `${window.location.origin}/?doc=${doc.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateLinkSettings = async (
    newPublic: boolean,
    newRole: 'editor' | 'viewer'
  ) => {
    if (!isOwner) return;
    setIsUpdatingSettings(true);
    setError(null);
    try {
      const response = await api.documents.update(doc.id, {
        isPublic: newPublic,
        publicRole: newRole,
      });
      const mergedDoc: DocumentMeta = {
        ...response.document,
        userRole: doc.userRole || 'owner',
      };
      setIsPublic(newPublic);
      setPublicRole(newRole);
      setDoc(mergedDoc);
      onUpdate?.(mergedDoc);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update sharing settings';
      setError(msg);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !isOwner) return;

    setIsInviting(true);
    setError(null);
    try {
      const response = await api.documents.addCollaborator(doc.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setCollaborators(response.collaborators);
      setInviteEmail('');
      // Refetch document to stay in sync
      const refreshed = await api.documents.get(doc.id);
      setDoc(refreshed.document);
      onUpdate?.(refreshed.document);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Failed to add collaborator';
      setError(msg);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorUserId: string) => {
    if (!isOwner) return;
    setError(null);
    try {
      const response = await api.documents.removeCollaborator(
        doc.id,
        collaboratorUserId
      );
      setCollaborators(response.collaborators);
      const refreshed = await api.documents.get(doc.id);
      setDoc(refreshed.document);
      onUpdate?.(refreshed.document);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Failed to remove collaborator';
      setError(msg);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Share Document"
      description={`Manage permissions and sharing settings for "${doc.title || 'Untitled Document'}"`}
      maxWidth="md"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── SECTION 1: Link Sharing ────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                {isPublic ? (
                  <Globe className="w-4 h-4 text-blue-600" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  {isPublic ? 'Public Link Access' : 'Restricted Link Access'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isPublic
                    ? 'Anyone with the link can access this document'
                    : 'Only invited collaborators can access'}
                </p>
              </div>
            </div>

            {/* Toggle public link switch (owner only) */}
            {isOwner && (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  disabled={isUpdatingSettings}
                  onChange={(e) =>
                    handleUpdateLinkSettings(e.target.checked, publicRole)
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            )}
          </div>

          {/* If public is active, show public role selector */}
          {isPublic && isOwner && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
              <span className="text-slate-600 font-medium">
                Public access permission:
              </span>
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-md border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleUpdateLinkSettings(true, 'viewer')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    publicRole === 'viewer'
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Can view</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateLinkSettings(true, 'editor')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    publicRole === 'editor'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Can edit</span>
                </button>
              </div>
            </div>
          )}

          {/* Copy Link Field */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 select-all focus:outline-none"
            />
            <Button
              type="button"
              variant={copied ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleCopyLink}
              icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
        </div>

        <div className="h-[1px] bg-slate-100" />

        {/* ── SECTION 2: Invite Collaborators (Owner Only) ────────── */}
        {isOwner && (
          <form onSubmit={handleAddCollaborator} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-900">
              Invite collaborator by email
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="collaborator@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={isInviting}
                  required
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as 'editor' | 'viewer')
                }
                disabled={isInviting}
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isInviting}
                icon={<UserPlus className="w-4 h-4" />}
              >
                Invite
              </Button>
            </div>
          </form>
        )}

        {/* ── SECTION 3: Current Members ─────────────────────────── */}
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">
            People with access
          </h4>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden bg-white">
            {/* Owner Entry */}
            <div className="px-3.5 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs">
                  {user?.name ? user.name[0].toUpperCase() : 'O'}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">
                    {user?.name || 'Owner'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {user?.email || 'Owner of this document'}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                Owner
              </span>
            </div>

            {/* Invited Collaborators */}
            {collaborators.map((collab) => {
              const collabUser = collab.user;
              const userId = collab.userId;
              const displayName = collabUser?.name || 'Collaborator';
              const displayEmail = collabUser?.email || userId;
              const initial = displayName[0]?.toUpperCase() || 'C';
              const color = collabUser?.color || '#10B981';

              return (
                <div
                  key={userId}
                  className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full text-white font-bold flex items-center justify-center text-xs shadow-2xs"
                      style={{ backgroundColor: color }}
                    >
                      {initial}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {displayName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {displayEmail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        collab.role === 'editor'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {collab.role === 'editor' ? 'Editor' : 'Viewer'}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCollaborator(userId)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Remove collaborator"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
