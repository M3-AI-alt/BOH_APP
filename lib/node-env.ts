// Server-only adapter, selected only by the Hostinger build. Read credentials
// at runtime: no build-time substitution or browser-public environment keys.
export const env = {
  BOH_HOSTING_TARGET: 'node',
  get SUPABASE_URL() {
    return Reflect.get(process.env, 'SUPABASE_URL');
  },
  get SUPABASE_SECRET_KEY() {
    return Reflect.get(process.env, 'SUPABASE_SECRET_KEY');
  },
};
