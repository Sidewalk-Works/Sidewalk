"use client";

import Link from "next/link";

import { AuthForm } from "../components/AuthForm";
import { Button } from "../components/Button";
import { useAuth } from "../lib/authContext";

export default function LoginPage() {
  const { user, isLoading, login, logout } = useAuth();

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
      <AuthForm mode="login" submitLabel="Log in" onSubmit={login} />
      <p className="helper-text">
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
