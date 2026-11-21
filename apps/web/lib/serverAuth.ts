import { cookies } from "next/headers";
import type { PublicUser } from "@sidewalk/shared";

export const SESSION_COOKIE = "sidewalk_session";
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getApiUrl() {
  return API_URL;
}

export async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function getServerUser(): Promise<PublicUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicUser;
  } catch {
    return null;
  }
}
