const AUTH_TOKEN_KEY = 'collabspace_auth_token';

/**
 * Retrieves the stored JWT authentication token from localStorage.
 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Stores the JWT authentication token in localStorage.
 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (err) {
    console.error('Failed to save auth token to localStorage:', err);
  }
}

/**
 * Removes the stored authentication token from localStorage.
 */
export function removeAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (err) {
    console.error('Failed to remove auth token from localStorage:', err);
  }
}

/**
 * Checks whether an auth token is currently present.
 */
export function hasAuthToken(): boolean {
  return !!getAuthToken();
}
