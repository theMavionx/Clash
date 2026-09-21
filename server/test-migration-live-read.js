"use strict";
// Read-only deployment diagnostic. Never creates a wallet or signs a transaction.
const fs = require("node:fs");
if (process.env.MIGRATION_DIAGNOSTIC_ENV_FILE) {
  for (const line of fs
    .readFileSync(process.env.MIGRATION_DIAGNOSTIC_ENV_FILE, "utf8")
    .split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
const { alchemySolanaRpcUrl } = require("./solana_rpc");
const { directFetch, alchemyUrl } = require("./migration_chain");
const { SOURCE_MINT } = require("./migration_core");
async function rpc(url, method, params = []) {
  const r = await directFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw Error("Paid provider HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw Error("Paid provider RPC rejected " + method);
  return j.result;
}
(async () => {
  const sol = alchemyUrl(alchemySolanaRpcUrl(), "solana-mainnet.g.alchemy.com");
  const inherited = new URL(sol).pathname.split("/v2/")[1];
  const evm = alchemyUrl(
    process.env.MIGRATION_ROBINHOOD_RPC_URL ||
      `https://robinhood-mainnet.g.alchemy.com/v2/${process.env.ROBINHOOD_ALCHEMY_API_KEY || inherited}`,
    "robinhood-mainnet.g.alchemy.com",
  );
  const supply = await rpc(sol, "getTokenSupply", [
    SOURCE_MINT,
    { commitment: "finalized" },
  ]);
  if (supply.value.decimals !== 6) throw Error("Unexpected source decimals");
  console.log(
    JSON.stringify({
      sourceMint: SOURCE_MINT,
      sourceDecimals: supply.value.decimals,
      sourceSupplyUnits: supply.value.amount,
      slot: supply.context.slot,
    }),
  );
  const chain = Number(BigInt(await rpc(evm, "eth_chainId")));
  if (chain !== 4663) throw Error("Wrong target chain");
  console.log(
    JSON.stringify({
      robinhoodChainId: chain,
      blockNumber: String(BigInt(await rpc(evm, "eth_blockNumber"))),
    }),
  );
})().catch((e) => {
  console.error(e.code || e.message.replace(/https?:\/\/\S+/g, "[redacted]"));
  process.exitCode = 1;
});
