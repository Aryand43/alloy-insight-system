const mockEnabled = () =>
  (import.meta.env.VITE_USE_MOCK ?? 'true').toString().toLowerCase() !== 'false'

const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  )

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isMockMode(): boolean {
  return mockEnabled()
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(body || res.statusText || 'Request failed', res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Binary variant of apiFetch, for the raw temperature field. */
export async function apiFetchBinary(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(body || res.statusText || 'Request failed', res.status)
  }
  return res
}
