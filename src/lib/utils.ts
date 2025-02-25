import fetch from "cross-fetch";

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
