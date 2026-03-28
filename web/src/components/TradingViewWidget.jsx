import React, { memo } from 'react';

function TradingViewWidget() {
  return (
    <iframe
      title="TradingView Chart"
      src="https://s.tradingview.com/widgetembed/?symbol=BINANCE%3ABTCUSDT.P&interval=15&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=fdf8e7&studies=%5B%5D&theme=light&style=1&timezone=Etc%2FUTC&locale=en"
      width="100%"
      height="100%"
      style={{ border: 'none', borderRadius: '8px' }}
      scrolling="no"
      allowtransparency="true"
      credentialless="true"
    />
  );
}

export default memo(TradingViewWidget);
