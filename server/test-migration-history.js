"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { Keypair } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const { createMigrationHistory } = require("./migration_history");
const { SOURCE_MINT, snapshotTime } = require("./migration_core");
const owner = Keypair.generate().publicKey.toBase58();
const row = (amount = "1000000") => ({
  pubkey: Keypair.generate().publicKey.toBase58(),
  account: {
    owner: TOKEN_2022_PROGRAM_ID.toBase58(),
    data: {
      parsed: {
        type: "account",
        info: {
          owner,
          mint: SOURCE_MINT,
          tokenAmount: { amount, decimals: 6 },
        },
      },
    },
  },
});
test("UTC cutoff accepts exact UTC and rejects ambiguous/invalid calendar times", () => {
  assert.equal(
    snapshotTime("2026-09-20T13:45:00Z"),
    Date.UTC(2026, 8, 20, 13, 45),
  );
  for (const value of [
    "2026-09-20T13:45",
    "2026-09-20T13:45:00+03:00",
    "2026-02-30T00:00:00Z",
    "bad",
    1,
  ])
    assert.throws(() => snapshotTime(value), /INVALID_SNAPSHOT_TIME/);
});
test("cutoff resolves last produced finalized block with skipped slots and repeated timestamps", async () => {
  const base = Date.UTC(2026, 8, 20) / 1000;
  const blocks = Array.from({ length: 21 }, (_, i) => 100 + i).filter(
    (x) => ![104, 109, 110].includes(x),
  );
  const rpc = async (method, args) => {
    if (method === "getSlot") return 120;
    if (method === "getFirstAvailableBlock") return 100;
    if (method === "getBlockTime")
      return base + Math.floor((args[0] - 100) / 3);
    if (method === "getBlocksWithLimit")
      return blocks.filter((x) => x >= args[0]).slice(0, 1);
    if (method === "getTokenAccountsByOwnerAtSlot")
      return { context: { slot: args[2].slot }, value: [], pageKey: null };
    throw Error(method);
  };
  const reader = createMigrationHistory(rpc);
  const result = await reader.snapshotAt("2026-09-20T00:00:02.999Z");
  assert.equal(result.slot, 108);
  assert.equal(result.blockTime, (base + 2) * 1000);
  await assert.rejects(
    reader.snapshotAt("2026-09-20T00:00:06.000Z"),
    /SNAPSHOT_NOT_FINALIZED/,
  );
  await assert.rejects(
    reader.snapshotAt("2026-09-19T23:59:59Z"),
    /SNAPSHOT_TIME_UNAVAILABLE/,
  );
});
test("historical balance uses complete owner index including accounts no longer present", async () => {
  let calls = 0;
  const reader = createMigrationHistory(async (method, args) => {
    assert.equal(method, "getTokenAccountsByOwnerAtSlot");
    assert.deepEqual(args[1], { mint: SOURCE_MINT });
    assert.equal(args[2].slot, 123);
    calls++;
    return {
      context: { slot: 123 },
      value: [row(calls === 1 ? "123456789" : "11")],
      pageKey: calls === 1 ? "second" : null,
    };
  });
  assert.equal(await reader.historicalBalance(owner, 123), "123456800");
  assert.equal(calls, 2);
});
test("historical validation rejects wrong slot, owner, mint, decimals and incomplete/duplicate pages", async () => {
  for (const mutate of [
    (r) => {
      r.context.slot++;
    },
    (r) => {
      r.value[0].account.data.parsed.info.owner = SOURCE_MINT;
    },
    (r) => {
      r.value[0].account.data.parsed.info.mint = owner;
    },
    (r) => {
      r.value[0].account.data.parsed.info.tokenAmount.decimals = 9;
    },
    (r) => {
      r.value[0].account.data.parsed.info.tokenAmount.amount = "1.5";
    },
    (r) => {
      delete r.pageKey;
    },
    (r) => {
      r.value.push(r.value[0]);
    },
  ]) {
    const payload = { context: { slot: 123 }, value: [row()], pageKey: null };
    mutate(payload);
    await assert.rejects(
      createMigrationHistory(async () => payload).historicalBalance(owner, 123),
      /HISTORY_/,
    );
  }
  await assert.rejects(
    createMigrationHistory(async () => ({
      context: { slot: 123 },
      value: [],
      pageKey: "loop",
    })).historicalBalance(owner, 123),
    /HISTORY_INVALID/,
  );
});
