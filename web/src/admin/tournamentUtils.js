export const TOURNAMENT_DEXES = [
  'pacifica', 'avantis', 'decibel', 'dango', 'gmx', 'ostium', 'monad', 'phoenix', 'hyperliquid',
  'risex', 'nado', 'hibachi', 'grvt', 'hotstuff', 'katana', 'gmtrade', 'flash', 'lighter',
];

export const DEX_LABELS = {
  pacifica: 'Pacifica',
  avantis: 'Avantis',
  decibel: 'Decibel',
  dango: 'Dango',
  gmx: 'GMX',
  ostium: 'Ostium',
  monad: 'Perpl',
  phoenix: 'Phoenix',
  hyperliquid: 'Hyperliquid',
  risex: 'RISEx',
  nado: 'Nado',
  hibachi: 'Hibachi',
  grvt: 'GRVT',
  hotstuff: 'Hotstuff',
  katana: 'Katana',
  gmtrade: 'GMTrade',
  flash: 'Flash Trade',
  lighter: 'Lighter',
};

export const PRIZE_PRESETS = [
  { id: 'winner_take_all', label: 'Winner takes all', weights: [100] },
  { id: 'equal', label: 'Equal split', equal: true },
  { id: 'top3_balanced', label: 'Top 3: 50/30/20', weights: [50, 30, 20] },
  { id: 'top3_aggressive', label: 'Top 3: 60/25/15', weights: [60, 25, 15] },
  { id: 'top5_balanced', label: 'Top 5: 40/25/15/12/8', weights: [40, 25, 15, 12, 8] },
  { id: 'top5_aggressive', label: 'Top 5: 50/25/12/8/5', weights: [50, 25, 12, 8, 5] },
  { id: 'top10_balanced', label: 'Top 10: balanced', weights: [30, 20, 15, 10, 8, 6, 5, 3, 2, 1] },
  { id: 'top10_flatter', label: 'Top 10: flatter', weights: [25, 18, 14, 11, 9, 7, 6, 4, 3, 3] },
  { id: 'top10_long_tail', label: 'Top 10: long tail', weights: [35, 18, 12, 9, 7, 6, 5, 4, 2, 2] },
  { id: 'linear', label: 'Linear drop', linear: true },
];

export function emptyTournament(eventKind = 'standard') {
  const kind = eventKind === 'lucky_raider' ? 'lucky_raider' : 'standard';
  return {
    event_kind: kind,
    name: '',
    description: '',
    dex: 'pacifica',
    dex_scope: 'single',
    eligible_dexes: ['pacifica'],
    mode: 'individual',
    team_score_by: 'volume_usd',
    team_prize_mode: 'winner_takes_all',
    team_prize_splits: [],
    team_member_reward_by: 'volume_usd',
    attack_match_policy: 'all',
    start_at: '',
    end_at: '',
    preregistration_enabled: false,
    registration_opens_at: '',
    registration_closes_at: '',
    registration_require_twitter: false,
    gold_boost: 1,
    seeker_gold_boost: 1,
    trophy_boost: 1,
    shield_hours: '',
    freeze_trophies: true,
    min_town_hall_level: 0,
    seeker_only: false,
    sort_by: 'points',
    scoring_mode: 'live',
    daily_pool_points: 1000,
    daily_pool_enabled_at: '',
    daily_pool_award_time_utc: '00:00',
    daily_pool_growth_mode: 'pct',
    daily_pool_growth_pct: 0,
    daily_pool_overrides: {},
    points_trophy_weight: 20,
    points_volume_weight: 60,
    points_pnl_weight: 20,
    prize_currency: 'USD',
    prize_tiers: [],
    mega_config: defaultMegaConfig(false),
    reward_config: kind === 'lucky_raider' ? rewardConfigPresetLuckyRaider() : defaultRewardConfig(),
    rewards_in_cop: false,
    status: 'active',
  };
}

