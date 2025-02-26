"use client";

import WalletConnect from "@/components/WalletConnect";
import PaymentPage from "@/components/PaymentPage";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <WalletConnect />
      <PaymentPage />
    </main>
  );
}
