import { configureHostinger } from './hostinger-config.mjs';

try {
  configureHostinger(process.env);
  await import('./server.js');
} catch (error) {
  console.error('[BOH] Hostinger startup failed:', error.message);
  process.exitCode = 1;
}
