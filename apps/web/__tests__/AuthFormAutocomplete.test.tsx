import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthForm } from "../components/AuthForm";
import React from "react";
import { AuthProvider } from "../lib/authContext";

describe("AuthForm Autocomplete", () => {
  it("has proper autocomplete attributes", () => {
    render(
      <AuthProvider>
        <AuthForm mode="login" submitLabel="Log in" onSubmit={async () => {}} />
      </AuthProvider>
    );
    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    expect(emailInput.getAttribute("autoComplete")).toBe("email");
    expect(passwordInput.getAttribute("autoComplete")).toBe("current-password");
  });
});
