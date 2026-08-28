import { loadEnv } from '../shared/config/env.js';

const base = {
  DATABASE_URL: 'file:./test.db',
  JWT_SECRET: 'test-secret-long-enough',
};

describe('CORS / loadEnv (#861)', () => {
  it('accepts a valid ALLOWED_ORIGIN URL in development', () => {
    expect(() =>
      loadEnv({ ...base, APP_ENV: 'development', ALLOWED_ORIGIN: 'http://localhost:3000' })
    ).not.toThrow();
  });

  it('accepts a valid production origin when explicitly set', () => {
    expect(() =>
      loadEnv({ ...base, APP_ENV: 'production', ALLOWED_ORIGIN: 'https://app.sidewalk.works' })
    ).not.toThrow();
  });

  it('throws in production when ALLOWED_ORIGIN is the localhost default', () => {
    expect(() =>
      loadEnv({ ...base, APP_ENV: 'production', ALLOWED_ORIGIN: 'http://localhost:3000' })
    ).toThrow('ALLOWED_ORIGIN');
  });

  it('throws when ALLOWED_ORIGIN is not a valid URL', () => {
    expect(() =>
      loadEnv({ ...base, ALLOWED_ORIGIN: 'not-a-url' })
    ).toThrow();
  });
});
