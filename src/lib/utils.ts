import fetch from "cross-fetch";
import { USDC_MINT } from "./contants";
import {
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

interface TokenDetails {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags: string[];
  daily_volume: number | null;
  created_at: string;
  freeze_authority: string | null;
  mint_authority: string | null;
  permanent_delegate: string | null;
  minted_at: string;
  extensions: Record<string, unknown>;
}

export const getTokenDetails = async (
  mintAddress: string
): Promise<TokenDetails | null> => {
  const resp = await fetch(`https://tokens.jup.ag/token/${mintAddress}`);
  if (!resp.ok) {
    return null;
  }
  const data: TokenDetails = await resp.json();
  return data;
};

export const getTokenPriceInUSDC = async (
  mintAddress: string
): Promise<{ inAmount: number; quoteResponse: any } | null> => {
  const resp = await getExactOutQuote(1000000, mintAddress);
  if (resp.error) {
    return null;
  }

  const inAmount = resp.quoteResponse.inAmount;
  if (!inAmount) {
    return null;
  }

  return { inAmount, quoteResponse: resp.quoteResponse };
};

export async function getExactOutQuote(
  outAmountAtomic: number,
  mintAddress: string,
  jupiterApiKey?: string
): Promise<{
  inAmountLamports: number;
  quoteResponse: any;
  error?: string;
}> {
  try {
    const apiKey = jupiterApiKey || process.env.JUPITER_API_KEY;
    const url = new URL("https://api.jup.ag/swap/v1/quote");
    url.searchParams.set("inputMint", mintAddress);
    url.searchParams.set("outputMint", USDC_MINT.toBase58());
    url.searchParams.set("amount", outAmountAtomic.toString());
    url.searchParams.set("swapMode", "ExactOut");
    url.searchParams.set("slippageBps", "50");

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
    });
    if (!resp.ok) {
      if (resp.status === 403) {
        console.error(
          "Access forbidden (403). Check Jupiter API key or free plan usage."
        );
        return {
          inAmountLamports: 0,
          quoteResponse: null,
          error:
            "Access forbidden (403). Check Jupiter API key or free plan usage.",
        };
      }
      return {
        inAmountLamports: 0,
        quoteResponse: null,
        error: `Failed to fetch quote. Status code: ${resp.status}`,
      };
    }

    const data = await resp.json();
    if (data.error) {
      console.error("Error in quote data:", data.error);
      return {
        inAmountLamports: 0,
        quoteResponse: null,
        error: data.error,
      };
    }

    const inLamports = Number(data.inAmount || 0);
    return {
      inAmountLamports: inLamports,
      quoteResponse: data,
    };
  } catch (err: any) {
    console.error("Error getting exact out quote:", err);
    return {
      inAmountLamports: 0,
      quoteResponse: null,
      error: err?.message ?? "Unknown error",
    };
  }
}

export async function buildSwapTransaction({
  quoteResponse,
  userPublicKey,
  destinationAccount,
  jupiterApiKey,
}: {
  quoteResponse: any;
  userPublicKey: PublicKey;
  destinationAccount: string;
  jupiterApiKey?: string;
}): Promise<VersionedTransaction> {
  const apiKey = jupiterApiKey || process.env.JUPITER_API_KEY;
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    new PublicKey(destinationAccount),
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  ).toBase58();
  const resp = await fetch("https://api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: userPublicKey.toBase58(),
      destinationTokenAccount,
      wrapAndUnwrapSol: true,
      dynamicSlippage: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1_000_000,
          priorityLevel: "high",
        },
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to build swap transaction. Status: ${resp.status}`);
  }

  const swapData = await resp.json();

  if (swapData.error) {
    throw new Error(swapData.error);
  }

  // Check for simulation errors returned by Jupiter
  if (swapData.simulationError) {
    throw new Error(
      `Simulation Error: ${JSON.stringify(swapData.simulationError)}`
    );
  }

  const { swapTransaction } = swapData;
  if (!swapTransaction) {
    throw new Error("No swapTransaction returned from Jupiter");
  }

  // Decode and deserialize the transaction
  const txBuffer = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuffer);

  return tx;
}

export async function buildUsdcTransferTransaction({
  senderPublicKey,
  recipientPublicKey,
  amount,
  recentBlockhash,
}: {
  senderPublicKey: PublicKey;
  recipientPublicKey: PublicKey;
  amount: number;
  recentBlockhash: string;
}): Promise<VersionedTransaction> {
  const senderTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    senderPublicKey,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const recipientTokenAccount = getAssociatedTokenAddressSync(
    USDC_MINT,
    recipientPublicKey,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const transferInstruction = createTransferInstruction(
    senderTokenAccount,
    recipientTokenAccount,
    senderPublicKey,
    amount
  );

  const messageV0 = new TransactionMessage({
    payerKey: senderPublicKey,
    recentBlockhash,
    instructions: [transferInstruction],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  return transaction;
}
