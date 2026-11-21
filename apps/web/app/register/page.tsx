"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthForm } from "../../components/AuthForm";
import { useAuth } from "../../lib/authContext";

function getSafeNext(nextParam: string | null): string {
  if (!nextParam) return "/";
  if (!nextParam.startsWith("/") || nextParam.startsWith("//")) return "/";
  return nextParam;
}

export default function RegisterPage() {
  const { register, user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [success, setSuccess] = useState(false);

  const nextPath = useMemo(() => getSafeNext(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath);
    }
  }, [isLoading, user, router, nextPath]);

  if (isLoading) {
    return (
      <div className="card">
        <p role="status" aria-live="polite" aria-busy="true">
          Loading...
        </p>
      </div>
    );
  }

  if (user) {
    return null;
  }

  if (success) {
    return (
      <div className="card">
        <h1>Account created</h1>
        <p>
          Your account has been created. <Link href={nextPath === "/" ? "/" : `/?next=${encodeURIComponent(nextPath)}`}>Log in</Link> to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Create account</h1>
      <AuthForm
        mode="register"
        submitLabel="Create account"
        onSubmit={async (email, password) => {
          await register(email, password);
          setSuccess(true);
        }}
      />
      <p className="helper-text">
        Already have an account? <Link href={nextPath === "/" ? "/" : `/?next=${encodeURIComponent(nextPath)}`}>Log in</Link>
      </p>
    </div>
  );
}
