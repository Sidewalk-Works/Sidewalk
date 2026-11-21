import { NextResponse } from "next/server";
import { getApiUrl, getSessionToken } from "../../../../lib/serverAuth";

export async function GET() {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${getApiUrl()}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
