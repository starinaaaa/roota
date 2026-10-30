import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      ...["/email/:path*", "/review/:path*", "/cart/restore/:path*", "/draft/:path*", "/selection/:path*"].map(
        (source) => ({
          source,
          headers: [
            { key: "Referrer-Policy", value: "no-referrer" },
            { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
            { key: "Cache-Control", value: "private, no-store" },
          ],
        }),
      ),
      {
        source: "/optimized/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/order/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  experimental: { serverActions: { bodySizeLimit: "17mb" } },
  images: {
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",

    deviceSizes: [360, 480, 640, 750, 828, 1080, 1200, 1440, 1920, 2048],
  },
};

export default nextConfig;
