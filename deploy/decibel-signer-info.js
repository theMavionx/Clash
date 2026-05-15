// One-shot diag: prints the public address derived from
// DECIBEL_API_WALLET_PRIVATE_KEY plus on-chain APT balance for that address.
// Never logs or echoes the private key.
//
// Usage on prod:
//   sudo bash -c 'set -a; source /opt/clash/shared/.env; set +a; \
//     node /tmp/decibel-signer-info.js'

(async () => {
  const raw = String(
    process.env.DECIBEL_API_WALLET_PRIVATE_KEY
    || process.env.API_WALLET_PRIVATE_KEY
    || '',
  ).trim();
  if (!raw) {
    console.error('DECIBEL_API_WALLET_PRIVATE_KEY is not set in env');
    process.exit(1);
  }

  const sdkPath = '/opt/clash/current/server-futures/node_modules/@aptos-labs/ts-sdk';
  const { Account, Ed25519PrivateKey } = require(sdkPath);
  const account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(raw) });
  const address = account.accountAddress.toString();

  // Pull APT balance via FA primary store (legacy CoinStore is empty on
  // post-FA-migration accounts, returns resource_not_found).
  const apiKey = process.env.APTOS_NODE_API_KEY || process.env.DECIBEL_API_KEY;
  const r = await fetch('https://api.mainnet.aptoslabs.com/v1/view', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      function: '0x1::primary_fungible_store::balance',
      type_arguments: ['0x1::object::ObjectCore'],
      arguments: [address, '0xa'],
    }),
  });
  let aptOcta = null;
  if (r.ok) {
    const j = await r.json();
    if (Array.isArray(j) && j[0] != null) aptOcta = BigInt(j[0]);
  } else {
    console.error('balance fetch failed:', r.status, await r.text());
  }

  console.log('=== Decibel server signer ===');
  console.log('Address:', address);
  if (aptOcta != null) {
    const apt = Number(aptOcta) / 1e8;
    console.log('APT balance (FA):', apt, '(raw octas:', aptOcta.toString() + ')');
  }
})().catch((e) => { console.error('FAIL:', e?.message || e); process.exit(2); });
