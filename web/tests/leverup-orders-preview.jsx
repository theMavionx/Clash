import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BasicTradeFlow from '../src/components/basic/BasicTradeFlow';
import { buildLeverupOpenAmounts } from '../src/lib/leverupOrderAmounts';

function Preview() {
  const [result, setResult] = useState(null);
  async function capture(symbol, side, margin, slippage, leverage) {
    const amounts = buildLeverupOpenAmounts({ margin, leverage, price: 100000, feeRate: '0.0004', slippage, isLong: side === 'long' });
    setResult(JSON.stringify({ symbol, side, margin, leverage, ...amounts }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    return { success: true };
  }
  return <main style={{ maxWidth: 420, margin: 'auto', fontFamily: 'sans-serif' }}>
    <p>Local Basic UI test — no wallet, signatures or order submissions.</p>
    <div style={{ height: 660, display: 'flex' }}><BasicTradeFlow dex="leverup"
      markets={[{ symbol: 'BTC', max_leverage: 100, lot_size: 1e-10, price_decimals: 2 }]}
      prices={[{ symbol: 'BTC', mark: '100000' }]} account={{ usdc: 100 }} walletUsdc={100}
      placeMarketOrder={capture} /></div>
    <pre role="status" style={{ whiteSpace: 'pre-wrap' }}>{result || 'Waiting for confirmation'}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
