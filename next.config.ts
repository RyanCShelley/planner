import type { NextConfig } from "next";

// In development the FastAPI app runs on :8000 (npm run api).
// On Vercel, /api/* is served by the Python function in api/index.py (see vercel.json).
const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};

export default nextConfig;
