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

// Inisialisasi provider & wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABI minimal untuk USDC & token mint
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];
const TOKEN_ABI = ["function mint(address to, uint256 amount) public"];

// Inisialisasi kontrak
const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, wallet);

// === ROUTE X402 ===
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

// === ROUTE MINT OTOMATIS ===
app.post("/api/x402", async (req, res) => {
  try {
    // Ambil transaksi terbaru ke PAY_TO_WALLET
    const latestBlock = await provider.getBlockNumber();
    const logs = await provider.getLogs({
      fromBlock: latestBlock - 1000, // rentang block terakhir
      toBlock: "latest",
      address: USDC_ADDRESS,
      topics: [ethers.id("Transfer(address,address,uint256)")]
    });

    let success = false;
    for (const log of logs) {
      const parsed = usdc.interface.parseLog(log);
      const from = parsed.args[0];
      const to = parsed.args[1];
      const value = Number(parsed.args[2]) / 1e6; // USDC decimals 6

      if (to.toLowerCase() === PAY_TO_WALLET.toLowerCase() && value === 5) {
        // Lakukan mint token ke pengirim
        const tx = await token.mint(from, 1);
        await tx.wait();
        success = true;
        return res.json({
          message: `✅ Token minted ke ${from}`,
          mintTxHash: tx.hash
        });
      }
    }

    if (!success)
      res.status(400).json({
        error: "❌ Tidak ditemukan transaksi pembayaran 5 USDC terakhir."
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// === HOMEPAGE ===
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Auto-Mint API</h1>
    <p>Server berjalan di Base Mainnet.</p>
    <p>Cek endpoint:</p>
    <ul>
      <li><a href="/api/x402">/api/x402</a> → Skema pembayaran</li>
    </ul>
  `);
});

export default app;
