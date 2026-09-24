/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "openai", "@azure/identity"],
  },
};

export default nextConfig;