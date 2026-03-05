import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoltTrack — Electricity Bill Manager",
  description: "Track meter readings, set per-unit rates, generate tenant bills, and manage payments.",
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
