# Hostinger deployment — preparation, not a completed migration

BOH supports two separate build targets. The existing Sites/Cloudflare build
remains the default. Hostinger must use the Node server target, not static Vite,
WordPress, or an upload of the Cloudflare worker bundle.

## Managed Node settings

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/M3-AI-alt/BOH_APP` |
| Framework | Other / Node.js server (not static) |
| Node version | 24 (22.13+ also satisfies the package minimum) |
| Project root | Repository root |
| Install | `npm ci` including build/dev dependencies |
| Build command | `npm run build:hostinger` |
| Start command | `npm run start:hostinger` |
| Entry file, if asked | `dist/standalone/hostinger-server.mjs` |
| Build script key, if asked instead of command | `build:hostinger` |
| Output directory | `dist/standalone` |

The build packages the startup and configuration modules inside `dist/standalone`
so the output is self-contained. The entry configures the trusted public host
before importing Vinext. Both entry file and output directory are relative to
the app root, not relative to each other. Do not select Vinext's bare `server.js`
as the entry: it bypasses BOH's startup configuration.

## Private runtime settings

- `BOH_APP_ORIGIN=https://benoxfordhub.online` (use the exact temporary HTTPS
  origin instead when staging).
- `SUPABASE_URL`: the **existing** BOH Supabase project's URL.
- `SUPABASE_SECRET_KEY`: the existing server-only secret, entered privately in
  hPanel. Never use a `NEXT_PUBLIC_` or `VITE_` prefix. Never commit it, paste it
  into chat, or include it in an upload archive.
- Hostinger supplies `PORT`; bind address is `0.0.0.0`.

The startup script forces production mode and an exact trusted forwarded host.
Hostinger must terminate HTTPS and overwrite proxy headers correctly. Preserve
the application's cross-origin checks and secure cookies. Staff sign in again
on the new hostname; their accounts, passwords and records stay in Supabase.
Use one canonical hostname, initially the apex domain; do not assume `www` is
configured or shares its session cookie.

Hostinger authentication retains the existing 10-attempt per-account limit and
uses a conservative shared 60-attempt limit per action/window. No client-provided
IP header is trusted. Only enable individual-IP limits after verifying the
Hostinger ingress header contract; no change to account/session authority.

## Before switching traffic

1. Run `npm test`, `npm run typecheck`, `npm run build:hostinger`.
2. Verify the actual HTTPS deployment: login screen in both languages, logo and
   scripts load, same-origin form validation works, foreign-origin requests fail.
3. Verify real staff sign-in, password setup if required, logout, Director and
   Finance access, and TA restrictions. Use approved test records for write
   checks; never modify actual student balances as a smoke test.
4. Confirm existing records load from the original Supabase database; do not
   reimport sheets, reset accounts, run seed scripts, or create a new database.
5. Follow the exact DNS values supplied by hPanel and verify HTTPS. Preserve
   email/DNS records unrelated to the website. Keep the old app available until
   the new address passes these checks.

Do not upload `.env*`, `.dev.vars*`, `db/import.json`, spreadsheets, passwords,
local database files, `private-data`, or a whole workspace archive. A Git-based
deployment uses the sanitized tracked source. The two builds share the ignored
`dist` directory locally; run the matching build before starting either target.

Default Sites commands remain `npm run build` / `npm start`. This document and
the Node build do not by themselves connect a domain or deploy to Hostinger.
