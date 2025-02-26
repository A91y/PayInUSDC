"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  SolflareWalletAdapter,
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Connection } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

// Define RPC URLs
const PRIMARY_RPC_URL = process.env.NEXT_PUBLIC_HELIUS_RPC_URL!;
const SECONDARY_RPC_URL = process.env.NEXT_PUBLIC_SECONDARY_RPC_URL!;

export default function WalletProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallets = useMemo(
    () => [new SolflareWalletAdapter(), new PhantomWalletAdapter()],
    []
  );

  const [currentRpc, setCurrentRpc] = useState(PRIMARY_RPC_URL);
  const [rpcList] = useState([PRIMARY_RPC_URL, SECONDARY_RPC_URL]);

  useEffect(() => {
    const checkRpcAvailability = async () => {
      for (const rpc of rpcList) {
        try {
          const connection = new Connection(rpc, "confirmed");
          await connection.getSupply("confirmed");
          setCurrentRpc(rpc);
          console.log(`Connected to RPC: ${rpc}`);
          return;
        } catch (error) {
          console.error(`RPC ${rpc} is unavailable:`, error);
        }
      }
      console.error("All RPCs are unavailable.");
    };

    checkRpcAvailability();
  }, [rpcList]);

  return (
    <ConnectionProvider endpoint={currentRpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
