import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ctx — Context Layer",
  description: "Unix-native context layer for AI-augmented teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ctx-bg">
        {children}
      </body>
    </html>
  );
}
