"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthForm } from "../../components/AuthForm";
import { useAuth } from "../../lib/authContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const [success, setSuccess] = useState(false);

  if (success) {
    return (
      <div className="card">
        <h1>Account created</h1>
        <p>
          Your account has been created. <Link href="/">Log in</Link> to continue.
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
        Already have an account? <Link href="/">Log in</Link>
      </p>
    </div>
  );
}