export function emptyLuckyRaiderEvent() {
  return {
    ...emptyTournament('lucky_raider'),
    name: 'Daily Lucky Raider',
    description: 'Daily raid lottery. Win attacks and trade volume to earn tickets.',
    dex_scope: 'all',
    eligible_dexes: [...TOURNAMENT_DEXES],
    sort_by: 'points',
    scoring_mode: 'live',
    prize_tiers: [],
    mega_config: defaultMegaConfig(false),
  };
}

export const MEGA_SECTOR_TEMPLATES = {
  whale_dolphin_shrimp: [
    { id: 'whale', name: 'Whale', min_town_hall_level: 3, min_volume_usd: 100000, min_daily_volume_usd: 0, min_trades: 1, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
    { id: 'dolphin', name: 'Dolphin', min_town_hall_level: 2, min_volume_usd: 25000, min_daily_volume_usd: 0, min_trades: 1, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
    { id: 'shrimp', name: 'Shrimp', min_town_hall_level: 1, min_volume_usd: 0, min_daily_volume_usd: 0, min_trades: 0, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
  ],
  abc: [
    { id: 'a', name: 'Sector A', min_town_hall_level: 3, min_volume_usd: 100000, min_daily_volume_usd: 0, min_trades: 1, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
    { id: 'b', name: 'Sector B', min_town_hall_level: 2, min_volume_usd: 25000, min_daily_volume_usd: 0, min_trades: 1, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
    { id: 'c', name: 'Sector C', min_town_hall_level: 1, min_volume_usd: 0, min_daily_volume_usd: 0, min_trades: 0, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: defaultRewardConfig() },
  ],
};

export function defaultMegaConfig(enabled = false, template = 'whale_dolphin_shrimp') {
  return {
    enabled: !!enabled,
    template,
    sectors: (MEGA_SECTOR_TEMPLATES[template] || MEGA_SECTOR_TEMPLATES.whale_dolphin_shrimp).map((sector) => ({
      ...sector,
      dexes: [...(sector.dexes || [])],
      prize_tiers: normalizePrizeTiers(sector.prize_tiers || []),
      reward_config: normalizeRewardConfig(sector.reward_config || {}),
    })),
  };
}

export function normalizeMegaConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const template = source.template || 'whale_dolphin_shrimp';
  const fallback = defaultMegaConfig(!!source.enabled, template);
  const sectors = Array.isArray(source.sectors) ? source.sectors : fallback.sectors;
  return {
    enabled: !!source.enabled,
    template,
    sectors: sectors.map((sector, idx) => ({
      id: String(sector.id || sector.key || `sector_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 32),
      name: String(sector.name || sector.label || `Sector ${idx + 1}`).slice(0, 40),
      description: String(sector.description || '').slice(0, 120),
      min_town_hall_level: Math.max(0, Math.floor(Number(sector.min_town_hall_level ?? sector.min_th ?? 0) || 0)),
      min_volume_usd: Math.max(0, Number(sector.min_volume_usd ?? sector.min_volume ?? 0) || 0),
      min_daily_volume_usd: Math.max(0, Number(sector.min_daily_volume_usd ?? sector.daily_volume_usd ?? sector.min_daily_volume ?? 0) || 0),
      min_trades: Math.max(0, Math.floor(Number(sector.min_trades ?? sector.min_tx ?? 0) || 0)),
      dex_scope: ['all', 'tournament', 'custom'].includes(String(sector.dex_scope || '').toLowerCase()) ? String(sector.dex_scope).toLowerCase() : 'all',
      dexes: Array.isArray(sector.dexes) ? sector.dexes.filter((dex) => TOURNAMENT_DEXES.includes(dex)) : [],
      prize_tiers: normalizePrizeTiers(sector.prize_tiers || []),
      reward_config: normalizeRewardConfig(sector.reward_config || {}),
    })).filter((sector) => sector.id && sector.name),
  };
}

export function tournamentToForm(tournament) {
  if (!tournament) return emptyTournament();
  const base = emptyTournament();
  const eligible = Array.isArray(tournament.eligible_dexes) && tournament.eligible_dexes.length
    ? tournament.eligible_dexes
    : [tournament.dex || base.dex];
  return {
    ...base,
    ...tournament,
    event_kind: tournament.event_kind === 'lucky_raider' || tournament.tournament_kind === 'lucky_raider' ? 'lucky_raider' : 'standard',
    eligible_dexes: eligible,
    dex: tournament.dex || eligible[0] || base.dex,
    dex_scope: tournament.dex_scope || (eligible.length > 1 ? 'custom' : 'single'),
    preregistration_enabled: !!tournament.preregistration_enabled,
    registration_require_twitter: !!tournament.registration_require_twitter,
    freeze_trophies: tournament.freeze_trophies !== false,
    min_town_hall_level: Math.max(0, Math.floor(Number(tournament.min_town_hall_level || 0) || 0)),
    seeker_only: !!tournament.seeker_only,
    rewards_in_cop: !!tournament.rewards_in_cop,
    shield_hours: tournament.shield_hours == null ? '' : tournament.shield_hours,
    scoring_mode: tournament.scoring_mode || 'live',
    daily_pool_enabled_at: tournament.daily_pool_enabled_at || '',
    daily_pool_award_time_utc: tournament.daily_pool_award_time_utc || '00:00',
    daily_pool_growth_mode: tournament.daily_pool_growth_mode || 'pct',
    sort_by: tournament.sort_by === 'volume_trophies_50_50' ? 'points' : (tournament.sort_by || 'points'),
    points_trophy_weight: Number(tournament.points_trophy_weight ?? tournament.points_weights?.trophies ?? 20),
    points_volume_weight: Number(tournament.points_volume_weight ?? tournament.points_weights?.volume ?? 60),
    points_pnl_weight: Number(tournament.points_pnl_weight ?? tournament.points_weights?.pnl ?? 20),
    prize_tiers: normalizePrizeTiers(tournament.prize_tiers || []),
    mega_config: normalizeMegaConfig(tournament.mega_config || {}),
    reward_config: normalizeRewardConfig(tournament.reward_config || tournament.reward_schedule || {}),
    team_prize_splits: Array.isArray(tournament.team_prize_splits) ? tournament.team_prize_splits : [],
    daily_pool_overrides: tournament.daily_pool_overrides || {},
  };
}

export function normalizeReward(raw = {}) {
  const type = ['money', 'points', 'amp', 'nft', 'custom'].includes(String(raw.type || '').toLowerCase())
    ? String(raw.type).toLowerCase()
    : 'money';
  const defaults = rewardDefaults(type);
  const reward = {
    ...defaults,
    ...raw,
    type,
    label: String(raw.label || raw.name || defaults.label).slice(0, 80),
    unit: String(raw.unit || raw.currency || defaults.unit).slice(0, 24),
    currency: String(raw.currency || raw.unit || defaults.currency || 'USD').toUpperCase().slice(0, 12),
    pool_amount: Math.max(0, Number(raw.pool_amount ?? raw.pool ?? raw.quantity ?? defaults.pool_amount) || 0),
    winners: Math.max(1, Math.min(100, Math.floor(Number(raw.winners || defaults.winners) || 1))),
    preset: raw.preset || defaults.preset,
    payouts: Array.isArray(raw.payouts) ? raw.payouts.map((p) => ({
      rank: Math.max(1, Math.floor(Number(p.rank) || 1)),
      amount: Math.max(0, Number(p.amount ?? p.amount_usd ?? p.quantity ?? 0) || 0),
    })).filter((p) => p.amount > 0) : [],
  };
  if (!reward.payouts.length && reward.pool_amount > 0) reward.payouts = buildPayouts(reward);
  return reward;
}

export function rewardDefaults(type = 'money') {
  if (type === 'points') return { type, label: 'Points', unit: 'points', pool_amount: 1000, winners: 10, preset: 'top10_balanced' };
  if (type === 'amp') return { type, label: 'AMP', unit: 'AMP', pool_amount: 1000, winners: 10, preset: 'top10_balanced' };
  if (type === 'nft') return { type, label: 'NFT reward', unit: 'NFT', pool_amount: 1, winners: 1, preset: 'winner_take_all' };
  if (type === 'custom') return { type, label: 'Custom reward', unit: 'reward', pool_amount: 100, winners: 5, preset: 'equal' };
  return { type: 'money', label: 'Cash', currency: 'USD', unit: 'USD', pool_amount: 200, winners: 5, preset: 'top5_balanced' };
}

export function defaultRewardConfig() {
  return {
    daily_pools: [],
    final_pools: [],
    lucky_daily_raider: {
      enabled: false,
      label: 'Lucky Daily Raider',
      ticket_metric: 'volume',
      volume_per_ticket_usd: 1000,
      volume_tickets_per_step: 1,
      attack_wins_per_ticket: 10,
      min_town_hall_level: 0,
      min_attack_wins: 0,
      winner_count: 1,
      max_tickets: 20,
      max_counted_attacks: 20,
      max_volume_tickets: 0,
      require_nft: false,
      required_collections: ['demon_king', 'dragon'],
      rewards: [],
      draw_time_utc: '00:05',
      manual_winners: [],
    },
  };
}

export function normalizeRewardSchedulePool(raw = {}, fallbackLabel = 'Reward pool') {
  return {
    enabled: raw.enabled !== false,
    label: String(raw.label || raw.name || fallbackLabel).slice(0, 80),
    top_n: Math.max(1, Math.min(100, Math.floor(Number(raw.top_n || raw.winners || 5) || 5))),
    rewards: (Array.isArray(raw.rewards) ? raw.rewards : []).map(normalizeReward),
    payout_preset: raw.payout_preset || raw.preset || 'custom',
    payouts: Array.isArray(raw.payouts) ? raw.payouts.map((p) => ({
      rank: Math.max(1, Math.floor(Number(p.rank) || 1)),
      amount: Math.max(0, Number(p.amount ?? p.amount_usd ?? 0) || 0),
    })).filter((p) => p.amount > 0) : [],
    metric: raw.metric || 'points',
  };
}

export function normalizeRewardConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = defaultRewardConfig();
  const lucky = source.lucky_daily_raider && typeof source.lucky_daily_raider === 'object'
    ? source.lucky_daily_raider
    : {};
  const collections = Array.isArray(lucky.required_collections)
    ? lucky.required_collections.filter((item) => ['demon_king', 'dragon'].includes(item))
    : base.lucky_daily_raider.required_collections;
  const ticketMetric = ['volume', 'attack_wins', 'attack_wins_plus_volume', 'volume_or_attack_wins', 'volume_and_attack_wins'].includes(lucky.ticket_metric)
    ? lucky.ticket_metric
    : base.lucky_daily_raider.ticket_metric;
  const maxTickets = Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_tickets || base.lucky_daily_raider.max_tickets) || 20)));
  const manualWinners = normalizeLuckyRaiderManualWinners(lucky.manual_winners ?? lucky.manual_winner_ids ?? lucky.manual_winners_text);
  return {
    daily_pools: (Array.isArray(source.daily_pools) ? source.daily_pools : []).map((pool, idx) => normalizeRewardSchedulePool(pool, `Daily pool ${idx + 1}`)),
    final_pools: (Array.isArray(source.final_pools) ? source.final_pools : []).map((pool, idx) => normalizeRewardSchedulePool(pool, `Final pool ${idx + 1}`)),
    lucky_daily_raider: {
      enabled: !!lucky.enabled,
      label: String(lucky.label || base.lucky_daily_raider.label).slice(0, 80),
      ticket_metric: ticketMetric,
      volume_per_ticket_usd: Math.max(1, Number(lucky.volume_per_ticket_usd || base.lucky_daily_raider.volume_per_ticket_usd) || 1000),
      volume_tickets_per_step: Math.max(1, Math.min(100000, Math.floor(Number(lucky.volume_tickets_per_step ?? lucky.volume_bonus_tickets_per_step ?? base.lucky_daily_raider.volume_tickets_per_step) || 1))),
      attack_wins_per_ticket: Math.max(1, Math.min(100000, Math.floor(Number(lucky.attack_wins_per_ticket || base.lucky_daily_raider.attack_wins_per_ticket) || 10))),
      min_town_hall_level: Math.max(0, Math.min(20, Math.floor(Number(lucky.min_town_hall_level ?? lucky.min_th ?? 0) || 0))),
      min_attack_wins: Math.max(0, Math.min(100000, Math.floor(Number(lucky.min_attack_wins || 0) || 0))),
      winner_count: Math.max(1, Math.min(100, Math.floor(Number(lucky.winner_count || lucky.winners || 1) || 1))),
      max_tickets: maxTickets,
      max_counted_attacks: Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_counted_attacks || lucky.max_attack_tickets || maxTickets) || maxTickets))),
      max_volume_tickets: Math.max(0, Math.min(100000, Math.floor(Number(lucky.max_volume_tickets ?? lucky.max_volume_bonus_tickets ?? base.lucky_daily_raider.max_volume_tickets) || 0))),
      require_nft: !!lucky.require_nft,
      required_collections: collections.length ? collections : ['demon_king', 'dragon'],
      rewards: (Array.isArray(lucky.rewards) ? lucky.rewards : []).map(normalizeReward),
      draw_time_utc: String(lucky.draw_time_utc || base.lucky_daily_raider.draw_time_utc).slice(0, 16),
      manual_winners: manualWinners,
    },
  };
}

export function normalizeLuckyRaiderManualWinners(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);
  const seen = new Set();
  const winners = [];
  for (const item of rawItems) {
    const raw = typeof item === 'object' && item
      ? String(item.player_id || item.id || item.name || item.wallet || item.identifier || '').trim()
      : String(item || '').trim();
    const identifier = raw.replace(/^@+/, '').trim();
    if (!identifier) continue;
    const key = identifier.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    winners.push(identifier.slice(0, 160));
    if (winners.length >= 100) break;
  }
  return winners;
}

export function rewardConfigPreset5000() {
  return normalizeRewardConfig({
    daily_pools: [{
      enabled: true,
      label: 'Daily Pool',
      top_n: 5,
      metric: 'points',
      rewards: [{ ...rewardDefaults('money'), label: 'Daily cash', pool_amount: 300, winners: 5, preset: 'top5_balanced' }],
    }],
    final_pools: [{
      enabled: true,
      label: 'Final',
      top_n: 10,
      metric: 'points',
      rewards: [
        { ...rewardDefaults('money'), label: 'Final cash', pool_amount: 1500, winners: 10, preset: 'top10_balanced' },
        { ...rewardDefaults('points'), label: 'Points', pool_amount: 1000, winners: 10, preset: 'top10_balanced' },
      ],
    }],
    lucky_daily_raider: {
      enabled: true,
      label: 'Lucky Daily Raider',
      ticket_metric: 'volume',
      volume_per_ticket_usd: 1000,
      volume_tickets_per_step: 1,
      attack_wins_per_ticket: 10,
      min_town_hall_level: 0,
      min_attack_wins: 0,
      winner_count: 1,
      max_tickets: 20,
      max_counted_attacks: 20,
      max_volume_tickets: 0,
      require_nft: true,
      required_collections: ['demon_king', 'dragon'],
      rewards: [{ ...rewardDefaults('money'), label: 'Lucky cash', pool_amount: 50, winners: 1, preset: 'winner_take_all' }],
      draw_time_utc: '00:05',
    },
  });
}

export function rewardConfigPresetLuckyRaider() {
  return normalizeRewardConfig({
    daily_pools: [],
    final_pools: [],
    lucky_daily_raider: {
      enabled: true,
      label: 'Daily Lucky Raider',
      ticket_metric: 'attack_wins_plus_volume',
      volume_per_ticket_usd: 10000,
      volume_tickets_per_step: 1,
      attack_wins_per_ticket: 1,
      min_town_hall_level: 0,
      min_attack_wins: 0,
      winner_count: 3,
      max_tickets: 55,
      max_counted_attacks: 50,
      max_volume_tickets: 5,
      require_nft: false,
      required_collections: ['demon_king', 'dragon'],
      rewards: [{ ...rewardDefaults('money'), label: 'CLASH daily prize', currency: 'CLASH', unit: 'CLASH', pool_amount: 100, winners: 3, preset: 'equal' }],
      draw_time_utc: '00:05',
    },
  });
}

export function normalizePrizeTiers(tiers = []) {
  return (Array.isArray(tiers) ? tiers : []).map((tier) => ({
    volume_usd: Math.max(0, Number(tier.volume_usd) || 0),
    rewards: (Array.isArray(tier.rewards) ? tier.rewards : []).map(normalizeReward),
  })).filter((tier) => tier.volume_usd > 0 || tier.rewards.length > 0)
    .sort((a, b) => a.volume_usd - b.volume_usd);
}

export function buildPayouts(reward) {
  const pool = Math.max(0, Number(reward.pool_amount) || 0);
  const winners = Math.max(1, Math.min(100, Math.floor(Number(reward.winners) || 1)));
  const preset = PRIZE_PRESETS.find((p) => p.id === reward.preset) || PRIZE_PRESETS[1];
  let weights = [];
  if (preset.equal) weights = Array(winners).fill(1);
  else if (preset.linear) weights = Array.from({ length: winners }, (_, i) => winners - i);
  else weights = Array.from({ length: winners }, (_, i) => Number(preset.weights?.[i] || 0));
  if (!weights.some((w) => w > 0)) weights = Array(winners).fill(1);
  const sum = weights.reduce((acc, w) => acc + Math.max(0, Number(w) || 0), 0) || 1;
  let remaining = pool;
  return weights.slice(0, winners).map((weight, index) => {
    const raw = index === winners - 1 ? remaining : pool * Math.max(0, Number(weight) || 0) / sum;
    const amount = reward.type === 'nft' ? Math.max(0, Math.round(raw)) : Math.max(0, Number(raw.toFixed(2)));
    remaining = Math.max(0, Number((remaining - amount).toFixed(2)));
    return { rank: index + 1, amount };
  }).filter((p) => p.amount > 0);
}

export function formToTournamentBody(form) {
  const eligible = form.dex_scope === 'all'
    ? TOURNAMENT_DEXES
    : form.dex_scope === 'custom'
      ? (form.eligible_dexes || []).filter((d) => TOURNAMENT_DEXES.includes(d))
      : [form.dex || 'pacifica'];
  const minTownHallLevel = Math.max(0, Math.floor(Number(form.min_town_hall_level || 0) || 0));
  const rewardConfig = normalizeRewardConfig(form.reward_config || {});
  if (form.event_kind === 'lucky_raider') {
    rewardConfig.lucky_daily_raider.min_town_hall_level = Math.max(
      Number(rewardConfig.lucky_daily_raider.min_town_hall_level || 0),
      minTownHallLevel,
    );
  }
  return {
    event_kind: form.event_kind === 'lucky_raider' ? 'lucky_raider' : 'standard',
    name: String(form.name || '').trim(),
    description: String(form.description || '').slice(0, 500),
    dex: form.dex || eligible[0] || 'pacifica',
    dex_scope: form.dex_scope || 'single',
    eligible_dexes: eligible,
    mode: form.mode || 'individual',
    team_score_by: form.team_score_by || 'volume_usd',
    team_prize_mode: form.team_prize_mode || 'winner_takes_all',
    team_prize_splits: form.team_prize_mode === 'custom_split' ? (form.team_prize_splits || []) : [],
    team_member_reward_by: form.team_member_reward_by || 'volume_usd',
    attack_match_policy: form.attack_match_policy || 'all',
    start_at: form.start_at || undefined,
    end_at: form.end_at || undefined,
    preregistration_enabled: !!form.preregistration_enabled,
    registration_opens_at: form.registration_opens_at || undefined,
    registration_closes_at: form.registration_closes_at || undefined,
    registration_require_twitter: !!form.registration_require_twitter,
    gold_boost: Number(form.gold_boost) || 1,
    seeker_gold_boost: Number(form.seeker_gold_boost) || 1,
    trophy_boost: Number(form.trophy_boost) || 1,
    shield_hours: form.shield_hours === '' || form.shield_hours == null ? null : Number(form.shield_hours),
    freeze_trophies: !!form.freeze_trophies,
    min_town_hall_level: minTownHallLevel,
    seeker_only: !!form.seeker_only,
    sort_by: form.sort_by || 'points',
    scoring_mode: form.scoring_mode || 'live',
    daily_pool_points: Math.max(1, Number(form.daily_pool_points) || 1000),
    daily_pool_enabled_at: form.daily_pool_enabled_at || undefined,
    daily_pool_award_time_utc: form.daily_pool_award_time_utc || '00:00',
    daily_pool_growth_pct: Number(form.daily_pool_growth_pct) || 0,
    daily_pool_overrides: form.daily_pool_overrides || {},
    points_trophy_weight: Number(form.points_trophy_weight) || 0,
    points_volume_weight: Number(form.points_volume_weight) || 0,
    points_pnl_weight: Number(form.points_pnl_weight) || 0,
    prize_currency: String(form.prize_currency || 'USD').toUpperCase(),
    prize_tiers: form.event_kind === 'lucky_raider' ? [] : normalizePrizeTiers(form.prize_tiers || []),
    mega_config: form.event_kind === 'lucky_raider' ? defaultMegaConfig(false) : normalizeMegaConfig(form.mega_config || {}),
    reward_config: rewardConfig,
    rewards_in_cop: !!form.rewards_in_cop,
    status: form.status || 'active',
  };
}

export function validateTournamentStep(step, form) {
  const errors = [];
  if (step === 0) {
    if (!String(form.name || '').trim()) errors.push('Tournament name is required.');
    if (!form.start_at) errors.push('Start time is required.');
    if (!form.end_at) errors.push('End time is required for operational clarity.');
    if (form.start_at && form.end_at && new Date(form.end_at) <= new Date(form.start_at)) {
      errors.push('End time must be after start time.');
    }
  }
  if (step === 1) {
    const eligible = form.dex_scope === 'all' ? TOURNAMENT_DEXES : form.dex_scope === 'custom' ? form.eligible_dexes : [form.dex];
    if (!eligible?.length) errors.push('Pick at least one eligible DEX.');
    if (form.mode === 'dex_vs_dex' && eligible.length < 2) errors.push('DEX vs DEX needs at least two DEXes.');
    if (form.team_prize_mode === 'custom_split') {
      const total = (form.team_prize_splits || []).reduce((sum, row) => sum + Number(row.share_pct || 0), 0);
      if (Math.abs(total - 100) > 0.01) errors.push(`Team prize split must total 100%. Current total is ${total.toFixed(2)}%.`);
    }
    const mega = normalizeMegaConfig(form.mega_config || {});
    if (mega.enabled) {
      for (const sector of mega.sectors) {
        if (sector.dex_scope === 'custom' && !sector.dexes.length) {
          errors.push(`Mega sector "${sector.name}" needs at least one custom DEX.`);
        }
      }
    }
  }
  if (step === 2) {
    const needsPoints = form.scoring_mode === 'daily_pool' || form.sort_by === 'points' || form.mode === 'dex_vs_dex';
    const total = Number(form.points_trophy_weight || 0) + Number(form.points_volume_weight || 0) + Number(form.points_pnl_weight || 0);
    if (needsPoints && Math.abs(total - 100) > 0.001) errors.push(`Point weights must total 100%. Current total is ${total}%.`);
  }
  if (step === 3) {
    for (const tier of form.prize_tiers || []) {
      for (const reward of tier.rewards || []) {
        const payoutSum = (reward.payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        if (payoutSum > Number(reward.pool_amount || 0) + 0.01) {
          errors.push(`Reward "${reward.label}" payouts exceed its pool.`);
        }
      }
    }
    const rewardConfig = normalizeRewardConfig(form.reward_config || {});
    for (const pool of [...rewardConfig.daily_pools, ...rewardConfig.final_pools]) {
      for (const reward of pool.rewards || []) {
        const payoutSum = (reward.payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        if (payoutSum > Number(reward.pool_amount || 0) + 0.01) {
          errors.push(`Reward schedule "${pool.label}" payouts exceed "${reward.label}" pool.`);
        }
      }
    }
  }
  return errors;
}

export function fmtUsd(value, maxDigits = 0) {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

export function fmtTime(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString();
}
