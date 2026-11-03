import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sales Hub", template: "%s · Sales Hub" },
  description: "Sales Management System cho doanh nghiệp B2B SaaS kết hợp dịch vụ triển khai, tích hợp AI Agent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Tiện ích trình duyệt có thể tự thêm class vào <html> (ví dụ mdl-js); bỏ cảnh báo lệch hiển thị riêng thẻ này.
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}
