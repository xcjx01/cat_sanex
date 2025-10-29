import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const {
  RPC_URL,
  PRIVATE_KEY,
  PAY_TO_WALLET,
  USDC_ADDRESS,
  TOKEN_ADDRESS
} = process.env;

// provider & wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI dasar
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];
const TOKEN_ABI = ["function mint(address to, uint256 amount) public"];

const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

// === Route utama untuk X402 ===
app.get("/api/x402", async (req, res) => {
  res.status(402).json({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5",
        resource: "https://cat-sanex.vercel.app/api/x402",
        description: "Mint otomatis 1 token untuk setiap pembayaran 5 USDC",
        mimeType: "application/json",
        asset: "USDC",
        payTo: PAY_TO_WALLET,
        maxTimeoutSeconds: 180
      }
    ]
  });
});

// === Route POST untuk mint otomatis ===
app.post("/api/x402", async (req, res) => {
  try {
    const latestBlock = await provider.getBlockNumber();
    const logs = await provider.getLogs({
      fromBlock: latestBlock - 1000,
      toBlock: "latest",
      address: USDC_ADDRESS,
      topics: [ethers.id("Transfer(address,address,uint256)")]
    });

    for (const log of logs) {
      const parsed = usdc.interface.parseLog(log);
      const from = parsed.args[0];
      const to = parsed.args[1];
      const value = Number(parsed.args[2]) / 1e6; // USDC decimals = 6

      if (to.toLowerCase() === PAY_TO_WALLET.toLowerCase() && value === 5) {
        const tx = await token.mint(from, 1);
        await tx.wait();

        return res.json({
          message: `✅ Token minted ke ${from}`,
          mintTxHash: tx.hash
        });
      }
    }

    res.status(400).json({
      error: "❌ Tidak ditemukan transaksi pembayaran 5 USDC terakhir."
    });
  } catch (err) {
    console.error("🔥 Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// === Route homepage ===
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Mint Token API</h1>
    <p>Server berjalan di Base Mainnet.</p>
    <ul>
      <li><a href="/api/x402">/api/x402</a> → Endpoint pembayaran</li>
    </ul>
  `);
});

// === Export app untuk Vercel ===
export default app;
