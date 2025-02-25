"use client";

import { useEffect, useState, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getTokenDetails,
  getTokenPriceInUSDC,
  transferToken,
} from "@/lib/utils";

interface Token {
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

export default function PaymentPage() {
  const { publicKey, wallet } = useWallet();
  const { connection } = useConnection();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [usdcAmount, setUsdcAmount] = useState<number>(0);
  const [equivalentTokenAmount, setEquivalentTokenAmount] = useState<number>(0);
  const [receiverAddress, setReceiverAddress] = useState<string>("");
  const [canSend, setCanSend] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [hasFetchedPrice, setHasFetchedPrice] = useState(false);
  const latestFetchId = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    if (wallet?.adapter?.connected && publicKey) {
      fetchTokens(publicKey);
    } else {
      setTokens([]);
      setSelectedToken(null);
    }
  }, [wallet?.adapter?.connected, publicKey, connection]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPrice(null);
    setEquivalentTokenAmount(0);
    setCanSend(false);
    setHasFetchedPrice(false);
  }, [selectedToken]);

  useEffect(() => {
    if (selectedToken && currentPrice && usdcAmount > 0) {
      const equivalent = usdcAmount * currentPrice;
      setEquivalentTokenAmount(equivalent);
      const decimals = selectedToken.decimals;
      const multiplier = 10 ** decimals;
      const requiredAmount = BigInt(Math.floor(equivalent * multiplier));
      const userBalance = BigInt(selectedToken.amount);
      setCanSend(userBalance >= requiredAmount);
    } else {
      setEquivalentTokenAmount(0);
      setCanSend(false);
    }
  }, [selectedToken, currentPrice, usdcAmount]);

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
          amount: tokenAmount.amount,
          decimals: tokenAmount.decimals,
          uiAmount: tokenAmount.uiAmount,
          uiAmountString: tokenAmount.uiAmountString,
          symbol: parsedInfo.mint.slice(0, 4).toUpperCase(),
          name: `Token ${parsedInfo.mint.slice(0, 8)}`,
          logoURI: "",
          isEnhanced: false,
        };
      });
      const nonZeroTokens = tokenData.filter(
        (token) => parseFloat(token.uiAmountString) > 0
      );
      setTokens(nonZeroTokens);
      if (nonZeroTokens.length > 0) {
        setSelectedToken(nonZeroTokens[0]);
      }
      const fetchId = Date.now();
      latestFetchId.current = fetchId;
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
            decimals: details.decimals || token.decimals,
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
    }
  };

  const fetchPrice = async () => {
    if (!selectedToken) return;
    setIsFetchingPrice(true);
    try {
      const price = await getTokenPriceInUSDC(selectedToken.mint);
      setCurrentPrice(price);
      setHasFetchedPrice(true);
    } catch (error) {
      console.error("Error fetching token price:", error);
      setCurrentPrice(null);
      setHasFetchedPrice(true);
      alert("Failed to fetch token price. Please try again.");
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSend = async () => {
    if (!selectedToken || !receiverAddress || equivalentTokenAmount <= 0)
      return;
    try {
      setIsTransferring(true);
      const decimals = selectedToken.decimals;
      const multiplier = 10 ** decimals;
      const amountToTransfer = BigInt(
        Math.floor(equivalentTokenAmount * multiplier)
      );
      await transferToken(
        wallet,
        selectedToken.mint,
        amountToTransfer.toString(),
        receiverAddress
      );
      alert("Transfer successful!");
      if (publicKey) fetchTokens(publicKey);
    } catch (error) {
      console.error("Error transferring token:", error);
      alert("Transfer failed. Please try again.");
    } finally {
      setIsTransferring(false);
    }
  };

  const isValidAddress = (address: string) => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="w-full max-w-md">
      <h2 className="text-xl font-semibold mb-4">Payment Page</h2>
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
          <div className="mt-4">
            <label
              htmlFor="usdcAmount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount in USDC
            </label>
            <input
              type="number"
              id="usdcAmount"
              value={usdcAmount}
              onChange={(e) => setUsdcAmount(parseFloat(e.target.value) || 0)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              min="0"
            />
          </div>
          {/* Fetch Price Button */}
          <div className="mt-4">
            <button
              onClick={fetchPrice}
              className="px-3 py-1 text-sm font-medium bg-blue-500 text-white rounded-full shadow hover:bg-blue-600 transition-all disabled:bg-gray-300"
              disabled={isFetchingPrice || !selectedToken}
            >
              {isFetchingPrice ? "Fetching..." : "Fetch Price"}
            </button>
          </div>
          {/* Equivalent Display */}
          <div className="mt-4">
            {currentPrice !== null ? (
              <p className="text-sm text-gray-500">
                Equivalent in {selectedToken?.symbol}:{" "}
                {(
                  equivalentTokenAmount /
                  10 ** (selectedToken?.decimals || 2)
                ).toFixed(selectedToken?.decimals || 2)}
              </p>
            ) : isFetchingPrice ? (
              <p className="text-sm text-gray-500">Fetching price...</p>
            ) : hasFetchedPrice ? (
              <div className="flex items-center p-3 bg-red-100 border border-red-300 rounded-md">
                <svg
                  className="w-5 h-5 text-red-500 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
                <p className="text-sm text-red-700">
                  Trade route not available
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Click 'Fetch Price' to calculate equivalent
              </p>
            )}
          </div>
          <div className="mt-4">
            <label
              htmlFor="receiverAddress"
              className="block text-sm font-medium text-gray-700"
            >
              Receiver's Wallet Address
            </label>
            <input
              type="text"
              id="receiverAddress"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div className="mt-4">
            <button
              onClick={handleSend}
              disabled={
                !canSend ||
                !receiverAddress ||
                !isValidAddress(receiverAddress) ||
                isTransferring
              }
              className={`w-full px-4 py-2 font-medium text-white rounded-md ${
                canSend &&
                receiverAddress &&
                isValidAddress(receiverAddress) &&
                !isTransferring
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {isTransferring ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center p-4 border border-gray-300 rounded">
          No tokens found in this wallet
        </div>
      )}
    </div>
  );
}
