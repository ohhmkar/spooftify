import type { NextConfig } from "next";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:1312/api";

const nextConfig: NextConfig = {
  // the browser talks to /api on this origin, so the login cookie is first-party and needs no CORS
  rewrites: async () => [{ source: "/api/:path*", destination: `${API}/:path*` }],
};

export default nextConfig;
