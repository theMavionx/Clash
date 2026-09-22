import React from 'react';
import { createRoot } from 'react-dom/client';
import ClashHolderGoldTab from '../src/components/ClashHolderGoldTab';

const wallet = '0x1234567890abcdef1234567890abcdef12345678';
const status = {
  linked: true, wallet, today: { minimum_usd: 125.4, projected_gold: 5000, sample_count: 16 },
  pending_gold: 5000, claimable_now: 5000, recent: [
    { reward_day_utc: '2026-09-21', minimum_usd_micros: 125400000, reward_gold: 5000, status: 'ready' },
    { reward_day_utc: '2026-09-20', minimum_usd_micros: 50100000, reward_gold: 1000, status: 'claimed' },
  ],
};
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  if (String(input).startsWith('/api/clash-holder/rewards/')) {
    const isClaim = String(input).endsWith('/claim');
    const reward = isClaim ? { ...status, pending_gold: 0, claimable_now: 0 } : status;
    return Promise.resolve(new Response(JSON.stringify(isClaim
      ? { claimed_gold: 5000, resources: { gold: 7000, wood: 2000, ore: 2000 }, reward }
      : String(input).endsWith('/status') ? reward : { ok: true, reward }),
    { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return realFetch(input, init);
};

createRoot(document.getElementById('root')).render(<main style={{
  '--terminal-text': '#E8E9EF', '--terminal-text-secondary': '#B3B5BC', '--terminal-text-muted': '#979899',
  '--terminal-border': '#FFFFFF12', '--terminal-border-strong': '#FFFFFF33',
  '--terminal-surface': '#111112', '--terminal-surface-subtle': '#1A1B1E', '--terminal-surface-muted': '#1D1F21',
  '--terminal-surface-hover': '#393C44', '--terminal-brand': '#FF843D', '--terminal-brand-strong': '#E56527',
  '--terminal-warning': '#FFB672', '--terminal-warning-border': '#FF843D55', '--terminal-warning-soft': '#FF843D16',
  maxWidth: 600, margin: '24px auto', padding: 16, fontFamily: 'Inter, system-ui, sans-serif', color: '#E8E9EF',
}}><ClashHolderGoldTab evmAddress={wallet} sessionToken="local-preview"
  evmWallet={{ address: wallet }} onConnect={() => {}}/></main>);
