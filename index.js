// index.js
const express = require("express");
const { ethers } = require("ethers");
const app = express();
app.use(express.json());

// ---------- CONFIG (gunakan ENV di Vercel) ----------
const PRIVATE_KEY = process.env.PRIVATE_KEY;                 // required: private key signer (admin minter)
const PAY_TO_WALLET = process.env.PAY_TO_WALLET;             // required: alamat penerima 5 USDC
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;       // required: alamat kontrak token yang punya mint()
const BASE_URL = process.env.BASE_URL || "https://cat-sanex.vercel.app";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// berapa token akan dimint (string number, misal "100")
const MINT_AMOUNT = process.env.MINT_AMOUNT || "100";
// decimals token yang akan dimint (umumnya 18, sesuaikan kontrakmu)
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 18);

// ---------------- ABIs ----------------
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];

// minimal ABI untuk mintable token (sesuaikan jika nama/params berbeda)
const TOKEN_ABI = [
  "function mint(address to, uint256 amount) public returns (bool)"
];

// ---------------- PROVIDER / CONTRACTS ----------------
if (!PRIVATE_KEY || !PAY_TO_WALLET || !CONTRACT_ADDRESS) {
  // jika env belum diset, app masih jalan tapi akan menolak operasi mint
  console.warn("WARNING: PRIVATE_KEY, PAY_TO_WALLET, or CONTRACT_ADDRESS missing in env");
}

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const tokenContract = signer ? new ethers.Contract(CONTRACT_ADDRESS, TOKEN_ABI, signer) : null;

/**
 * GET /api/x402
 * -> x402scan membaca ini (status 402) dan menampilkan UI bayar.
 * resource diarahkan ke POST /api/x402 (unified flow).
 */
app.get("/api/x402", (req, res) => {
  const schema = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5", // 5 USDC per mint
        resource: `${BASE_URL}/api/x402`, // unified: x402scan will POST here after payment
        description: "Mint 1 token per payment of 5 USDC",
        mimeType: "application/json",
        payTo: PAY_TO_WALLET,
        maxTimeoutSeconds: 180,
        asset: "USDC",
        outputSchema: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            bodyFields: {
              walletAddress: { type: "string", required: true },
              paymentTxHash: { type: "string", required: true, description: "Tx hash of USDC payment to PAY_TO_WALLET" }
            }
          },
          output: {
            message: { type: "string" },
            mintTxHash: { type: "string" }
          }
        }
      }
    ]
  };

  // Return 402 so x402scan treats it as a payable resource
  return res.status(402).json(schema);
});

/**
 * POST /api/x402
 * -> Expect body: { walletAddress, paymentTxHash }
 *    or header Authorization: Bearer <paymentTxHash>
 * Flow:
 *  - Validate paymentTxHash: fetch receipt, ensure Transfer USDC -> PAY_TO_WALLET >= 5 USDC
 *  - If valid: call tokenContract.mint(walletAddress, MINT_AMOUNT * 10^decimals)
 *  - Return mint tx hash
 */
app.post("/api/x402", async (req, res) => {
  try {
    const walletAddress = req.body.walletAddress || null;
    // paymentTxHash can be in body or Authorization header
    const paymentTxHash = (req.body.paymentTxHash || (req.headers.authorization || "").replace(/^Bearer\s+/i, "")).trim();

    if (!walletAddress) return res.status(400).json({ error: "walletAddress is required in body" });
    if (!paymentTxHash) {
      // no payment provided -> return 402 with schema so client can pay
      return res.status(402).json({
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "5",
            resource: `${BASE_URL}/api/x402`,
            description: "Pay 5 USDC to trigger mint",
            mimeType: "application/json",
            payTo: PAY_TO_WALLET,
            maxTimeoutSeconds: 180,
            asset: "USDC"
          }
        ]
      });
    }

    // fetch receipt
    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt) return res.status(400).json({ error: "Transaction receipt not yet available" });

    // ensure receipt succeeded
    if (receipt.status === 0) return res.status(400).json({ error: "Payment transaction failed" });

    // fetch USDC decimals and compute required amount
    const usdcDecimals = Number(await usdcContract.decimals());
    const requiredAmount = ethers.parseUnits("5", usdcDecimals); // BigInt

    // Check logs in receipt for USDC Transfer to PAY_TO_WALLET
    const usdcIface = new ethers.Interface(USDC_ABI);
    const found = receipt.logs.some((log) => {
      try {
        if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return false;
        const parsed = usdcIface.parseLog(log);
        // parsed.args: [from, to, value]
        const to = parsed.args[1];
        const value = parsed.args[2];
        return to && to.toLowerCase() === PAY_TO_WALLET.toLowerCase() && BigInt(value) >= BigInt(requiredAmount);
      } catch (e) {
        return false;
      }
    });

    if (!found) {
      return res.status(402).json({ error: "Payment of 5 USDC to PAY_TO_WALLET not found in provided transaction" });
    }

    // Payment verified -> proceed to mint
    if (!tokenContract) {
      return res.status(500).json({ error: "Token contract not configured (PRIVATE_KEY or CONTRACT_ADDRESS missing)" });
    }

    // compute mint amount in token decimals
    const mintAmount = ethers.parseUnits(MINT_AMOUNT, TOKEN_DECIMALS);
    const mintTx = await tokenContract.mint(walletAddress, mintAmount);
    const mintReceipt = await mintTx.wait();

    return res.json({
      message: "✅ Payment verified and mint executed",
      paymentTxHash,
      mintTxHash: mintReceipt.transactionHash
    });
  } catch (err) {
    console.error("Error /api/x402:", err);
    // if provider RPC errors, give helpful message
    return res.status(500).json({ error: "Internal server error", details: (err && err.message) || String(err) });
  }
});

// global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err?.message });
});

module.exports = app;
