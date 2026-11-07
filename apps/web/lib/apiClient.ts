import type { LoginResponse, PublicUser, RegisterResponse } from "@sidewalk/shared";

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
      ...options.headers
    }
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body.code ?? "UNKNOWN_ERROR", body.message ?? "Something went wrong.");
  }

  return body as T;
}

export const apiClient = {
  register(email: string, password: string): Promise<RegisterResponse> {
    return request<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  getCurrentUser(token: string): Promise<PublicUser> {
    return request<PublicUser>("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
};
