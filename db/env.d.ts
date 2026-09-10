declare namespace Cloudflare {
  interface Env {
    BOH_HOSTING_TARGET?: string;
    DB: D1Database;
    SUPABASE_URL: string;
    SUPABASE_SECRET_KEY: string;
    BOH_OWNER_EMAIL: string;
  }
}
