"use strict";
const https = require("node:https");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getExtensionTypes,
  ExtensionType,
  getAccountLen,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} = require("@solana/spl-token");
const bs58 = require("bs58").default || require("bs58");
const nacl = require("tweetnacl");
const {
  createPublicClient,
  custom,
  encodeFunctionData,
  decodeEventLog,
  keccak256,
  parseAbi,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const {
  check,
  MigrationError,
  units,
  SOURCE_MINT,
} = require("./migration_core");
const { alchemySolanaRpcUrl } = require("./solana_rpc");
const { createMigrationHistory } = require("./migration_history");
const { robinhoodUsdg } = require("../shared/migration-assets.json");
function validateTargetSupply(address, decimals, supply, symbol) {
  if (address.toLowerCase() === robinhoodUsdg.address.toLowerCase()) {
    check(decimals === robinhoodUsdg.decimals && symbol === robinhoodUsdg.symbol && supply > 0n, "USDG_METADATA_MISMATCH", 503);
  } else {
    check(supply === 1000000000n * 10n ** BigInt(decimals), "TARGET_SUPPLY_MUST_BE_ONE_BILLION", 503);
  }
}
const SOL = "So11111111111111111111111111111111111111112";
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const ERC20 = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
// Deliberately bypass the global public-read proxy shim. Endpoints are fixed;
// private RPC keys never go through any free or shared HTTP proxy.
function directFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const allowed = [
      "solana-mainnet.g.alchemy.com",
      "robinhood-mainnet.g.alchemy.com",
      "api.dexscreener.com",
      "api.jup.ag",
    ];
    if (
      u.protocol !== "https:" ||
      !allowed.includes(u.hostname) ||
      u.username ||
      u.password ||
      u.port
    )
      return reject(new MigrationError("RPC_NOT_ALLOWED", 503));
    const req = https.request(
      u,
      {
        method: options.method || "GET",
        headers: options.headers,
        timeout: 15000,
      },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on("data", (b) => {
          size += b.length;
          if (size > 64 * 1024 * 1024) {
            req.destroy();
            reject(new MigrationError("UPSTREAM_RESPONSE_LIMIT", 503));
          } else chunks.push(b);
        });
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers,
            }),
          ),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () =>
      reject(new MigrationError("UPSTREAM_UNAVAILABLE", 503)),
    );
    if (options.body) req.write(options.body);
    req.end();
  });
}
async function json(url, options) {
  const r = await directFetch(url, options);
  check(r.ok, "UPSTREAM_UNAVAILABLE", 503);
  return r.json();
}
function solKey(s) {
  try {
    const bytes = s.trim().startsWith("[")
      ? Uint8Array.from(JSON.parse(s))
      : bs58.decode(s.trim());
    check(bytes.length === 64, "INVALID_KEY");
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new MigrationError("INVALID_KEY");
  }
}
function evmKey(s) {
  try {
    check(/^0x[0-9a-f]{64}$/i.test(s), "INVALID_KEY");
    return privateKeyToAccount(s);
  } catch {
    throw new MigrationError("INVALID_KEY");
  }
}
function alchemyUrl(url, host) {
  try {
    const u = new URL(url);
    check(
      u.protocol === "https:" &&
        u.hostname === host &&
        !u.port &&
        !u.username &&
        !u.password &&
        /^\/v2\/[^/]+$/.test(u.pathname),
      "PAID_ALCHEMY_RPC_REQUIRED",
      503,
    );
    return u.href;
  } catch {
    throw new MigrationError("PAID_ALCHEMY_RPC_REQUIRED", 503);
  }
}
function createMigrationChain(env = process.env, deps = {}) {
  const history = createMigrationHistory(
    deps.historyRpc ||
      (async (method, params) => {
        const endpoint = alchemyUrl(
          alchemySolanaRpcUrl(env),
          "solana-mainnet.g.alchemy.com",
        );
        const r = await json(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        check(!r.error && r.result !== undefined, "HISTORY_UNAVAILABLE", 503);
        return r.result;
      }),
  );
  let connection = deps.connection,
    publicClient = deps.publicClient;
  let adminRpcKey = "";
  function setRpcKey(value) {
    if ((value || "") !== adminRpcKey) {
      adminRpcKey = value || "";
      publicClient = deps.publicClient;
    }
  }
  function sol() {
    if (!connection) {
      const endpoint = alchemyUrl(
        alchemySolanaRpcUrl(env),
        "solana-mainnet.g.alchemy.com",
      );
      connection = new Connection(endpoint, {
        commitment: "finalized",
        fetch: directFetch,
        disableRetryOnRateLimit: true,
      });
    }
    return connection;
  }
  function evm() {
    if (!publicClient) {
      const s = alchemySolanaRpcUrl(env);
      let inherited = "";
      try {
        inherited = new URL(s).pathname.split("/v2/")[1] || "";
      } catch {
        /* unavailable */
      }
      const chosen = adminRpcKey || env.ROBINHOOD_ALCHEMY_API_KEY || inherited;
      const endpoint = alchemyUrl(
        adminRpcKey
          ? `https://robinhood-mainnet.g.alchemy.com/v2/${adminRpcKey}`
          : env.MIGRATION_ROBINHOOD_RPC_URL ||
              (chosen
                ? `https://robinhood-mainnet.g.alchemy.com/v2/${chosen}`
                : ""),
        "robinhood-mainnet.g.alchemy.com",
      );
      publicClient = createPublicClient({
        transport: custom(
          {
            request: async ({ method, params }) => {
              const r = await json(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method,
                  params: params || [],
                }),
              });
              check(!r.error, "EVM_RPC_ERROR", 503);
              return r.result;
            },
          },
          { retryCount: 0 },
        ),
      });
    }
    return publicClient;
  }
  async function chainCheck() {
    check((await evm().getChainId()) === 4663, "WRONG_CHAIN", 503);
  }
  async function mint() {
    const m = await getMint(
      sol(),
      new PublicKey(SOURCE_MINT),
      "finalized",
      TOKEN_2022_PROGRAM_ID,
    );
    check(
      m.decimals === 6 && m.supply > 0n && m.supply <= 1000000000n * 1000000n,
      "SOURCE_MINT_MISMATCH",
      503,
    );
    check(
      getExtensionTypes(m.tlvData).every((type) =>
        [ExtensionType.MetadataPointer, ExtensionType.TokenMetadata].includes(
          type,
        ),
      ),
      "SOURCE_TOKEN_EXTENSIONS_UNSUPPORTED",
      503,
    );
    return m;
  }
  async function keyAddress(kind, value) {
    if (kind === "solana") return solKey(value).publicKey.toBase58();
    if (kind === "evm") return evmKey(value).address;
    check(
      typeof value === "string" && /^[a-zA-Z0-9_-]{16,256}$/.test(value),
      "INVALID_KEY",
    );
    return "configured";
  }
  async function balance(owner, m = SOURCE_MINT) {
    const r = await sol().getParsedTokenAccountsByOwner(
      new PublicKey(owner),
      { mint: new PublicKey(m) },
      "finalized",
    );
    return String(
      r.value.reduce(
        (n, a) => n + BigInt(a.account.data.parsed.info.tokenAmount.amount),
        0n,
      ),
    );
  }
  async function health(c, keys) {
    await chainCheck();
    await mint();
    const treasury = solKey(keys.solana).publicKey,
      account = evmKey(keys.evm);
    const code = await evm().getCode({ address: c.targetToken });
    check(code && code !== "0x", "TARGET_NOT_CONTRACT", 503);
    const read = (functionName, args = []) =>
      evm().readContract({
        address: c.targetToken,
        abi: ERC20,
        functionName,
        args,
        blockTag: "finalized",
      });
    const decimals = Number(await read("decimals"));
    check(
      Number.isInteger(decimals) && decimals >= 0 && decimals <= 18,
      "TARGET_DECIMALS",
      503,
    );
    validateTargetSupply(c.targetToken, decimals, await read("totalSupply"),
      c.targetToken.toLowerCase() === robinhoodUsdg.address.toLowerCase() ? await read("symbol") : undefined);
    const inventory = await read("balanceOf", [account.address]);
    const reasons = [];
    if (!inventory) reasons.push("TARGET_INVENTORY_EMPTY");
    if (
      (await evm().getBalance({ address: account.address })) < 100000000000000n
    )
      reasons.push("ETH_GAS_REQUIRED");
    if ((await sol().getBalance(treasury, "finalized")) < 10000000)
      reasons.push("SOL_GAS_REQUIRED");
    return { reasons, targetDecimals: decimals, inventory: String(inventory) };
  }
  async function snapshot() {
    await mint();
    const r = await sol().getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      commitment: "finalized",
      withContext: true,
      filters: [{ memcmp: { offset: 0, bytes: SOURCE_MINT } }],
    });
    check(
      r.context?.slot && Array.isArray(r.value),
      "SNAPSHOT_UNAVAILABLE",
      503,
    );
    const balances = {};
    for (const item of r.value) {
      const a = AccountLayout.decode(item.account.data);
      check(a.mint.toBase58() === SOURCE_MINT, "SNAPSHOT_MINT_MISMATCH");
      const w = a.owner.toBase58();
      balances[w] = String(BigInt(balances[w] || 0) + a.amount);
    }
    return { slot: r.context.slot, balances };
  }
  let priceCache = null;
  async function prices() {
    if (priceCache && Date.now() - priceCache.at < 15000)
      return priceCache.value;
    const price = async (m, min) => {
      const list = await json(
        "https://api.dexscreener.com/tokens/v1/solana/" + m,
      );
      check(Array.isArray(list), "PRICE_UNAVAILABLE", 503);
      const pool = list
        .filter(
          (p) =>
            p.chainId === "solana" &&
            p.baseToken?.address === m &&
            Number(p.liquidity?.usd) >= min &&
            Number(p.priceUsd) > 0 &&
            Number(p.txns?.h24?.buys || 0) + Number(p.txns?.h24?.sells || 0) >
              0,
        )
        .sort((a, b) => b.liquidity.usd - a.liquidity.usd)[0];
      check(pool, "LIQUID_PRICE_UNAVAILABLE", 503);
      const text = Number(pool.priceUsd).toFixed(12);
      return units(text, 12);
    };
    const solPrice = await price(SOL, 100000),
      clashPrice = await price(SOURCE_MINT, 1000);
    const value = {
      solUsdMicros: String(solPrice / 1000000n),
      clashUsdMicros: String(clashPrice / 1000000n),
    };
    check(
      BigInt(value.solUsdMicros) > 0n && BigInt(value.clashUsdMicros) > 0n,
      "PRICE_PRECISION_UNAVAILABLE",
      503,
    );
    priceCache = { at: Date.now(), value };
    return value;
  }
  async function prepareDeposit(r) {
    const c = sol(),
      user = new PublicKey(r.wallet),
      payer = new PublicKey(r.solanaTreasury),
      m = new PublicKey(SOURCE_MINT);
    check(!payer.equals(user), "TREASURY_CANNOT_MIGRATE");
    const source = getAssociatedTokenAddressSync(
        m,
        user,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
      destination = getAssociatedTokenAddressSync(
        m,
        payer,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
    const sourceBalance = await c.getTokenAccountBalance(source, "finalized");
    check(
      BigInt(sourceBalance.value.amount) >= BigInt(r.inputUnits),
      "INSUFFICIENT_CLASH",
    );
    check(
      BigInt(await c.getBalance(user, "finalized")) >= BigInt(r.feeLamports),
      "INSUFFICIENT_SOL_FEE",
    );
    const block = await c.getLatestBlockhash("finalized");
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: block.blockhash,
    });
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        destination,
        payer,
        m,
        TOKEN_2022_PROGRAM_ID,
      ),
      createTransferCheckedInstruction(
        source,
        m,
        destination,
        user,
        BigInt(r.inputUnits),
        6,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
      SystemProgram.transfer({
        fromPubkey: user,
        toPubkey: payer,
        lamports: BigInt(r.feeLamports),
      }),
      new TransactionInstruction({
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        keys: [],
        data: Buffer.from("CLASH migration " + r.id),
      }),
    );
    const fee = (await c.getFeeForMessage(tx.compileMessage(), "finalized"))
      .value;
    check(fee !== null, "FEE_UNAVAILABLE", 503);
    const rent = await c.getMinimumBalanceForRentExemption(
      getAccountLen([ExtensionType.ImmutableOwner]),
    );
    check(
      BigInt(fee + rent) < BigInt(r.feeLamports),
      "NETWORK_FEE_EXCEEDS_QUOTE",
      409,
    );
    return {
      transaction: tx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
      lastValidBlockHeight: block.lastValidBlockHeight,
      depositDestination: destination.toBase58(),
    };
  }
  async function signDeposit(r, encoded, key) {
    check(
      typeof encoded === "string" && encoded.length < 12000,
      "INVALID_TRANSACTION",
    );
    const tx = Transaction.from(Buffer.from(encoded, "base64")),
      expected = Transaction.from(Buffer.from(r.transaction, "base64"));
    check(
      tx.serializeMessage().equals(expected.serializeMessage()),
      "TRANSACTION_CHANGED",
    );
    const signer = tx.signatures.find(
      (s) => s.publicKey.toBase58() === r.wallet,
    );
    check(
      signer?.signature &&
        nacl.sign.detached.verify(
          tx.serializeMessage(),
          signer.signature,
          new PublicKey(r.wallet).toBytes(),
        ),
      "INVALID_SIGNATURE",
    );
    const payer = solKey(key);
    check(payer.publicKey.toBase58() === r.solanaTreasury, "TREASURY_CHANGED");
    tx.partialSign(payer);
    check(tx.verifySignatures(), "INVALID_SIGNATURE");
    const sim = await sol().simulateTransaction(
      VersionedTransaction.deserialize(tx.serialize()),
      { sigVerify: true, commitment: "finalized" },
    );
    check(!sim.value.err, "DEPOSIT_SIMULATION_FAILED", 409);
    return {
      raw: tx.serialize().toString("base64"),
      hash: bs58.encode(tx.signature),
    };
  }
  async function solStatus(hash, height) {
    const result = (
      await sol().getSignatureStatuses([hash], {
        searchTransactionHistory: true,
      })
    ).value[0];
    if (result?.confirmationStatus === "finalized")
      return result.err ? "failed" : "confirmed";
    if ((await sol().getBlockHeight("finalized")) > height && !result)
      return "expired";
    return "pending";
  }
  async function depositStatus(r) {
    const status = await solStatus(r.depositHash, r.lastValidBlockHeight);
    if (status !== "confirmed") return status;
    const tx = await sol().getTransaction(r.depositHash, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    check(tx && !tx.meta?.err, "DEPOSIT_RECEIPT_UNAVAILABLE", 503);
    check(
      tx.transaction.message
        .serialize()
        .equals(
          Transaction.from(
            Buffer.from(r.transaction, "base64"),
          ).serializeMessage(),
        ),
      "DEPOSIT_MESSAGE_MISMATCH",
    );
    return "confirmed";
  }
  async function broadcastSolana(raw) {
    await sol().sendRawTransaction(Buffer.from(raw, "base64"), {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: "finalized",
    });
  }
  async function preparePayout(r, key) {
    await chainCheck();
    const a = evmKey(key);
    check(
      a.address.toLowerCase() === r.evmTreasury.toLowerCase(),
      "TREASURY_CHANGED",
    );
    const nonce = await evm().getTransactionCount({
      address: a.address,
      blockTag: "pending",
    });
    check(
      nonce ===
        (await evm().getTransactionCount({
          address: a.address,
          blockTag: "latest",
        })),
      "TREASURY_PENDING_TRANSACTION",
      409,
    );
    const data = encodeFunctionData({
      abi: ERC20,
      functionName: "transfer",
      args: [r.destination, BigInt(r.outputUnits)],
    });
    await evm().simulateContract({
      account: a.address,
      address: r.targetToken,
      abi: ERC20,
      functionName: "transfer",
      args: [r.destination, BigInt(r.outputUnits)],
    });
    const gas =
        ((await evm().estimateGas({
          account: a.address,
          to: r.targetToken,
          data,
        })) *
          120n) /
        100n,
      gasPrice = ((await evm().getGasPrice()) * 120n) / 100n;
    check(gas * gasPrice <= 100000000000000n, "EVM_GAS_BUDGET_EXCEEDED", 409);
    const raw = await a.signTransaction({
      chainId: 4663,
      nonce,
      gas,
      gasPrice,
      to: r.targetToken,
      data,
      value: 0n,
      type: "legacy",
    });
    return { raw, hash: keccak256(raw), nonce };
  }
  async function payoutStatus(r) {
    await chainCheck();
    let receipt;
    try {
      receipt = await evm().getTransactionReceipt({ hash: r.payoutHash });
    } catch (e) {
      if (e.name !== "TransactionReceiptNotFoundError") throw e;
    }
    if (!receipt) {
      return (await evm().getTransactionCount({
        address: r.evmTreasury,
        blockTag: "latest",
      })) > r.payoutNonce
        ? "conflict"
        : "pending";
    }
    const final = await evm().getBlock({ blockTag: "finalized" });
    if (final.number < receipt.blockNumber) return "pending";
    const canonical = await evm().getBlock({
      blockNumber: receipt.blockNumber,
    });
    if (canonical.hash !== receipt.blockHash) return "pending";
    if (receipt.status !== "success") return "failed";
    const transfers = receipt.logs
      .filter((l) => l.address.toLowerCase() === r.targetToken.toLowerCase())
      .flatMap((l) => {
        try {
          return [
            decodeEventLog({ abi: ERC20, data: l.data, topics: l.topics }),
          ];
        } catch {
          return [];
        }
      })
      .filter(
        (l) =>
          l.eventName === "Transfer" &&
          l.args.from.toLowerCase() === r.evmTreasury.toLowerCase() &&
          l.args.to.toLowerCase() === r.destination.toLowerCase(),
      );
    return transfers.reduce((s, l) => s + l.args.value, 0n) ===
      BigInt(r.outputUnits)
      ? "confirmed"
      : "conflict";
  }
  async function broadcastEvm(serializedTransaction) {
    await chainCheck();
    await evm().sendRawTransaction({ serializedTransaction });
  }
  async function prepareSale(input, key, apiKey) {
    const signer = solKey(key),
      c = sol();
    check(apiKey, "JUPITER_KEY_REQUIRED", 503);
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(SOURCE_MINT),
      signer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const beforeTokens = BigInt(
        (await c.getTokenAccountBalance(ata, "finalized")).value.amount,
      ),
      beforeSol = BigInt(await c.getBalance(signer.publicKey, "finalized"));
    check(beforeTokens >= BigInt(input.inputUnits), "SALE_BALANCE_UNAVAILABLE");
    for (
      let slippage = input.slippageBps;
      slippage <= input.maxSlippageBps;
      slippage = Math.min(slippage + 250, input.maxSlippageBps + 1)
    ) {
      const q = await json(
        "https://api.jup.ag/swap/v2/build?" +
          new URLSearchParams({
            inputMint: SOURCE_MINT,
            outputMint: SOL,
            amount: input.inputUnits,
            taker: signer.publicKey.toBase58(),
            slippageBps: String(slippage),
            wrapAndUnwrapSol: "true",
          }),
        { headers: { "x-api-key": apiKey } },
      );
      check(
        q.inputMint === SOURCE_MINT &&
          q.outputMint === SOL &&
          q.inAmount === input.inputUnits &&
          q.swapMode === "ExactIn" &&
          Number(q.slippageBps) === slippage,
        "INVALID_SWAP_QUOTE",
      );
      check(
        q.swapInstruction?.programId === JUP &&
          !q.tipInstruction &&
          !(q.otherInstructions || []).length,
        "UNEXPECTED_SWAP_INSTRUCTION",
      );
      const minimum = BigInt(q.otherAmountThreshold);
      check(
        minimum > 0n &&
          minimum >= (BigInt(q.outAmount) * BigInt(10000 - slippage)) / 10000n,
        "INVALID_SWAP_THRESHOLD",
      );
      const price = await prices();
      const fair =
        (BigInt(input.inputUnits) * BigInt(price.clashUsdMicros) * 1000n) /
        BigInt(price.solUsdMicros);
      check(
        minimum >= (fair * BigInt(10000 - input.maxSlippageBps)) / 10000n,
        "SALE_PRICE_IMPACT_EXCEEDED",
      );
      const toIx = (ix) => {
        check(
          ix.accounts.every(
            (a) => !a.isSigner || a.pubkey === signer.publicKey.toBase58(),
          ),
          "UNEXPECTED_SWAP_SIGNER",
        );
        return new TransactionInstruction({
          programId: new PublicKey(ix.programId),
          keys: ix.accounts.map((a) => ({
            pubkey: new PublicKey(a.pubkey),
            isSigner: a.isSigner,
            isWritable: a.isWritable,
          })),
          data: Buffer.from(ix.data, "base64"),
        });
      };
      const setup = (q.setupInstructions || []).map((ix) => {
        check(
          ix.programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
          "UNEXPECTED_SWAP_SETUP",
        );
        check(
          ix.accounts[0]?.pubkey === signer.publicKey.toBase58() &&
            ix.accounts[2]?.pubkey === signer.publicKey.toBase58() &&
            [SOURCE_MINT, SOL].includes(ix.accounts[3]?.pubkey),
          "UNEXPECTED_SWAP_ACCOUNT",
        );
        return toIx(ix);
      });
      const cleanup = [];
      if (q.cleanupInstruction) {
        const ix = q.cleanupInstruction;
        check(
          ix.programId === TOKEN_PROGRAM_ID.toBase58() &&
            Buffer.from(ix.data, "base64")[0] === 9 &&
            ix.accounts[0]?.pubkey ===
              getAssociatedTokenAddressSync(
                new PublicKey(SOL),
                signer.publicKey,
              ).toBase58() &&
            ix.accounts[1]?.pubkey === signer.publicKey.toBase58(),
          "UNEXPECTED_SWAP_CLEANUP",
        );
        cleanup.push(toIx(ix));
      }
      // Fetch ALT contents from our paid RPC rather than trusting API-provided entries.
      const alts = [];
      for (const a of Object.keys(q.addressesByLookupTableAddress || {})) {
        check(alts.length < 8, "TOO_MANY_LOOKUP_TABLES");
        const alt = (await c.getAddressLookupTable(new PublicKey(a))).value;
        check(alt, "LOOKUP_TABLE_UNAVAILABLE");
        alts.push(alt);
      }
      const block = await c.getLatestBlockhash("finalized");
      const instructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
        ...setup,
        toIx(q.swapInstruction),
        ...cleanup,
      ];
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: signer.publicKey,
          recentBlockhash: block.blockhash,
          instructions,
        }).compileToV0Message(alts),
      );
      const sim = await c.simulateTransaction(tx, {
        commitment: "finalized",
        sigVerify: false,
        accounts: {
          encoding: "base64",
          addresses: [ata.toBase58(), signer.publicKey.toBase58()],
        },
      });
      if (sim.value.err) {
        if (
          JSON.stringify(sim.value.err).includes("6001") &&
          slippage < input.maxSlippageBps
        )
          continue;
        throw new MigrationError("SALE_SIMULATION_FAILED", 409);
      }
      const after = sim.value.accounts;
      check(after?.[0]?.data && after?.[1], "SALE_SIMULATION_ACCOUNTS");
      const afterTokens = AccountLayout.decode(
        Buffer.from(after[0].data[0], "base64"),
      ).amount;
      check(
        beforeTokens - afterTokens === BigInt(input.inputUnits) &&
          BigInt(after[1].lamports) >= beforeSol + minimum - 25000n,
        "SALE_SIMULATION_BALANCE_MISMATCH",
      );
      tx.sign([signer]);
      return {
        raw: Buffer.from(tx.serialize()).toString("base64"),
        hash: bs58.encode(tx.signatures[0]),
        lastValidBlockHeight: block.lastValidBlockHeight,
        treasury: signer.publicKey.toBase58(),
        sourceAta: ata.toBase58(),
        minimumOutput: String(minimum),
        slippageBps: slippage,
      };
    }
    throw new MigrationError("SLIPPAGE_LIMIT", 409);
  }
  async function saleStatus(s) {
    const status = await solStatus(s.hash, s.lastValidBlockHeight);
    if (status !== "confirmed") return status;
    const tx = await sol().getTransaction(s.hash, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    check(tx && !tx.meta?.err, "SALE_RECEIPT_UNAVAILABLE", 503);
    const sum = (list) =>
      (list || [])
        .filter((t) => t.mint === SOURCE_MINT && t.owner === s.treasury)
        .reduce((n, t) => n + BigInt(t.uiTokenAmount.amount), 0n);
    check(
      sum(tx.meta.preTokenBalances) - sum(tx.meta.postTokenBalances) ===
        BigInt(s.inputUnits),
      "SALE_RECEIPT_MISMATCH",
      503,
    );
    const keys =
      tx.transaction.message.staticAccountKeys ||
      tx.transaction.message.accountKeys;
    const i = keys.findIndex((k) => k.toBase58() === s.treasury);
    check(
      i >= 0 &&
        BigInt(tx.meta.postBalances[i]) -
          BigInt(tx.meta.preBalances[i]) +
          BigInt(tx.meta.fee) >=
          BigInt(s.minimumOutput),
      "SALE_OUTPUT_MISMATCH",
      503,
    );
    return "confirmed";
  }
  return {
    setRpcKey,
    keyAddress,
    health,
    snapshot,
    snapshotAt: async (at) => {
      await mint();
      return history.snapshotAt(at);
    },
    historicalBalance: history.historicalBalance,
    balance,
    prices,
    prepareDeposit,
    signDeposit,
    depositStatus,
    broadcastSolana,
    preparePayout,
    payoutStatus,
    broadcastEvm,
    prepareSale,
    saleStatus,
  };
}
module.exports = {
  validateTargetSupply,
  createMigrationChain,
  directFetch,
  solKey,
  evmKey,
  alchemyUrl,
};
