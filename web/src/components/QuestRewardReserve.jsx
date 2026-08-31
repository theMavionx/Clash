import { questRewardPending } from '../lib/questRewardDelivery';

export default function QuestRewardReserve({ pending }) {
  const reward = questRewardPending(pending);
  const parts = [['gold', 'gold'], ['wood', 'wood'], ['ore', 'stone']]
    .filter(([key]) => reward[key] > 0)
    .map(([key, label]) => `${reward[key].toLocaleString()} ${label}`);
  if (!parts.length) return null;
  return (
    <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10,
      background: 'rgba(245, 178, 62, 0.10)', border: '1px solid rgba(245, 178, 62, 0.28)',
      color: '#e9d7ad', fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ color: '#ffd477', fontWeight: 700 }}>Reward saved — storage full</div>
      <div>{parts.join(' · ')}</div>
      <div>Added automatically as you spend resources or increase storage. Nothing is lost.</div>
    </div>
  );
}
