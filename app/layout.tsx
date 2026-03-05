import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HX — Tenant Management System",
  description: "Manage tenants, generate monthly statements, track payments, and handle utility billing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
