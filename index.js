const express = require("express");
const app = express();
app.use(express.json());

// ====== Homepage ======
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Mint Token API</h1>
    <p>Server berjalan dengan baik.</p>
    <ul>
      <li><a href="/api/x402">/api/x402</a> → Schema untuk x402scan (402)</li>
      <li><a href="/api/mint">/api/mint</a> → Endpoint mint token (402 Ready)</li>
    </ul>
  `);
});

// ====== Endpoint Mint Token ======
app.post("/api/mint", async (req, res) => {
  const { walletAddress, amount, tokenSymbol } = req.body;

  // Jika belum bayar
  if (!req.headers.authorization) {
    return res.status(402).json({
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "0.25", // harus string angka valid
          resource: "https://cat-sanex.vercel.app/api/mint", // harus URL valid
          description: "Mint a new token on Base network",
          mimeType: "application/json",
          payTo: "0xYOUR_WALLET_ADDRESS_HERE", // Ganti dengan wallet kamu
          maxTimeoutSeconds: 30,
          asset: "USDC",
          outputSchema: {
            input: {
              type: "http",
              method: "POST",
              bodyType: "json",
              bodyFields: {
                walletAddress: {
                  type: "string",
                  required: true,
                  description: "Recipient wallet address"
                },
                amount: {
                  type: "number",
                  required: true,
                  description: "Amount of tokens to mint"
                },
                tokenSymbol: {
                  type: "string",
                  required: true,
                  description: "Token symbol (e.g. MINT)"
                }
              }
            },
            output: {
              message: {
                type: "string",
                description: "Mint result message"
              },
              transactionHash: {
                type: "string",
                description: "Simulated transaction hash"
              }
            }
          },
          extra: {
            category: "blockchain",
            developer: "Your Name or Studio",
            version: "1.0.0"
          }
        }
      ]
    });
  }

  // Jika sudah bayar
  if (!walletAddress || !amount || !tokenSymbol) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const txHash = "0x" + Math.random().toString(16).slice(2, 10).padEnd(8, "0");

  res.json({
    message: `✅ Minted ${amount} ${tokenSymbol} to ${walletAddress}`,
    transactionHash: txHash
  });
});

// ====== Endpoint Schema untuk x402scan ======
app.get("/api/x402", (req, res) => {
  const schema = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5", // string angka valid
        resource: "https://cat-sanex.vercel.app/api/mint", // URL penuh
        description: "Mint a new token on Base network",
        mimeType: "application/json",
        payTo: "0x62Ae4503A0430D94ACebF3C3427a940E85511111", // Ganti dengan wallet kamu
        maxTimeoutSeconds: 30,
        asset: "USDC",
        outputSchema: {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            bodyFields: {
              walletAddress: { type: "string", required: true },
              amount: { type: "number", required: true },
              tokenSymbol: { type: "string", required: true }
            }
          },
          output: {
            message: { type: "string" },
            transactionHash: { type: "string" }
          }
        },
        extra: {
          category: "blockchain",
          version: "1.0.0",
          developer: "Your Name or Studio"
        }
      }
    ]
  };

  // 🔥 kirim status 402 agar dikenali
  res.status(402).json(schema);
});

// ====== Ekspor untuk Vercel ======
module.exports = app;
