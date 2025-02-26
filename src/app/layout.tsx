import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import WalletProviderWrapper from "@/components/WalletProvider";

import "@solana/wallet-adapter-react-ui/styles.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pay In USDC by Ayushag",
  description: "Pay in any token, receiver receives in USDC on Solana",
  keywords: [
    "USDC",
    "Solana",
    "crypto payment",
    "token exchange",
    "Ayushag",
    "Ayush Agrawal",
    "A91y",
    "Jupiter",
  ],
  creator: "Ayush Agrawal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <WalletProviderWrapper>{children}</WalletProviderWrapper>
      </body>
    </html>
  );
}
