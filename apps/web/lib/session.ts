const TOKEN_KEY = 'implantahub.accessToken';
const TENANT_KEY = 'implantahub.tenant';
const USER_KEY = 'implantahub.user';

export interface StoredTenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface StoredUser {
  id: string;
  displayName: string;
  email: string;
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function setTenant(tenant: StoredTenant): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

export function getTenant(): StoredTenant | null {
  return readJson<StoredTenant>(TENANT_KEY);
}

export function clearTenant(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TENANT_KEY);
}

export function setUser(user: StoredUser): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): StoredUser | null {
  return readJson<StoredUser>(USER_KEY);
}

export function clearUser(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(USER_KEY);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TENANT_KEY);
  sessionStorage.removeItem(USER_KEY);
}
