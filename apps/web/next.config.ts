import type { NextConfig } from 'next';

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333').replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/api/:path*`,
      },
      {
        source: '/health/:path*',
        destination: `${apiInternalUrl}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;
