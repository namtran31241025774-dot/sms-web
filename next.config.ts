import type { NextConfig } from "next";

// SMS là ứng dụng nội bộ, dữ liệu thay đổi theo từng phiên đăng nhập,
// nên dùng mô hình render động truyền thống (không bật Cache Components).
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
