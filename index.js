// index.js
const express = require("express");
const { ethers } = require("ethers");

const app = express();
app.use(express.json());

// ⚙️ Konfigurasi
const PAY_TO_WALLET = process.env.PAY_TO_WALLET || "0x62Ae4503A0430D94ACebF3C3427a940E85511111"; // ganti dengan wallet kamu
const BASE_URL = process.env.BASE_URL || "https://cat-sanex.vercel.app";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// 🔗 Kontrak USDC resmi di Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];

// 🔌 Provider blockchain
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

/**
 * 🏠 Root
 */
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Mint Token API</h1>
    <p>Server berjalan dengan baik.</p>
    <ul>
      <li><a href="/api/x402">/api/x402</a> — schema untuk x402scan</li>
      <li><a href="/api/mint">/api/mint</a> — endpoint mint token</li>
    </ul>
  `);
});

/**
 * 🧾 Endpoint X402 Schema
 * Digunakan oleh x402scan untuk membaca informasi pembayaran
 */
app.get("/api/x402", (req, res) => {
  const schema = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5", // 5 USDC
        resource: `${BASE_URL}/api/mint`, // arahkan ke endpoint mint
        description: "Mint 1 token per pembayaran 5 USDC",
        mimeType: "application/json",
        payTo: PAY_TO_WALLET,
        maxTimeoutSeconds: 120,
        asset: "USDC",
        outputSchema: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            bodyFields: {
              walletAddress: { type: "string", required: true, description: "Alamat wallet tujuan mint" },
              senderAddress: { type: "string", required: true, description: "Alamat pengirim USDC" }
            }
          },
          output: {
            message: "string",
            mintedTo: "string",
            transactionHash: "string"
          }
        }
      }
    ]
  };

  // Response 402 = pembayaran dibutuhkan
  res.status(402).json(schema);
});

/**
 * 💰 Endpoint Mint
 * Verifikasi apakah pengirim sudah transfer 5 USDC ke wallet kamu
 */
app.post("/api/mint", async (req, res) => {
  const { walletAddress, senderAddress } = req.body;
  if (!walletAddress || !senderAddress) {
    return res.status(400).json({ error: "walletAddress dan senderAddress wajib diisi" });
  }

  try {
    // Ambil blok terbaru (sekitar 5 menit terakhir)
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - 3000; // kira-kira 5 menit di Base

    // Filter event transfer dari sender → payTo
    const filter = usdcContract.filters.Transfer(senderAddress, PAY_TO_WALLET);
    const events = await usdcContract.queryFilter(filter, fromBlock, latestBlock);

    // Hitung nilai minimum 5 USDC
    const decimals = await usdcContract.decimals();
    const requiredAmount = ethers.parseUnits("5", decimals);

    // Cek apakah ada transfer >= 5 USDC
    const found = events.find(e => e.args.value >= requiredAmount);

    if (!found) {
      // Belum ada pembayaran → kembalikan 402 lagi
      return res.status(402).json({
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "5",
            resource: `${BASE_URL}/api/mint`,
            description: "Bayar 5 USDC ke alamat tujuan sebelum mint",
            mimeType: "application/json",
            payTo: PAY_TO_WALLET,
            maxTimeoutSeconds: 120,
            asset: "USDC"
          }
        ]
      });
    }

    // ✅ Pembayaran terdeteksi
    const txHash = found.transactionHash;
    res.json({
      message: "✅ Pembayaran 5 USDC terdeteksi — Mint berhasil!",
      mintedTo: walletAddress,
      from: senderAddress,
      transactionHash: txHash
    });
  } catch (err) {
    console.error("Mint error:", err);
    res.status(500).json({ error: "Gagal memverifikasi pembayaran on-chain", details: err.message });
  }
});

/**
 * 🔥 Error handler global
 */
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

module.exports = app;
