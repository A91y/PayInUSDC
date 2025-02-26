"use client";

import { useEffect, useState, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  buildSwapTransaction,
  buildUsdcTransferTransaction,
  getExactOutQuote,
  getTokenDetails,
  getTokenPriceInUSDC,
} from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SOL_TOKEN, USDC_MINT } from "@/lib/contants";
import { Token } from "@/lib/types";

// Utility function for caching token details (unchanged)
const getCachedTokenDetails = async (mint: string) => {
  const cacheKey = `token_${mint}`;
  const cachedData = localStorage.getItem(cacheKey);
  if (cachedData) {
    try {
      return JSON.parse(cachedData);
    } catch (e) {
      console.error(`Error parsing cached data for ${mint}:`, e);
    }
  }
  try {
    const details = await getTokenDetails(mint);
    if (details) {
      localStorage.setItem(cacheKey, JSON.stringify(details));
    }
    return details;
  } catch (error) {
    console.error(`Error fetching token details for ${mint}:`, error);
    return null;
  }
};

const AnimatedNumber = ({
  value,
  decimals = 2,
}: {
  value: number;
  decimals?: number;
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number | undefined;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 500, 1);

      const currentValue = progress * value;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [value]);

  return <span>{displayValue.toFixed(decimals)}</span>;
};

const ParticleEffect = ({ active }: { active: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    interface Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      alpha: number;
    }

    let particles: Particle[] = [];
    let animationFrame: number;

    const createParticles = () => {
      particles = [];
      for (let i = 0; i < 50; i++) {
        particles.push({
          x: canvas.width / 2,
          y: canvas.height / 2,
          size: Math.random() * 5 + 1,
          speedX: (Math.random() - 0.5) * 8,
          speedY: (Math.random() - 0.5) * 8,
          color: `hsl(${Math.random() * 60 + 220}, 100%, 70%)`,
          alpha: 1,
        });
      }
    };

    const updateParticles = () => {
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      particles.forEach((particle, index) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        particle.alpha -= 0.01;
        particle.size -= 0.1;

        if (ctx) {
          ctx.save();
          ctx.globalAlpha = particle.alpha;
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (particle.size <= 0.2 || particle.alpha <= 0) {
          particles.splice(index, 1);
        }
      });

      if (particles.length > 0) {
        animationFrame = requestAnimationFrame(updateParticles);
      }
    };

    const handleResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    createParticles();
    updateParticles();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
};

