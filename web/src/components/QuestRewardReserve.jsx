import { questRewardPending } from '../lib/questRewardDelivery';

export default function QuestRewardReserve({ pending }) {
  const reward = questRewardPending(pending);
  const parts = [['gold', 'gold'], ['wood', 'wood'], ['ore', 'stone']]
    .filter(([key]) => reward[key] > 0)
    .map(([key, label]) => `${reward[key].toLocaleString()} ${label}`);
  if (!parts.length) return null;
  return (
    <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 16,
      background: 'var(--terminal-warning-soft)', border: '1px solid var(--terminal-warning-border)',
      color: 'var(--terminal-text-secondary)', fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>
      <div style={{ color: 'var(--terminal-warning)', fontWeight: 600 }}>Reward saved — storage full</div>
      <div>{parts.join(' · ')}</div>
      <div>Added automatically as you spend resources or increase storage. Nothing is lost.</div>
    </div>
  );
}
