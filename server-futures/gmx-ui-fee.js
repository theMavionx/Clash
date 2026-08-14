const GMX_UI_FEE_RECEIVER = String(
  process.env.GMX_UI_FEE_RECEIVER || '0x412A02Ba415e5969596E6f0A35f9439760a3468F',
).toLowerCase();
const configuredBps = Number(process.env.GMX_UI_FEE_BPS || 1);
const GMX_UI_FEE_BPS = Number.isFinite(configuredBps) && configuredBps > 0 && configuredBps <= 10
  ? configuredBps
  : 1;
const GMX_UI_FEE_FACTOR = BigInt(Math.round(GMX_UI_FEE_BPS * 1_000_000)) * (10n ** 20n);

function hasClashGmxUiFee(action) {
  const receiver = String(action?.uiFeeReceiver || '').toLowerCase();
  let factor = 0n;
  try { factor = BigInt(action?.uiFeeFactor || 0); } catch { return false; }
  return receiver === GMX_UI_FEE_RECEIVER && factor === GMX_UI_FEE_FACTOR;
}

module.exports = {
  GMX_UI_FEE_RECEIVER,
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  hasClashGmxUiFee,
};
