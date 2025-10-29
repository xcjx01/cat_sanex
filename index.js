const express = require("express");
const app = express();
app.use(express.json());

// ====== Homepage ======
app.get("/", (req, res) => {
  res.send(`
    <h1>✅ X402 Mint Token API</h1>
    <p>Server berjalan dengan baik.</p>
    <p>Cek endpoint berikut:</p>
    <ul>
      <li><a href="/api/x402">/api/x402</a> → Schema untuk x402scan</li>
      <li><a href="/api/mint">/api/mint</a> → Endpoint mint token</li>
    </ul>
  `);
});

// ====== Endpoint Mint Token ======
app.post("/api/mint", async (req, res) => {
  const { walletAddress, amount, tokenSymbol } = req.body;

  if (!walletAddress || !amount || !tokenSymbol) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const txHash = "0x" + Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  res.json({
    message: `Minted ${amount} ${tokenSymbol} to ${walletAddress}`,
    transactionHash: txHash
  });
});

// ====== Schema untuk x402scan ======
app.get("/api/x402", (req, res) => {
  const schema = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "0.25",
        resource: "mint.token",
        description: "Mint a new token on Base network",
        mimeType: "application/json",
        payTo: "0xYOUR_WALLET_ADDRESS_HERE",
        maxTimeoutSeconds: 30,
        asset: "USDC"
      }
    ],
    outputSchema: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        bodyFields: {
          walletAddress: { type: "string", description: "Recipient wallet address" },
          amount: { type: "number", description: "Amount of tokens to mint" },
          tokenSymbol: { type: "string", description: "Token symbol (e.g. ZTKN)" }
        }
      },
      output: {
        message: { type: "string", description: "Mint result message" },
        transactionHash: { type: "string", description: "Blockchain transaction hash" }
      }
    },
    extra: {
      category: "blockchain",
      version: "1.0.0",
      developer: "Your Name or Studio"
    }
  };
  res.json(schema);
});

module.exports = app;