export default function PaymentPage() {
  const { publicKey, wallet, signTransaction } = useWallet();
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
  const [showParticles, setShowParticles] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);
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
    if (selectedToken) {
      if (selectedToken.mint === SOL_TOKEN.mint) {
        // For SOL: calculate equivalent based on price (SOL per USDC)
        if (currentPrice && usdcAmount > 0) {
          const equivalent = usdcAmount / currentPrice;
          setEquivalentTokenAmount(equivalent);
          const requiredAmount = BigInt(
            Math.ceil(equivalent * 10 ** selectedToken.decimals)
          );
          const userBalance = BigInt(selectedToken.amount);
          setCanSend(userBalance >= requiredAmount);
        } else {
          setEquivalentTokenAmount(0);
          setCanSend(false);
        }
      } else if (selectedToken.mint === USDC_MINT.toBase58()) {
        // For USDC: use amount directly
        setEquivalentTokenAmount(usdcAmount);
        const requiredAmount = BigInt(
          Math.floor(usdcAmount * 10 ** selectedToken.decimals)
        );
        const userBalance = BigInt(selectedToken.amount);
        setCanSend(usdcAmount > 0 && userBalance >= requiredAmount);
      } else if (currentPrice && usdcAmount > 0) {
        // For other tokens
        const decimals = selectedToken.decimals;
        const equivalent = (usdcAmount * currentPrice) / 10 ** decimals;
        setEquivalentTokenAmount(equivalent);
        const requiredAmount = BigInt(Math.floor(equivalent * 10 ** decimals));
        const userBalance = BigInt(selectedToken.amount);
        setCanSend(userBalance >= requiredAmount);
      } else {
        setEquivalentTokenAmount(0);
        setCanSend(false);
      }
    }
  }, [selectedToken, currentPrice, usdcAmount]);

  useEffect(() => {
    if (selectedToken) {
      if (selectedToken.mint === USDC_MINT.toBase58()) {
        // For USDC, use the entered amount directly
        setEquivalentTokenAmount(usdcAmount);
        const requiredAmount = BigInt(
          Math.floor(usdcAmount * 10 ** selectedToken.decimals)
        );
        const userBalance = BigInt(selectedToken.amount);
        setCanSend(usdcAmount > 0 && userBalance >= requiredAmount);
      } else if (currentPrice && usdcAmount > 0) {
        const decimals = selectedToken.decimals;
        const equivalent = (usdcAmount * currentPrice) / 10 ** decimals;
        setEquivalentTokenAmount(equivalent);
        const multiplier = 10 ** decimals;
        const requiredAmount = BigInt(Math.floor(equivalent * multiplier));
        const userBalance = BigInt(selectedToken.amount);
        setCanSend(userBalance >= requiredAmount);
      } else {
        setEquivalentTokenAmount(0);
        setCanSend(false);
      }
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

      // Fetch SOL balance
      const solBalance = await connection.getBalance(publicKey);
      const solToken: Token = {
        ...SOL_TOKEN,
        amount: solBalance.toString(),
        uiAmount: solBalance / 1e9,
        uiAmountString: (solBalance / 1e9).toFixed(9),
      };

      // Combine SOL and SPL tokens
      const allTokens = [solToken, ...nonZeroTokens];
      setTokens(allTokens);
      if (allTokens.length > 0) {
        setSelectedToken(allTokens[0]);
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

  // Enhance SPL tokens in background (skip SOL)
  const enhanceTokensInBackground = async (
    baseTokens: Token[],
    fetchId: number
  ) => {
    const enhancementPromises = baseTokens.map(async (token) => {
      const details = await getCachedTokenDetails(token.mint);
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
    });
    const enhancedTokens = await Promise.all(enhancementPromises);
    if (isMounted.current && fetchId === latestFetchId.current) {
      setTokens((prevTokens) => {
        const solToken = prevTokens.find((t) => t.mint === SOL_TOKEN.mint);
        const updatedSplTokens = enhancedTokens;
        return solToken ? [solToken, ...updatedSplTokens] : updatedSplTokens;
      });
      setSelectedToken((prev) => {
        if (prev && prev.mint !== SOL_TOKEN.mint) {
          const updatedToken = enhancedTokens.find((t) => t.mint === prev.mint);
          return updatedToken || prev;
        }
        return prev;
      });
    }
  };

  const fetchPrice = async () => {
    if (!selectedToken || selectedToken.mint === USDC_MINT.toBase58()) return;
    setIsFetchingPrice(true);
    try {
      const resp = await getTokenPriceInUSDC(selectedToken.mint);
      if (!resp) {
        setCurrentPrice(null);
        setHasFetchedPrice(true);
        return;
      }
      setCurrentPrice(resp?.inAmount);
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
    if (
      !selectedToken ||
      !receiverAddress ||
      equivalentTokenAmount <= 0 ||
      !publicKey ||
      !usdcAmount ||
      !signTransaction
    ) {
      alert("Please ensure all fields are filled and wallet is connected.");
      return;
    }

    setIsTransferring(true);
    setShowParticles(false);
    try {
      let transaction: VersionedTransaction;

      if (selectedToken.mint === USDC_MINT.toBase58()) {
        // Direct USDC transfer
        const amountAtomic = Math.floor(
          usdcAmount * 10 ** selectedToken.decimals
        );
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction = await buildUsdcTransferTransaction({
          senderPublicKey: publicKey,
          recipientPublicKey: new PublicKey(receiverAddress),
          amount: amountAtomic,
          recentBlockhash: latestBlockhash.blockhash,
        });
      } else {
        // Swap transaction for other tokens
        const outAmountAtomic = Number(usdcAmount) * 10 ** 6;

        const { error: quoteError, quoteResponse } = await getExactOutQuote(
          outAmountAtomic,
          selectedToken.mint
        );
        if (quoteError || !quoteResponse) {
          console.error("Quote error:", quoteError || "No quote found");
          throw new Error(
            "Failed to get swap quote. Trade route may not be available."
          );
        }

        transaction = await buildSwapTransaction({
          quoteResponse,
          userPublicKey: publicKey,
          destinationAccount: receiverAddress,
        });
      }

      const signedTx = await signTransaction(transaction);
      const rawTx = signedTx.serialize();

      const latestBlockhash = await connection.getLatestBlockhashAndContext();
      const txid = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        maxRetries: 5,
      });

      await connection.confirmTransaction(
        {
          signature: txid,
          blockhash: latestBlockhash.value.blockhash,
          lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
        },
        "finalized"
      );

      console.log("Transaction successful, TxID:", txid);
      setTxid(txid);
      setTransactionSuccess(true);
      setShowParticles(true);

      setTimeout(() => {
        setTransactionSuccess(false);
        setShowParticles(false);
        setTxid(null);
        if (publicKey) fetchTokens(publicKey);
      }, 3000);
    } catch (error: any) {
      console.error("Error during transfer:", error);
      let errorMessage = "Transfer failed. Please try again.";
      if (error.message) {
        errorMessage = `Transfer failed: ${error.message}`;
      }
      if (typeof error.getLogs === "function") {
        try {
          const logs = await error.getLogs();
          console.error("Transaction logs:", logs.join("\n"));
        } catch (logError) {
          console.error("Error retrieving logs:", logError);
        }
      }
      alert(errorMessage);
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

  const getDisableReason = () => {
    if (selectedToken?.mint === USDC_MINT.toBase58()) {
      if (!selectedToken) return "Please select a token.";
      if (usdcAmount <= 0) return "Please enter a USDC amount greater than 0.";
      if (!receiverAddress) return "Please enter a receiver's wallet address.";
      if (!isValidAddress(receiverAddress))
        return "Please enter a valid Solana wallet address.";
      if (!canSend) return "Insufficient USDC balance.";
      if (isTransferring) return "";
      return "";
    } else {
      if (!hasFetchedPrice) return "";
      if (!selectedToken) return "Please select a token.";
      if (usdcAmount <= 0 && currentPrice !== null)
        return "Please enter a USDC amount greater than 0.";
      if (currentPrice === null) {
        if (!hasFetchedPrice) return "Please fetch the price.";
        else return "";
      }
      if (!receiverAddress) return "Please enter a receiver's wallet address.";
      if (!isValidAddress(receiverAddress))
        return "Please enter a valid Solana wallet address.";
      if (!canSend) return "Insufficient balance for the selected token.";
      if (isTransferring) return "";
      return "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md space-y-6 relative"
      style={{
        background:
          "linear-gradient(to bottom right, rgba(255, 255, 255, 0.9), rgba(240, 240, 255, 0.8))",
        backdropFilter: "blur(10px)",
        borderRadius: "16px",
        padding: "24px",
        boxShadow:
          "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
      }}
    >
      <ParticleEffect active={showParticles} />

      <motion.div
        className="flex items-center mb-4"
        initial={{ x: -20 }}
        animate={{ x: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
          Payment Page
        </h2>
        <div className="relative ml-2 group">
          <motion.div
            className="cursor-help w-5 h-5 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-xs font-semibold text-white italic"
            whileHover={{ scale: 1.2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            i
          </motion.div>
          <div className="absolute z-10 w-64 bg-gradient-to-br from-gray-900 to-gray-800 text-white text-xs rounded-lg py-3 px-4 right-0 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            If token names are not displayed properly then it is due to
            tokens.jup.ag rate limit. This code assumes USDC Token Amount for
            receiver is already initialized.
            <div className="absolute bottom-0 right-0 w-2 h-2 -mb-1 mr-3 rotate-45 bg-gray-900"></div>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <motion.div
          className="flex justify-center items-center p-8"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
        </motion.div>
      ) : tokens.length > 0 ? (
        <div className="relative">
          <motion.button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex justify-between items-center w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center">
              {selectedToken && (
                <>
                  {selectedToken.logoURI ? (
                    <motion.img
                      src={selectedToken.logoURI}
                      alt={selectedToken.symbol}
                      className="w-8 h-8 rounded-full mr-3"
                      initial={{ rotate: 0 }}
                      animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    />
                  ) : (
                    <motion.div
                      className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full mr-3 flex items-center justify-center text-white font-medium"
                      initial={{ rotate: 0 }}
                      animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {selectedToken.symbol?.[0]}
                    </motion.div>
                  )}
                  <span className="font-medium">{selectedToken.symbol}</span>
                </>
              )}
            </div>
            <motion.svg
              className="w-5 h-5"
              initial={{ rotate: 0 }}
              animate={{ rotate: isDropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.3 }}
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
            </motion.svg>
          </motion.button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto"
              >
                {tokens.map((token, index) => (
                  <motion.div
                    key={index}
                    className="flex justify-between items-center px-4 py-3 hover:bg-indigo-50 cursor-pointer transition-colors duration-150"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    onClick={() => {
                      setSelectedToken(token);
                      setIsDropdownOpen(false);
                    }}
                    whileHover={{ x: 5 }}
                  >
                    <div className="flex items-center">
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full mr-3"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full mr-3 flex items-center justify-center text-white font-medium">
                          {token.symbol?.[0]}
                        </div>
                      )}
                      <span className="font-medium">{token.symbol}</span>
                    </div>
                    <span className="text-gray-600">
                      {token.uiAmountString}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <label
              htmlFor="usdcAmount"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Amount in USDC
            </label>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative"
            >
              <input
                type="number"
                id="usdcAmount"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(parseFloat(e.target.value) || 0)}
                className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all duration-200"
                min="0"
                placeholder="Enter amount..."
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                USDC
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="mt-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <motion.button
              onClick={fetchPrice}
              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center min-w-[120px]"
              disabled={
                isFetchingPrice ||
                !selectedToken ||
                selectedToken.mint === USDC_MINT.toBase58()
              }
              whileHover={{
                scale: 1.05,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              }}
              whileTap={{ scale: 0.95 }}
            >
              {isFetchingPrice ? (
                <motion.div
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                  Fetch Price
                </>
              )}
            </motion.button>
          </motion.div>

          <AnimatePresence>
            {currentPrice !== null &&
              selectedToken?.mint !== USDC_MINT.toBase58() && (
                <motion.div
                  className="mt-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center">
                    <div className="mr-2 text-indigo-500">
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-indigo-700">
                      Equivalent in {selectedToken?.symbol}:{" "}
                      <span className="font-bold">
                        <AnimatedNumber
                          value={equivalentTokenAmount}
                          decimals={selectedToken?.decimals || 2}
                        />
                      </span>
                    </p>
                  </div>
                </motion.div>
              )}
          </AnimatePresence>

          <AnimatePresence>
            {currentPrice === null &&
              hasFetchedPrice &&
              selectedToken?.mint !== USDC_MINT.toBase58() && (
                <motion.div
                  className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 text-red-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
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
                </motion.div>
              )}
          </AnimatePresence>

          {!hasFetchedPrice &&
            !isFetchingPrice &&
            selectedToken?.mint !== USDC_MINT.toBase58() && (
              <motion.p
                className="mt-2 text-sm text-gray-500 italic"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              >
                Click 'Fetch Price' to calculate equivalent
              </motion.p>
            )}

          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <label
              htmlFor="receiverAddress"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Receiver's Wallet Address
            </label>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <input
                type="text"
                id="receiverAddress"
                value={receiverAddress}
                onChange={(e) => setReceiverAddress(e.target.value)}
                className="block w-full px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all duration-200"
                placeholder="Enter wallet address..."
              />
            </motion.div>
          </motion.div>

          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <motion.button
              onClick={handleSend}
              disabled={
                !canSend ||
                !receiverAddress ||
                !isValidAddress(receiverAddress) ||
                isTransferring
              }
              className={`relative w-full px-4 py-3 font-medium text-white rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden ${
                canSend &&
                receiverAddress &&
                isValidAddress(receiverAddress) &&
                !isTransferring
                  ? "bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 shadow-lg hover:shadow-xl"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
              whileHover={{
                scale:
                  canSend &&
                  receiverAddress &&
                  isValidAddress(receiverAddress) &&
                  !isTransferring
                    ? 1.05
                    : 1,
              }}
              whileTap={{ scale: 0.95 }}
            >
              {isTransferring && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-700"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {isTransferring ? (
                <span className="relative z-10">Transferring...</span>
              ) : (
                <span className="relative z-10">Send</span>
              )}
              <ParticleEffect active={isTransferring} />
            </motion.button>
          </motion.div>

          <AnimatePresence>
            {getDisableReason() && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700 flex items-center"
              >
                <svg
                  className="w-5 h-5 text-indigo-500 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{getDisableReason()}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {transactionSuccess && txid && (
              <motion.div
                className="mt-4 p-4 bg-green-100 border border-green-200 rounded-xl shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg
                      className="w-6 h-6 text-green-500 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <p className="text-green-700 font-semibold">
                      Transaction Successful!
                    </p>
                  </div>
                  <a
                    href={`https://solscan.io/tx/${txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors duration-200"
                  >
                    View on Solscan
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center text-gray-500">
          No tokens found in your wallet.
        </div>
      )}
    </motion.div>
  );
}
