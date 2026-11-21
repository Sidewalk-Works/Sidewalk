/**
 * Consolidated auth tests for web.
 *
 * Covers:
 * - AuthProvider/useAuth session states and transitions (render tests)
 * - Auth/session model and route access contract helpers (logic tests)
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@sidewalk/shared";

vi.mock("../lib/apiClient", () => ({
  apiClient: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

import { apiClient } from "../lib/apiClient";
import { AuthProvider, useAuth } from "../lib/authContext";

const TOKEN_KEY = "sidewalk.authToken";

const mockUser = {
  id: "u-1",
  email: "user@example.com",
  createdAt: "2024-01-01T00:00:00.000Z",
};

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

function SessionDisplay() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div data-testid="loading">Loading...</div>;
  if (user) return <div data-testid="authenticated">Logged in as {user.email}</div>;
  return <div data-testid="unauthenticated">Not logged in</div>;
}

function LoginButton() {
  const { login } = useAuth();
  return (
    <button onClick={() => login("user@example.com", "password123")}>
      Log in
    </button>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={logout}>Log out</button>;
}

function AuthControls() {
  const { user, login, logout } = useAuth();
  if (user)
    return (
      <>
        <span data-testid="user-email">{user.email}</span>
        <button onClick={logout}>Log out</button>
      </>
    );
  return (
    <button onClick={() => login("user@example.com", "password123")}>
      Log in
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AuthProvider — no stored token", () => {
  it("resolves to unauthenticated and never calls getCurrentUser", async () => {
    renderWithAuth(<SessionDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId("unauthenticated")).toBeInTheDocument();
    });

    expect(apiClient.getCurrentUser).not.toHaveBeenCalled();
  });
});

describe("AuthProvider — valid stored token", () => {
  it("hydrates from localStorage and sets authenticated state", async () => {
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(mockUser);
    localStorage.setItem(TOKEN_KEY, "valid-token");

    renderWithAuth(<SessionDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toBeInTheDocument();
    });

    expect(screen.getByText("Logged in as user@example.com")).toBeInTheDocument();
    expect(apiClient.getCurrentUser).toHaveBeenCalledWith("valid-token");
  });
});

describe("AuthProvider — stale stored token", () => {
  it("clears the token and stays unauthenticated when getCurrentUser fails", async () => {
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error("401 Unauthorized"));
    localStorage.setItem(TOKEN_KEY, "stale-token");

    renderWithAuth(<SessionDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId("unauthenticated")).toBeInTheDocument();
    });

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("AuthProvider — login()", () => {
  it("sets user, stores token, and transitions to authenticated state", async () => {
    vi.mocked(apiClient.login).mockResolvedValue({ token: "new-token", user: mockUser });

    const user = userEvent.setup();
    renderWithAuth(
      <>
        <SessionDisplay />
        <LoginButton />
      </>,
    );

    await waitFor(() => screen.getByTestId("unauthenticated"));

    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toBeInTheDocument();
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
    expect(apiClient.login).toHaveBeenCalledWith("user@example.com", "password123");
  });
});

describe("AuthProvider — logout()", () => {
  it("clears user and token and transitions to unauthenticated state", async () => {
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(mockUser);
    localStorage.setItem(TOKEN_KEY, "active-token");

    const user = userEvent.setup();
    renderWithAuth(
      <>
        <SessionDisplay />
        <LogoutButton />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(screen.getByTestId("unauthenticated")).toBeInTheDocument();
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("AuthProvider — login then logout round-trip", () => {
  it("correctly cycles through authenticated and back to unauthenticated", async () => {
    vi.mocked(apiClient.login).mockResolvedValue({ token: "session-token", user: mockUser });

    const user = userEvent.setup();
    renderWithAuth(<AuthControls />);

    await waitFor(() => screen.getByRole("button", { name: "Log in" }));

    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => screen.getByTestId("user-email"));
    expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com");

    await user.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => screen.getByRole("button", { name: "Log in" }));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

interface WebSession {
  user: PublicUser | null;
  token: string | null;
}

type AuthRole = "user" | "staff" | "admin" | "moderator";

interface AuthenticatedSession extends WebSession {
  user: PublicUser;
  token: string;
  role: AuthRole;
}

const GUEST: WebSession = { user: null, token: null };

function makeSession(
  email = "user@example.com",
  role: AuthRole = "user",
): AuthenticatedSession {
  return {
    user: { id: "test-user-id", email, createdAt: new Date(0).toISOString() },
    token: "test-token",
    role,
  };
}

function isAuthenticated(session: WebSession): boolean {
  return session.user !== null && session.token !== null;
}

const PROTECTED_PATHS = ["/dashboard", "/reports", "/profile", "/admin"];
const ADMIN_ONLY_PATHS = ["/admin"];
const STAFF_PATHS = ["/reports/manage", "/reports/review"];

function requiresAuth(path: string): boolean {
  return PROTECTED_PATHS.some((p) => path.startsWith(p));
}

function requiresAdmin(path: string): boolean {
  return ADMIN_ONLY_PATHS.some((p) => path.startsWith(p));
}

function requiresStaff(path: string): boolean {
  return STAFF_PATHS.some((p) => path.startsWith(p));
}

type AccessOutcome = "allow" | "redirect-login" | "redirect-home";

function resolveAccess(path: string, session: WebSession): AccessOutcome {
  if (!isAuthenticated(session)) {
    return requiresAuth(path) ? "redirect-login" : "allow";
  }
  const { role } = session as AuthenticatedSession;
  if (requiresAdmin(path) && role !== "admin") return "redirect-home";
  if (requiresStaff(path) && role !== "staff" && role !== "admin") return "redirect-home";
  return "allow";
}

function buildLoginRedirect(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

describe("web auth — session state detection", () => {
  it("null user + null token = unauthenticated", () => {
    expect(isAuthenticated(GUEST)).toBe(false);
  });

  it("user + token = authenticated", () => {
    expect(isAuthenticated(makeSession())).toBe(true);
  });

  it("token present but no user = unauthenticated (partial hydration)", () => {
    expect(isAuthenticated({ user: null, token: "orphaned-token" })).toBe(false);
  });

  it("user present but no token = unauthenticated (stale state)", () => {
    expect(isAuthenticated({ user: makeSession().user, token: null })).toBe(false);
  });
});

describe("web auth — path classification", () => {
  it("/ is public", () => expect(requiresAuth("/")).toBe(false));
  it("/login is public", () => expect(requiresAuth("/login")).toBe(false));
  it("/register is public", () => expect(requiresAuth("/register")).toBe(false));
  it("/dashboard requires auth", () => expect(requiresAuth("/dashboard")).toBe(true));
  it("/reports requires auth", () => expect(requiresAuth("/reports")).toBe(true));
  it("/profile requires auth", () => expect(requiresAuth("/profile")).toBe(true));
  it("/admin requires auth and is admin-only", () => {
    expect(requiresAuth("/admin")).toBe(true);
    expect(requiresAdmin("/admin")).toBe(true);
  });
  it("/reports/manage is staff-guarded", () => expect(requiresStaff("/reports/manage")).toBe(true));
});

describe("web auth — unauthenticated access", () => {
  it("public path passes through", () => {
    expect(resolveAccess("/", GUEST)).toBe("allow");
    expect(resolveAccess("/login", GUEST)).toBe("allow");
    expect(resolveAccess("/register", GUEST)).toBe("allow");
  });

  it("protected path redirects to login", () => {
    expect(resolveAccess("/dashboard", GUEST)).toBe("redirect-login");
    expect(resolveAccess("/reports", GUEST)).toBe("redirect-login");
    expect(resolveAccess("/admin", GUEST)).toBe("redirect-login");
  });

  it("login redirect URL encodes the original path", () => {
    const url = buildLoginRedirect("/reports/new");
    expect(url).toBe("/login?next=%2Freports%2Fnew");
  });
});

describe("web auth — authenticated access by role", () => {
  it("any authenticated user can access /dashboard", () => {
    expect(resolveAccess("/dashboard", makeSession("u@x.com", "user"))).toBe("allow");
    expect(resolveAccess("/dashboard", makeSession("u@x.com", "admin"))).toBe("allow");
  });

  it("regular user is blocked from admin routes", () => {
    expect(resolveAccess("/admin", makeSession("u@x.com", "user"))).toBe("redirect-home");
  });

  it("staff is blocked from admin routes", () => {
    expect(resolveAccess("/admin", makeSession("u@x.com", "staff"))).toBe("redirect-home");
  });

  it("admin can access admin routes", () => {
    expect(resolveAccess("/admin", makeSession("u@x.com", "admin"))).toBe("allow");
  });

  it("staff can access staff-guarded report management routes", () => {
    expect(resolveAccess("/reports/manage", makeSession("u@x.com", "staff"))).toBe("allow");
  });

  it("admin can access staff-guarded routes", () => {
    expect(resolveAccess("/reports/manage", makeSession("u@x.com", "admin"))).toBe("allow");
  });

  it("regular user is blocked from staff-guarded routes", () => {
    expect(resolveAccess("/reports/manage", makeSession("u@x.com", "user"))).toBe("redirect-home");
  });

  it("moderator is blocked from staff-guarded routes", () => {
    expect(resolveAccess("/reports/manage", makeSession("u@x.com", "moderator"))).toBe("redirect-home");
  });
});
