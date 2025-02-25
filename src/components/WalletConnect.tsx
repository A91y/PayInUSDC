"use client";

import dynamic from "next/dynamic";

const WalletMultiButtonDynamic = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function WalletConnect() {
  return (
    <div className="mb-6 border hover:border-slate-900 rounded">
      <WalletMultiButtonDynamic />
    </div>
  );
}
