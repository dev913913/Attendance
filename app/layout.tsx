import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KMS Attendance",
  description: "Teacher-controlled attendance management for KMS College of IT and Management.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
