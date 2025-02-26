export interface Token {
  mint: string;
  symbol?: string;
  name?: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
  logoURI?: string;
  isEnhanced?: boolean;
}
