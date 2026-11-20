"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { AuthForm } from "../components/AuthForm";
import { Button } from "../components/Button";
import { useAuth } from "../lib/authContext";

function getSafeNext(nextParam: string | null): string {
  if (!nextParam) return "/";
  if (!nextParam.startsWith("/") || nextParam.startsWith("//")) return "/";
  return nextParam;
}

export default function LoginPage() {
  const { user, isLoading, login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => getSafeNext(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!isLoading && user && nextPath !== "/") {
      router.replace(nextPath);
    }
  }, [isLoading, user, nextPath, router]);

  if (isLoading) {
    return (
      <div className="card">
        {/* #864: role="status" + aria-live="polite" announces the loading
            state to screen readers; aria-busy signals the region is updating */}
        <p role="status" aria-live="polite" aria-busy="true">
          Loading...
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="card">
        <h1>Welcome back</h1>
        <p>Logged in as {user.email}</p>
        <Button type="button" onClick={logout}>
          Log out
        </Button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Log in</h1>
      <AuthForm
        mode="login"
        submitLabel="Log in"
        onSubmit={async (email, password) => {
          await login(email, password);
          if (nextPath !== "/") {
            router.push(nextPath);
          }
        }}
      />
      <p className="helper-text">
        Don&apos;t have an account? <Link href={nextPath === "/" ? "/register" : `/register?next=${encodeURIComponent(nextPath)}`}>Create one</Link>
      </p>
    </div>
  );
}
