/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const fastapiBackend = process.env.FASTAPI_BACKEND_URL || "http://127.0.0.1:8000"
    return [
      {
        source: "/api/v1/:path*",
        destination: `${fastapiBackend}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
