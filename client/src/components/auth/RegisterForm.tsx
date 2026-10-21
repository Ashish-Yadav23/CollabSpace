import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { COLLABORATOR_COLORS } from '../../lib/colors';
import { Mail, Lock, User as UserIcon, Check, AlertCircle } from 'lucide-react';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const { register, error, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLLABORATOR_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!name.trim() || !email.trim() || !password) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      await register(email.trim(), password, name.trim(), selectedColor);
      onSuccess?.();
    } catch {
      // Handled by AuthContext
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
        label="Full Name"
        type="text"
        placeholder="Ada Lovelace"
        value={name}
        onChange={(e) => setName(e.target.value)}
        icon={<UserIcon className="w-4 h-4" />}
        autoComplete="name"
        required
      />

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
        placeholder="•••••••• (min 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        icon={<Lock className="w-4 h-4" />}
        autoComplete="new-password"
        required
      />

      {/* Collaborator Caret Color Picker */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Collaborator Caret Color
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          {COLLABORATOR_COLORS.map((hex) => {
            const isSelected = selectedColor === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => setSelectedColor(hex)}
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer
                  hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                  ${isSelected ? 'ring-2 ring-offset-2 ring-slate-800 scale-105' : ''}
                `}
                style={{ backgroundColor: hex }}
                aria-label={`Select color ${hex}`}
              >
                {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-400">
          This color identifies your live cursor and avatar to collaborators.
        </p>
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isSubmitting}
        >
          Create Account
        </Button>
      </div>

      {onSwitchToLogin && (
        <p className="text-center text-xs text-slate-500 pt-2">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-blue-600 font-semibold hover:underline cursor-pointer"
          >
            Sign in
          </button>
        </p>
      )}
    </form>
  );
}
