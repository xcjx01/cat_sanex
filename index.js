// index.js
const express = require("express");
const { ethers } = require("ethers");

const app = express();
app.use(express.json());

// Konfigurasi
const PAY_TO_WALLET = "0x62Ae4503A0430D94ACebF3C3427a940E85511111"; // ganti dengan wallet kamu
const BASE_URL = process.env.BASE_URL || "https://cat-sanex.vercel.app";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Kontrak USDC Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];

// Inisialisasi provider dan kontrak USDC
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

/**
 * Homepage
 */
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Mint (Verifikasi Pembayaran On-chain)</h1>
    <ul>
      <li><a href="/api/x402">/api/x402</a> (GET)</li>
      <li>/api/mint (POST) — memproses mint setelah bayar 5 USDC</li>
    </ul>
  `);
});

/**
 * Endpoint X402
 */
app.get("/api/x402", (req, res) => {
  const schema = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5",
        resource: `${BASE_URL}/api/mint`,
        description: "Mint one token per payment of 5 USDC",
        mimeType: "application/json",
        payTo: PAY_TO_WALLET,
        maxTimeoutSeconds: 60,
        asset: "USDC",
      },
    ],
  };

  res.status(402).json(schema);
});

/**
 * Endpoint Mint (POST)
 * Body: { walletAddress, senderAddress }
 * - Cek apakah senderAddress mengirim 5 USDC ke PAY_TO_WALLET dalam 5 menit terakhir
 */
app.post("/api/mint", async (req, res) => {
  const { walletAddress, senderAddress } = req.body;

  if (!walletAddress || !senderAddress)
    return res.status(400).json({
      error: "walletAddress dan senderAddress wajib diisi",
    });

  try {
    // Ambil event Transfer terakhir (5 menit terakhir)
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - 3000; // kira-kira 5 menit
    const filter = usdcContract.filters.Transfer(senderAddress, PAY_TO_WALLET);

    const events = await usdcContract.queryFilter(filter, fromBlock, latestBlock);

    // Ambil decimals untuk ubah value
    const decimals = await usdcContract.decimals();
    const requiredAmount = ethers.parseUnits("5", decimals);

    // Cek apakah ada transfer >= 5 USDC
    const found = events.find((e) => e.args.value >= requiredAmount);

    if (!found) {
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
            maxTimeoutSeconds: 60,
            asset: "USDC",
          },
        ],
      });
    }

    // Simulasi mint berhasil
    const txHash = found.transactionHash;

    res.json({
      message: "✅ Pembayaran 5 USDC terdeteksi, mint berhasil!",
      mintedTo: walletAddress,
      from: senderAddress,
      transactionHash: txHash,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memverifikasi pembayaran on-chain" });
  }
});

module.exports = app;
