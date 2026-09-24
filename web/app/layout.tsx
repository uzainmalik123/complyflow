import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const plexSans = localFont({
  src: [{ path: "../fonts/plex-sans-400-600.woff2", weight: "400 600" }],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/plex-mono-400.woff2", weight: "400" },
    { path: "../fonts/plex-mono-500.woff2", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ComplyFlow",
  description: "Invoice compliance ledger",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}