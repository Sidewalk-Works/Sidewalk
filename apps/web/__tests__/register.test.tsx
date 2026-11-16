import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}));

import RegisterPage from "../app/register/page";
import { AuthProvider } from "../lib/authContext";

describe("RegisterPage", () => {
  it("renders the create account form", async () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("shows validation errors for a short password", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });
});
