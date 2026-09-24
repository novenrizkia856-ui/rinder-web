/**
 * Rinder configuration. The one place deployment values live.
 *
 * Every Solana address, endpoint and outbound link the site shows is read
 * from here. No component hardcodes a program ID, mint, RPC or API URL.
 *
 * Everything in this file ships to the browser. Never add a private key,
 * keypair or signing secret.
 *
 * Going live later:
 *   1. Deploy the Solana program(s) and copy each Program ID into `programs`.
 *   2. When a Rinder token exists, put its mint address in `token.mint`.
 *      The Token CA block on the landing page switches from "Coming Soon"
 *      to the mint and its copy button starts copying it. No HTML changes.
 *   3. Point `api.baseUrl` at the Rinder API. Search and the transaction
 *      analyzer call it first and fall back to demo records when it is empty.
 *   4. Redeploy the static site.
 *
 * Empty strings are the "not configured" state and are always safe.
 * Values that are not valid base58 Solana addresses are ignored.
 */
window.RINDER_CONFIG = {
  solana: {
    // "mainnet-beta", "devnet" or "testnet"
    cluster: "mainnet-beta",
    // Leave empty to use the public RPC for the cluster.
    rpcUrl: "",
    explorerUrl: "https://explorer.solana.com",
  },

  // Future Rinder programs. Slots only: none of these are deployed yet.
  programs: {
    core: "",
    registry: "",
    verifier: "",
  },

  // There is no Rinder token yet. Keep `mint` empty until one exists.
  token: {
    symbol: "RINDER",
    mint: "",
  },

  api: {
    // e.g. "https://api.example.com". Empty means demo data only.
    baseUrl: "",
  },

  // Public stablecoin mints Rinder profiles on Solana. These are the
  // issuers' own mints, not Rinder infrastructure. Checked against
  // mainnet-beta on 24 Sep 2026 (owner program and decimals).
  stablecoins: [
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "Circle",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenProgram: "SPL Token",
      decimals: 6,
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      issuer: "Tether",
      mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      tokenProgram: "SPL Token",
      decimals: 6,
    },
    {
      symbol: "PYUSD",
      name: "PayPal USD",
      issuer: "Paxos",
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      tokenProgram: "Token 2022",
      decimals: 6,
    },
  ],

  // Outbound links. Empty links are hidden, never rendered as dead anchors.
  links: {
    x: "",
    github: "",
    docs: "",
  },
};
