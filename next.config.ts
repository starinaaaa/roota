import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https" as const,
    hostname: "*.supabase.co",
  },
  ...(supabaseHostname
    ? [
        {
          protocol: "https" as const,
          hostname: supabaseHostname,
          pathname: "/storage/v1/object/public/**",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
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
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  images: {
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
    remotePatterns,
    deviceSizes: [360, 480, 640, 750, 828, 1080, 1200, 1440, 1920, 2048],
  },
};

export default nextConfig;
