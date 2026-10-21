import { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
  onSuccess?: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  defaultMode = 'login',
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
    }
  }, [isOpen, defaultMode]);

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      title={mode === 'login' ? 'Welcome back to CollabSpace' : 'Create your CollabSpace account'}
      description={
        mode === 'login'
          ? 'Sign in to access and manage your collaborative documents.'
          : 'Collaborate in real-time with zero merge conflicts.'
      }
    >
      <div className="flex border-b border-slate-100 mb-5">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            mode === 'login'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            mode === 'register'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Create Account
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm
          onSuccess={handleSuccess}
          onSwitchToRegister={() => setMode('register')}
        />
      ) : (
        <RegisterForm
          onSuccess={handleSuccess}
          onSwitchToLogin={() => setMode('login')}
        />
      )}
    </Dialog>
  );
}
