import { resolve } from "node:path";
import type { NextConfig } from "next";

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://localhost:4000").replace(
  /\/+$/,
  ""
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
