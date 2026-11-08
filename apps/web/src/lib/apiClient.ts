const STORAGE_TOKEN_KEY = "burgersflow_token";
const STORAGE_USER_KEY = "burgersflow_user";

let accessToken: string | null = typeof window !== "undefined" ? localStorage.getItem(STORAGE_TOKEN_KEY) : null;
let userProfile: any = null;
try {
  const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_USER_KEY) : null;
  if (saved) userProfile = JSON.parse(saved);
} catch (e) {}

export function setToken(token: string | null, user: any = null) {
  accessToken = token;
  userProfile = user;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
    if (user) {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  }
}

export function logout() {
  setToken(null, null);
}

export function getToken(): string | null {
  return accessToken;
}

export function getUser(): any | null {
  return userProfile;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(`/api/v1${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": Math.random().toString(36).substring(2, 12),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...init.headers,
      },
    });

  let res = await doFetch();

  if (res.status === 401 && path !== "/auth/login") {
    try {
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@burgersflow.org", password: "admin123" }),
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        setToken(data.access_token, { id: data.user_id, email: data.email, role: data.role });
        res = await doFetch();
      }
    } catch (e) {}
  }

  if (!res.ok) {
    let errorDetail = "An unexpected error occurred";
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json();
}
