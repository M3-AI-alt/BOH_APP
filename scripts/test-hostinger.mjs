import assert from 'node:assert/strict';
import test from 'node:test';
import { configureHostinger } from './hostinger-config.mjs';

const fixture = () => ({
  BOH_APP_ORIGIN: 'https://benoxfordhub.online',
  SUPABASE_URL: 'https://example.test',
  SUPABASE_SECRET_KEY: 'synthetic-test-key',
});

test('Hostinger startup uses production cookies and one exact trusted host', () => {
  const environment = { ...fixture(), NODE_ENV: 'development', VINEXT_TRUST_PROXY: '1', VINEXT_TRUSTED_HOSTS: '*' };
  configureHostinger(environment);
  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.HOST, '0.0.0.0');
  assert.equal(environment.VINEXT_TRUSTED_HOSTS, 'benoxfordhub.online');
  assert.equal(environment.VINEXT_TRUST_PROXY, undefined);
  assert.equal(environment.SUPABASE_SECRET_KEY, 'synthetic-test-key');
});

test('Hostinger startup fails closed without HTTPS origin or private connection', () => {
  for (const origin of ['', 'http://benoxfordhub.online', 'https://name:password@benoxfordhub.online', 'https://benoxfordhub.online/path', 'https://benoxfordhub.online?x=1', 'https://benoxfordhub.online#x', 'https://*.example.test', 'https://benoxfordhub.online:8080']) {
    assert.throws(() => configureHostinger({ ...fixture(), BOH_APP_ORIGIN: origin }));
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
    assert.throws(() => configureHostinger({ ...fixture(), [key]: '' }));
  }
});

test('an explicit staging host is supported without trusting other hosts', () => {
  const environment = { ...fixture(), BOH_APP_ORIGIN: 'https://preview.example.test/' };
  configureHostinger(environment);
  assert.equal(environment.VINEXT_TRUSTED_HOSTS, 'preview.example.test');
});
