export function configureHostinger(environment) {
  let origin;
  try {
    origin = new URL(environment.BOH_APP_ORIGIN);
  } catch {
    throw new Error('Set BOH_APP_ORIGIN to this deployment’s HTTPS address.');
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username || origin.password || origin.port ||
    origin.pathname !== '/' || origin.search || origin.hash ||
    !/^[a-z0-9.-]+$/.test(origin.hostname)
  ) {
    throw new Error('BOH_APP_ORIGIN must be one HTTPS origin without a path or port.');
  }
  if (!environment.SUPABASE_URL || !environment.SUPABASE_SECRET_KEY) {
    throw new Error('Configure the existing Supabase connection in Hostinger’s private environment settings.');
  }
  environment.NODE_ENV = 'production';
  environment.HOST = '0.0.0.0';
  // Vinext reads these when its modules load. Trust only the deployment’s
  // configured host, not arbitrary X-Forwarded-Host values or wildcard hosts.
  environment.VINEXT_TRUSTED_HOSTS = origin.host;
  delete environment.VINEXT_TRUST_PROXY;
}
