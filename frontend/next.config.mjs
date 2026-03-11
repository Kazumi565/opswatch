/** @type {import('next').NextConfig} */
const defaultApiOrigin = process.env.NODE_ENV === "production" ? "http://api:8000" : "http://localhost:8000";
const opswatchApiOrigin = process.env.OPSWATCH_API_ORIGIN ?? defaultApiOrigin;

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${opswatchApiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
