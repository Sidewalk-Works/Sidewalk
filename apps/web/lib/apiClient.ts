import type { PublicUser } from "@sidewalk/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError((body as any).code ?? "UNKNOWN_ERROR", (body as any).message ?? "Something went wrong.");
  }

  return body as T;
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as any).code ?? "UNKNOWN_ERROR", (body as any).message ?? "Something went wrong.");
  }
  return body as T;
}

export const apiClient = {
  register(email: string, password: string): Promise<{ user: PublicUser }> {
    return authRequest<{ user: PublicUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string): Promise<{ user: PublicUser }> {
    return authRequest<{ user: PublicUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return authRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  getCurrentUser(): Promise<PublicUser> {
    return authRequest<PublicUser>("/api/auth/me");
  },
};
