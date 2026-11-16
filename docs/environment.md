# Environment Setup

Each app has its own `.env.example` file. Copy it to `.env` (or `.env.local`
for the web app) before running the app locally.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## API (`apps/api`)

| Variable          | Description                                                   | Default                  |
| ------------------ | -------------------------------------------------------------- | -------------------------- |
| `PORT`             | Port the Express server listens on.                          | `4000`                   |
| `APP_ENV`          | `development`, `test`, or `production`.                       | `development`            |
| `DATABASE_URL`     | Prisma datasource URL. SQLite by default for local dev.       | `file:./dev.db`          |
| `JWT_SECRET`       | Secret used to sign access tokens. **Must be changed in production.** | `replace-me-with-a-long-random-string` |
| `JWT_EXPIRES_IN`   | Access token lifetime (e.g. `1h`, `15m`).                     | `1h`                     |
| `ALLOWED_ORIGIN`   | Origin allowed by CORS (the web app's URL).                   | `http://localhost:3000`  |

A non-secret `.env.test` is committed and used automatically by `pnpm test`,
`pnpm typecheck`, and `pnpm build` to configure Prisma for local SQLite usage.

## Web (`apps/web`)

| Variable               | Description                  | Default                 |
| ----------------------- | ------------------------------- | -------------------------- |
| `NEXT_PUBLIC_API_URL`  | Base URL of the API.          | `http://localhost:4000` |

## Mobile (`apps/mobile`)

| Variable               | Description                  | Default                 |
| ----------------------- | ------------------------------- | -------------------------- |
| `EXPO_PUBLIC_API_URL`  | Base URL of the API.          | `http://localhost:4000` |

## Secrets Handling

- Never commit `.env` files — only `.env.example` (and the non-secret
  `apps/api/.env.test`) are tracked in git.
- `JWT_SECRET` must be a long, random value in any deployed environment.
- Production deployments should use a managed Postgres (or other relational)
  database instead of the default SQLite file by updating `DATABASE_URL` and
  the Prisma datasource provider.
