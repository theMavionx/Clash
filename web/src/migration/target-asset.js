import assets from '../../../shared/migration-assets.json' with { type: 'json' };

export function targetSymbol(address) {
  return typeof address === 'string' && address.toLowerCase() === assets.robinhoodUsdg.address.toLowerCase() ? 'USDG' : 'CLASH';
}

export function targetRatio(address, ratio = '1') {
  return targetSymbol(address) === 'USDG' && ratio === '0.001'
    ? '1000 CLASH = 1 USDG'
    : `1 CLASH = ${ratio} ${targetSymbol(address)}`;
}
