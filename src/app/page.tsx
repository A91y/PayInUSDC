"use client";

import WalletConnect from "@/components/WalletConnect";
import TokenList from "@/components/TokenList";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <WalletConnect />
      <TokenList />
    </main>
  );
}
