export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

/** JWT claims issued by the current API. */
export interface AuthClaims {
  sub: string;
  exp: number;
  iat?: number;
}

/** Extended claims shape for clients that decode additional token data. Not issued by the current API. */
export interface ScopedTokenClaims extends AuthClaims {
  email?: string;
  role?: string;
  scope?: string[];
}

/** Resolved caller identity after server-side auth resolution. */
export interface ApiIdentity {
  id: string;
  email?: string;
  role?: string;
  scopes?: string[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export type RegisterResponse = PublicUser;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export interface AuthErrorResponse {
  code: string;
  message: string;
}
