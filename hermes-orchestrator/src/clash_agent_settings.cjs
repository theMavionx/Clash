const DEFAULT_MODEL_CHAIN = [
  'google/gemma-4-26b-a4b-it:free',
  'minimax/minimax-m2.5:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

function parseModelChain(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function resolveModelChain(env = process.env) {
  const explicitChain = parseModelChain(env.CLASH_HERMES_MODEL_CHAIN);
  if (explicitChain.length) return unique(explicitChain);

  const legacyChain = unique([
    ...parseModelChain(env.CLASH_HERMES_PRIMARY_MODEL),
    ...parseModelChain(env.CLASH_HERMES_FALLBACK_MODEL),
  ]);
  if (legacyChain.length) return legacyChain;

  return DEFAULT_MODEL_CHAIN;
}

module.exports = {
  DEFAULT_MODEL_CHAIN,
  parseModelChain,
  resolveModelChain,
};
