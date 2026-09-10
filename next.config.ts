import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.BOH_HOSTING_TARGET === 'node' ? { output: 'standalone' } : {};

export default nextConfig;
