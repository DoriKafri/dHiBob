/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-DNS-Prefetch-Control', value: 'on' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
  serverExternalPackages: ['pdfjs-dist'],
  webpack: (config, { isServer }) => {
    // pdfjs-dist uses canvas for node.js rendering — not needed in browser
    config.resolve.alias.canvas = false;
    // Don't bundle pdfjs-dist worker on server
    if (isServer) {
      config.externals.push('pdfjs-dist');
    }
    return config;
  },
}
module.exports = nextConfig
