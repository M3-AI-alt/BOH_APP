declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SUPABASE_URL: string;
    SUPABASE_SECRET_KEY: string;
    BOH_OWNER_EMAIL: string;
  }
}
