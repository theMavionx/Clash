"use strict";
const { PublicKey } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const { check, snapshotTime, SOURCE_MINT } = require("./migration_core");

// Alchemy's historical owner index includes accounts subsequently closed or moved.
// Never enumerate today's accounts and pretend that set represents past holders.
function createMigrationHistory(rpc) {
  async function historicalBalance(owner, slot) {
    new PublicKey(owner);
    check(Number.isSafeInteger(slot) && slot > 0, "HISTORY_INVALID", 503);
    const accounts = new Set(),
      cursors = new Set();
    let pageKey,
      total = 0n;
    for (let page = 0; page < 100; page++) {
      const r = await rpc("getTokenAccountsByOwnerAtSlot", [
        owner,
        { mint: SOURCE_MINT },
        { slot, pageLimit: 1000, ...(pageKey ? { pageKey } : {}) },
      ]);
      check(r?.context?.slot === slot, "HISTORY_SLOT_MISMATCH", 503);
      check(
        Array.isArray(r.value) && r.value.length <= 1000,
        "HISTORY_INVALID",
        503,
      );
      for (const row of r.value) {
        const parsed = row.account?.data?.parsed,
          info = parsed?.info;
        check(
          typeof row.pubkey === "string" && !accounts.has(row.pubkey),
          "HISTORY_INVALID",
          503,
        );
        new PublicKey(row.pubkey);
        accounts.add(row.pubkey);
        check(
          row.account?.owner === TOKEN_2022_PROGRAM_ID.toBase58() &&
            parsed?.type === "account" &&
            info?.mint === SOURCE_MINT &&
            info.owner === owner &&
            info.tokenAmount?.decimals === 6 &&
            typeof info.tokenAmount.amount === "string" &&
            /^\d+$/.test(info.tokenAmount.amount),
          "HISTORY_INVALID",
          503,
        );
        total += BigInt(info.tokenAmount.amount);
        check(total <= 1000000000000000n, "HISTORY_INVALID", 503);
      }
      if (r.pageKey === null) return String(total);
      check(
        typeof r.pageKey === "string" &&
          r.pageKey.length > 0 &&
          r.pageKey.length < 8192 &&
          !cursors.has(r.pageKey),
        "HISTORY_INVALID",
        503,
      );
      cursors.add(r.pageKey);
      pageKey = r.pageKey;
    }
    check(false, "HISTORY_TOO_LARGE", 503);
  }

  async function snapshotAt(at) {
    const requestedAt = snapshotTime(at),
      target = Math.floor(requestedAt / 1000);
    const head = await rpc("getSlot", [{ commitment: "finalized" }]);
    const headTime = await rpc("getBlockTime", [head]);
    check(
      Number.isSafeInteger(head) && head > 0 && Number.isSafeInteger(headTime),
      "SNAPSHOT_TIME_UNAVAILABLE",
      503,
    );
    check(target < headTime, "SNAPSHOT_NOT_FINALIZED", 409);
    let low = await rpc("getFirstAvailableBlock", []),
      high = head,
      selected = null;
    check(
      Number.isSafeInteger(low) && low >= 0 && low <= high,
      "SNAPSHOT_TIME_UNAVAILABLE",
      503,
    );
    const cache = new Map();
    const blockTime = async (slot) => {
      if (!cache.has(slot)) cache.set(slot, await rpc("getBlockTime", [slot]));
      const value = cache.get(slot);
      check(Number.isSafeInteger(value), "SNAPSHOT_TIME_UNAVAILABLE", 503);
      return value;
    };
    // Search actual produced blocks: skipped slots must not shift a cutoff forward.
    for (let tries = 0; low <= high && tries < 40; tries++) {
      const mid = Math.floor((low + high) / 2);
      const blocks = await rpc("getBlocksWithLimit", [
        mid,
        1,
        { commitment: "finalized" },
      ]);
      check(
        Array.isArray(blocks) &&
          blocks.length === 1 &&
          Number.isSafeInteger(blocks[0]) &&
          blocks[0] >= mid,
        "SNAPSHOT_TIME_UNAVAILABLE",
        503,
      );
      const slot = blocks[0];
      if (slot > high) {
        high = mid - 1;
        continue;
      }
      const time = await blockTime(slot);
      if (time <= target) {
        selected = { slot, blockTime: time * 1000 };
        low = slot + 1;
      } else high = mid - 1;
    }
    check(low > high && selected?.slot > 0, "SNAPSHOT_TIME_UNAVAILABLE", 503);
    // Verify the boundary explicitly, including repeated timestamps and slot gaps.
    const next = await rpc("getBlocksWithLimit", [
      selected.slot + 1,
      1,
      { commitment: "finalized" },
    ]);
    check(
      Array.isArray(next) &&
        next.length === 1 &&
        next[0] > selected.slot &&
        next[0] <= head &&
        (await blockTime(next[0])) > target,
      "SNAPSHOT_TIME_UNAVAILABLE",
      503,
    );
    // Establish that the historical product/key actually covers this chosen slot.
    await historicalBalance("11111111111111111111111111111111", selected.slot);
    return { ...selected, requestedAt };
  }
  return { snapshotAt, historicalBalance };
}
module.exports = { createMigrationHistory };
