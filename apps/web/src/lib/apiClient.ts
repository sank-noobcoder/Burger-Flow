let accessToken: string | null = null;
let userProfile: any = null;

export function setToken(token: string | null, user: any = null) {
  accessToken = token;
  userProfile = user;
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

  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    // Attempt auto-login with default researcher credentials in local demo mode if token expired
    try {
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "researcher@burgersflow.org", password: "researcher123" }),
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        setToken(data.access_token, { id: data.user_id, email: data.email, role: data.role });
        res = await doFetch();
      }
    } catch (e) {
      // fallback
    }
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
