"use strict";
const { createHash } = require("node:crypto");
const { PublicKey } = require("@solana/web3.js");
const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
const PROGRAM_DATA = "CJ5WEjifs4d77pEA9DpewppByFjHcAkNv3YYSuSoDk7c";
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const HASH = "a89179ae024ac36aa5fc308251caa84cd0a3390ae66d8523514004a86d5148bb";
// Borsh discriminants from lighthouse/src/instruction.rs: pure one-account
// assertions only. MemoryWrite/Close, delta, Merkle/CPI and unknown variants
// are intentionally excluded. This is not a blanket program allowlist.
const ASSERTIONS = new Set([2, 3, 5, 6, 7, 8, 9, 10]);
const keys = ix => ix.keys.map(k => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);
const sameInstruction = (a, b) => a.programId.equals(b.programId) && a.data.equals(b.data)
  && JSON.stringify(keys(a)) === JSON.stringify(keys(b));

/** Permit only additional pure assertions; every original instruction stays exact. */
function hasOnlyLighthouseAssertions(actual, expected) {
  if (!actual.feePayer.equals(expected.feePayer) || actual.recentBlockhash !== expected.recentBlockhash) return false;
  const before = expected.compileMessage(), after = actual.compileMessage();
  const privileges = message => new Map(message.accountKeys.map((key, i) => [key.toBase58(),
    [message.isAccountSigner(i), message.isAccountWritable(i)]]));
  const original = privileges(before), received = privileges(after);
  if (original.has(LIGHTHOUSE) || received.size !== original.size + 1) return false;
  for (const [key, flags] of original) {
    if (JSON.stringify(received.get(key)) !== JSON.stringify(flags)) return false;
  }
  if (JSON.stringify(received.get(LIGHTHOUSE)) !== '[false,false]') return false;
  let index = 0, assertions = 0;
  for (const ix of actual.instructions) {
    if (ix.programId.toBase58() === LIGHTHOUSE) {
      if (++assertions > 16 || ix.data.length < 3 || ix.data.length > 512 || !ASSERTIONS.has(ix.data[0])
        || ix.keys.length !== 1 || !original.has(ix.keys[0].pubkey.toBase58())) return false;
    } else if (!expected.instructions[index] || !sameInstruction(ix, expected.instructions[index++])) return false;
  }
  return assertions > 0 && index === expected.instructions.length;
}

/** Fail closed unless the allowlisted deployed code is immutable and byte-pinned. */
async function verifyLighthouseDeployment(connection) {
  const [program, data] = await connection.getMultipleAccountsInfo([
    new PublicKey(LIGHTHOUSE), new PublicKey(PROGRAM_DATA),
  ], "finalized");
  return !!(program?.executable && program.owner.toBase58() === LOADER
    && program.data.length === 36 && program.data.readUInt32LE(0) === 2
    && new PublicKey(program.data.subarray(4, 36)).toBase58() === PROGRAM_DATA
    && data && !data.executable && data.owner.toBase58() === LOADER && data.data.length >= 45
    && data.data.readUInt32LE(0) === 3 && data.data[12] === 0
    && createHash("sha256").update(data.data.subarray(45)).digest("hex") === HASH);
}
module.exports = { LIGHTHOUSE, hasOnlyLighthouseAssertions, verifyLighthouseDeployment };
