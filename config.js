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
 *   3. Stablecoin contracts are filled and checked on chain. Add a new
 *      one to `stablecoins` only after checking it the same way.
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

  // Rinder contracts on Robinhood Chain, deployed from block 86808906.
  contracts: {
    core: "0x270944aA6F6D5a6D2745A1dd8442d5A532DFEd34",
    registry: "0xe9e06829f36921C7c10E0840Dca9ba185c738Ea7",
    verifier: "0x4088D9678a4EDE1318960a024b03F32AC18375C9",
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

  // Stablecoins Rinder profiles on Robinhood Chain, checked on chain on
  // 12 Oct 2026 (name, symbol, decimals). USDG is the canonical stablecoin
  // listed at docs.robinhood.com/chain/contracts. USDC, USDT and PYUSD are the
  // canonical bridge tokens: the L2 Gateway Router maps each issuer's
  // Ethereum contract to these addresses, and l1Address() points back.
  stablecoins: [
    {
      symbol: "USDG",
      name: "Global Dollar",
      issuer: "Paxos",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      standard: "ERC20",
      decimals: 6,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      issuer: "Circle",
      address: "0x80e0e24718dbFcad49ECAA6F1e6C89A190586cA8",
      standard: "ERC20, bridged from Ethereum",
      decimals: 6,
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      issuer: "Tether",
      address: "0xE246BC49b0598d7Cd9f0eAD48B885034f1254380",
      standard: "ERC20, bridged from Ethereum",
      decimals: 6,
    },
    {
      symbol: "PYUSD",
      name: "PayPal USD",
      issuer: "Paxos",
      address: "0x35a1eC575EE89b1ed4FB23b371E0aAEb2d50cC27",
      standard: "ERC20, bridged from Ethereum",
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
