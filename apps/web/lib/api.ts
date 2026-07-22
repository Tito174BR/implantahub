import {
  clearSession,
  clearTenant,
  clearUser,
  getAccessToken,
  getTenant,
  getUser,
  setAccessToken,
  setTenant,
  setUser,
  type StoredTenant,
  type StoredUser,
} from './session';

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const sameOriginBaseUrl = configuredBaseUrl?.startsWith('/') ? configuredBaseUrl : '/api/v1';

/**
 * The browser always uses the same origin by default. In Docker, Next.js and
 * Nginx proxy /api to the API container. This avoids CORS and localhost/IP
 * mismatches when the platform is opened through port 3000, 8080 or a domain.
 */
export const apiBaseUrl = sameOriginBaseUrl.replace(/\/$/, '');

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message?: string; reason?: string }>;
  };
  meta?: {
    requestId?: string;
    correlationId?: string;
  };
}

interface RefreshResponse {
  data: {
    accessToken: string;
    user?: StoredUser;
    tenant?: StoredTenant | null;
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = 'NETWORK_ERROR',
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

function createCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath.startsWith('/api/')) {
    return normalizedPath;
  }

  return `${apiBaseUrl}${normalizedPath}`;
}

function isBinaryBody(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData
    || typeof Blob !== 'undefined' && body instanceof Blob
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)
    || body instanceof URLSearchParams;
}

function shouldRefresh(path: string): boolean {
  const normalized = path.toLowerCase();
  return !normalized.endsWith('/auth/login')
    && !normalized.endsWith('/auth/refresh')
    && !normalized.endsWith('/auth/accept-invitation');
}

function composeSignal(externalSignal: AbortSignal | null | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function fetchWithNetworkHandling(
  input: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const { signal, cleanup } = composeSignal(init.signal, timeoutMs);

  try {
    return await fetch(input, { ...init, signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiClientError(
        'A API demorou mais de 30 segundos para responder. Verifique os containers api, postgres e redis.',
        0,
        'API_TIMEOUT',
      );
    }

    throw new ApiClientError(
      'Não foi possível conectar à API. Confirme se o container api está saudável e abra a plataforma pela mesma URL usada no Docker.',
      0,
      'API_UNREACHABLE',
    );
  } finally {
    cleanup();
  }
}

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetchWithNetworkHandling(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-Correlation-ID': createCorrelationId(),
        },
      });

      if (!response.ok) return false;

      const body = await response.json() as RefreshResponse;
      setAccessToken(body.data.accessToken);
      if (body.data.user) setUser(body.data.user);
      else clearUser();
      if (body.data.tenant) setTenant(body.data.tenant);
      else clearTenant();
      return Boolean(body.data.user);
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseError(response: Response): Promise<ApiClientError> {
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  const details = body.error?.details
    ?.map((item) => item.message ?? item.reason)
    .filter(Boolean)
    .join(' · ');
  const message = details
    ? `${body.error?.message ?? `Erro HTTP ${response.status}`} ${details}`
    : body.error?.message ?? `Erro HTTP ${response.status}`;

  return new ApiClientError(
    message,
    response.status,
    body.error?.code ?? `HTTP_${response.status}`,
    body.meta?.correlationId ?? response.headers.get('x-correlation-id') ?? undefined,
  );
}

async function authenticatedRequest(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  headers.set('X-Correlation-ID', headers.get('X-Correlation-ID') ?? createCorrelationId());

  if (init.body && !headers.has('Content-Type')) {
    if (typeof init.body === 'string' || !isBinaryBody(init.body)) {
      headers.set('Content-Type', 'application/json');
    }
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetchWithNetworkHandling(buildUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && shouldRefresh(path) && await tryRefresh()) {
    return authenticatedRequest(path, init, false);
  }

  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw error;
  }

  return response;
}

export async function restoreSession(): Promise<boolean> {
  if (getAccessToken() && getUser() && getTenant()) return true;
  const refreshed = await tryRefresh();
  return refreshed && Boolean(getAccessToken() && getUser() && getTenant());
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedRequest(path, init);
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiClientError(
      'A API respondeu em um formato inesperado. Verifique o proxy do frontend e os logs do container api.',
      response.status,
      'INVALID_API_RESPONSE',
      response.headers.get('x-correlation-id') ?? undefined,
    );
  }

  return response.json() as Promise<T>;
}

export async function apiDownload(
  path: string,
  init: RequestInit = {},
): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await authenticatedRequest(path, init);
  const disposition = response.headers.get('content-disposition');
  const encodedMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition?.match(/filename="?([^";]+)"?/i);
  const fileName = encodedMatch?.[1]
    ? decodeURIComponent(encodedMatch[1])
    : plainMatch?.[1] ?? null;

  return {
    blob: await response.blob(),
    fileName,
  };
}
