import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../lib/api';
import { getAuthToken, setAuthToken, removeAuthToken } from '../lib/token';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, color?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize and verify existing token from localStorage
  useEffect(() => {
    async function initAuth() {
      const storedToken = getAuthToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.auth.getMe();
        setUser(response.user);
        setToken(storedToken);
      } catch (err) {
        console.warn('Stored auth token invalid or expired, clearing session:', err);
        removeAuthToken();
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.auth.login({ email, password });
      setAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : err?.message || 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, color?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.auth.register({ email, password, name, color });
        setAuthToken(response.token);
        setToken(response.token);
        setUser(response.user);
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    removeAuthToken();
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
