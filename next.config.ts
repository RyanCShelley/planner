import type { NextConfig } from "next";

// On Vercel, /api/* is served by the Python function in api/index.py (see vercel.json).
// Locally and in tests the FastAPI app runs separately (npm run api) and is proxied here.
const apiUrl = process.env.API_URL ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : null);

const nextConfig: NextConfig = {
  async rewrites() {
    return apiUrl ? [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
