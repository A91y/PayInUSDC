import fetch from "cross-fetch";
import { USDC_MINT } from "./contants";

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
): Promise<number | null> => {
  const resp = await getExactOutQuote(1000000, mintAddress);
  if (resp.error) {
    return null;
  }

  const inAmount = resp.quoteResponse.inAmount;
  if (!inAmount) {
    return null;
  }

  return inAmount;
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

export const transferToken = async (
  from: any,
  to: any,
  amount: any,
  mintAddress: any
  // wallet: any
): Promise<string> => {
  return "";
};
