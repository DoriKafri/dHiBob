import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/app/providers";

const inter = localFont({
  src: '../fonts/Inter-Variable.woff2',
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = { title: "Dpeople | HR Platform", description: "Comprehensive HR management platform" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className={`${inter.className} antialiased`}><Providers>{children}</Providers></body></html>);
}
