import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Star-crossed Words",
  description: "A portrait-first asynchronous crossword clueing prototype.",
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
