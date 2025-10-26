/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co", // or your exact project host
      },
    ],
  },
};

module.exports = nextConfig;