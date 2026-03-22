export const colors = {
  gold: '#FFD700',
  goldDark: '#C59600',
  wood: '#4CAF50',
  woodDark: '#2E7D32',
  ore: '#9C27B0',
  oreDark: '#6A1B9A',
  red: '#E53935',
  green: '#43A047',
  blue: '#1E88E5',
  brown: '#5D4037',
  cream: '#FFF8E1',
  text: '#FFFFFF',
  shadow: 'rgba(0,0,0,0.35)',
};

// Cartoon-style button with 3D effect
export const cartoonBtn = (bg, border) => ({
  padding: '12px 24px',
  borderRadius: 16,
  border: `3px solid ${border}`,
  background: `linear-gradient(180deg, ${bg} 0%, ${border} 100%)`,
  color: '#fff',
  fontSize: 18,
  fontWeight: 900,
  cursor: 'pointer',
  textShadow: '0 2px 0 rgba(0,0,0,0.3)',
  boxShadow: `0 4px 0 ${border}, 0 6px 12px rgba(0,0,0,0.3)`,
  letterSpacing: 0.5,
  transition: 'transform 0.1s, box-shadow 0.1s',
  userSelect: 'none',
});

export const cartoonPanel = {
  background: 'linear-gradient(180deg, #3E2723 0%, #2C1B0E 100%)',
  border: '3px solid #6D4C2A',
  borderRadius: 20,
  padding: 16,
  boxShadow: '0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
};
