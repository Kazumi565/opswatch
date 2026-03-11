/** @type {import('next').NextConfig} */
const opswatchApiOrigin = process.env.OPSWATCH_API_ORIGIN ?? "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/opswatch-api/:path*",
        destination: `${opswatchApiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
