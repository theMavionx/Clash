import { useEffect, useMemo, useState } from 'react';

export default function useHydratedNftPlayer(player) {
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);
  const [hydrated, setHydrated] = useState(null);

  useEffect(() => {
    if (!token) {
      setHydrated(null);
      return undefined;
    }
    const controller = new AbortController();
    fetch('/api/players/me', {
      cache: 'no-store',
      headers: { 'x-token': token },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!controller.signal.aborted) setHydrated(json && json.id ? json : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHydrated(null);
      });
    return () => controller.abort();
  }, [token]);

  return useMemo(() => {
    if (!hydrated) return player;
    return {
      ...(player || {}),
      wallets: Array.isArray(hydrated.wallets) ? hydrated.wallets : player?.wallets,
      dex_accounts: Array.isArray(hydrated.dex_accounts) ? hydrated.dex_accounts : player?.dex_accounts,
      nft_gold_boost_wallet: hydrated.nft_gold_boost_wallet || player?.nft_gold_boost_wallet || null,
    };
  }, [hydrated, player]);
}
