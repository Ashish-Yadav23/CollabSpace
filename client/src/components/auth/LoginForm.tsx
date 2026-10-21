import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Lock, AlertCircle } from 'lucide-react';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError('Please fill in all fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
      onSuccess?.();
    } catch {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {displayError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      )}

      <Input
        label="Email address"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<Mail className="w-4 h-4" />}
        autoComplete="email"
        required
      />

      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        icon={<Lock className="w-4 h-4" />}
        autoComplete="current-password"
        required
      />

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isSubmitting}
        >
          Sign In
        </Button>
      </div>

      {onSwitchToRegister && (
        <p className="text-center text-xs text-slate-500 pt-2">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-blue-600 font-semibold hover:underline cursor-pointer"
          >
            Create account
          </button>
        </p>
      )}
    </form>
  );
}
