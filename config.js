/**
 * Rinder configuration. The one place deployment values live.
 *
 * Rinder runs on Robinhood Chain (EVM, chain id 4663). Every contract
 * address, endpoint and outbound link the site shows is read from here.
 * No component hardcodes a contract address, RPC or API URL.
 *
 * Everything in this file ships to the browser. Never add a private key,
 * mnemonic or signing secret.
 *
 * Going live later:
 *   1. At token launch, paste the CA into TOKEN_CA just below. One line.
 *      Empty shows "Coming Soon". Any non empty value is shown as is and
 *      its copy button starts copying it. No HTML or JS changes.
 *   2. Deploy the Rinder contracts and paste each 0x address into
 *      `contracts`. The API section lists them with explorer links.
 *   3. Paste the stablecoin token contracts on Robinhood Chain into
 *      `stablecoins[].address` once each one is checked on the explorer.
 *   4. Point `api.baseUrl` at the Rinder API. Search and the transaction
 *      analyzer call it first and fall back to demo records when it is empty.
 *   5. Push. The static site redeploys.
 *
 * Empty strings are the "not configured" state and are always safe.
 * Contract and stablecoin addresses that are not 0x plus 40 hex characters
 * are ignored, so a typo falls back to the unconfigured state.
 */

// TOKEN CA: paste the token address between the quotes. "" = Coming Soon.
const TOKEN_CA = "";

window.RINDER_CONFIG = {
  chain: {
    name: "Robinhood Chain",
    chainId: 4663,
    // Public JSON RPC. Never put a paid API secret here.
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },

  // Rinder contracts on Robinhood Chain. Slots only: none is deployed yet.
  contracts: {
    core: "",
    registry: "",
    verifier: "",
  },

  // The token contract comes from TOKEN_CA at the top of this file.
  token: {
    symbol: "RINDER",
    address: TOKEN_CA,
  },

  api: {
    // e.g. "https://api.example.com". Empty means demo data only.
    baseUrl: "",
  },

  // Stablecoins Rinder profiles on Robinhood Chain. Fill each `address`
  // with the issuer's own ERC20 contract after checking it on the explorer.
  // Empty shows "Not configured" on the site.
  stablecoins: [
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "Circle",
      address: "",
      standard: "ERC20",
      decimals: 6,
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      issuer: "Tether",
      address: "",
      standard: "ERC20",
      decimals: 6,
    },
    {
      symbol: "PYUSD",
      name: "PayPal USD",
      issuer: "Paxos",
      address: "",
      standard: "ERC20",
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
