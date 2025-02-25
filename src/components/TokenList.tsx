"use client";

import { useEffect, useState, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getTokenDetails } from "@/lib/utils";

// Token interface
interface Token {
  mint: string;
  symbol?: string;
  name?: string;
  amount: number;
  decimals: number;
  uiAmountString: string;
  logoURI?: string;
  isEnhanced?: boolean;
}

export default function TokenList() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const latestFetchId = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    if (connected && publicKey) {
      fetchTokens(publicKey);
    } else {
      setTokens([]);
      setSelectedToken(null);
    }
  }, [connected, publicKey, connection]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchTokens = async (publicKey: PublicKey) => {
    try {
      setLoading(true);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokenData = tokenAccounts.value.map((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        const tokenAmount = parsedInfo.tokenAmount;

        return {
          mint: parsedInfo.mint,
          amount: tokenAmount.uiAmount,
          decimals: tokenAmount.decimals,
          uiAmountString: tokenAmount.uiAmountString,
          symbol: parsedInfo.mint.slice(0, 4).toUpperCase(),
          name: `Token ${parsedInfo.mint.slice(0, 8)}`,
          logoURI: "",
          isEnhanced: false,
        };
      });

      const nonZeroTokens = tokenData.filter((token) => token.amount > 0);
      console.log("Base Tokens:", nonZeroTokens);

      setTokens(nonZeroTokens);

      if (nonZeroTokens.length > 0) {
        setSelectedToken(nonZeroTokens[0]);
      }

      const fetchId = Date.now();
      latestFetchId.current = fetchId;
      setIsEnhancing(true);
      enhanceTokensInBackground(nonZeroTokens, fetchId);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    } finally {
      setLoading(false);
    }
  };

  const enhanceTokensInBackground = async (
    baseTokens: Token[],
    fetchId: number
  ) => {
    const enhancementPromises = baseTokens.map(async (token) => {
      try {
        const details = await getTokenDetails(token.mint);
        if (details) {
          return {
            ...token,
            symbol: details.symbol || token.symbol,
            name: details.name || token.name,
            logoURI: details.logoURI || token.logoURI,
            isEnhanced: true,
          };
        }
        return token;
      } catch (error) {
        console.error(`Error enhancing token ${token.mint}:`, error);
        return token;
      }
    });

    const enhancedTokens = await Promise.all(enhancementPromises);
    if (isMounted.current && fetchId === latestFetchId.current) {
      setTokens(enhancedTokens);
      setSelectedToken((prev) => {
        if (prev) {
          const updatedToken = enhancedTokens.find((t) => t.mint === prev.mint);
          return updatedToken || prev;
        }
        return prev;
      });
      setIsEnhancing(false);
    }
  };
  return (
    <div className="w-full max-w-md">
      <h2 className="text-xl font-semibold mb-4">Your Tokens</h2>

      {loading ? (
        <div className="text-center p-4">Loading tokens...</div>
      ) : tokens.length > 0 ? (
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex justify-between items-center w-full px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
          >
            <div className="flex items-center">
              {selectedToken && (
                <>
                  {selectedToken.logoURI ? (
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.symbol}
                      className="w-6 h-6 rounded-full mr-2"
                    />
                  ) : (
                    <div className="w-6 h-6 bg-gray-200 rounded-full mr-2 flex items-center justify-center">
                      {selectedToken.symbol?.[0]}
                    </div>
                  )}
                  <span>{selectedToken.symbol}</span>
                </>
              )}
            </div>
            <div className="flex items-center">
              {isEnhancing && (
                <div className="w-4 h-4 mr-2 rounded-full border-2 border-t-transparent border-blue-500 animate-spin"></div>
              )}
              <svg
                className={`w-5 h-5 transition-transform ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </div>
          </button>

          {isDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto">
              {tokens.map((token, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => {
                    setSelectedToken(token);
                    setIsDropdownOpen(false);
                  }}
                >
                  <div className="flex items-center">
                    {token.logoURI ? (
                      <img
                        src={token.logoURI}
                        alt={token.symbol}
                        className="w-6 h-6 rounded-full mr-2"
                      />
                    ) : (
                      <div className="w-6 h-6 bg-gray-200 rounded-full mr-2 flex items-center justify-center">
                        {token.symbol?.[0]}
                      </div>
                    )}
                    <span>{token.symbol}</span>
                  </div>
                  <span>{token.uiAmountString}</span>
                </div>
              ))}
            </div>
          )}

          {selectedToken && (
            <div className="mt-4 p-4 border border-gray-300 rounded bg-white shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  {selectedToken.logoURI ? (
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.name}
                      className="w-8 h-8 rounded-full mr-2"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 rounded-full mr-2 flex items-center justify-center">
                      {selectedToken.symbol?.[0]}
                    </div>
                  )}
                  <span className="font-medium">{selectedToken.name}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {selectedToken.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Balance:</span>
                <span className="font-bold">
                  {selectedToken.uiAmountString}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Token Address:</span>
                  <span className="font-mono text-xs truncate max-w-xs">
                    {selectedToken.mint}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center p-4 border border-gray-300 rounded">
          No tokens found in this wallet
        </div>
      )}
    </div>
  );
}
