// Spawns DOM <img> elements at the screen centre and animates them along the
// same two-phase trajectory Godot uses for in-game resource collection
// (bs_production.gd::_spawn_collection_flying_icon):
//   1. POP — icon expands from scale 0 to 1.5 then back to 1, drifting to a
//      random nearby point with an upward bias (~0.30s)
//   2. FLY — icon glides to the matching HUD bar with a sine ease-in,
//      fading the last 20% (~0.65s)
//
// Pure DOM + Web Animations API; no React state. Used after a shop purchase
// so the player visually sees gold/wood/ore "land" in the HUD instead of
// just watching the counter tick.

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ICONS = { gold: goldIcon, wood: woodIcon, ore: stoneIcon };

// Tuned to feel like Godot's collect animation. Total per-icon duration is
// pop + fly ≈ 0.95s, but the inter-icon stagger spreads the volley across
// ~0.4s per resource type so the burst reads as a stream, not a flash.
const POP_DUR_MS  = 300;     // Godot uses 0.25s + random 0..0.1
const FLY_DUR_MS  = 650;     // Godot uses 0.5s + random 0..0.2
const STAGGER_MS  = 50;      // Godot uses 40ms; bumped slightly so a 10-icon
                             // burst spans ~500ms which reads cleaner on a UI
                             // overlay than the in-game version.
const PER_RESOURCE = 10;     // Godot spawns 10 icons per collection event
const ICON_SIZE_PX = 56;     // Godot uses 56x56

export function flyResourcesToBars(rewards, options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!rewards || typeof rewards !== 'object') return;

  const freshPositions = window.__clashPublishResourceIconPositions?.();
  const targets = freshPositions?.css || window.__clashResourceBarPositionsCss || null;
  if (!targets) return;

  const perResource = Math.max(1, Math.min(20, options.count ?? PER_RESOURCE));
  const popDur = options.popDur ?? POP_DUR_MS;
  const flyDur = options.flyDur ?? FLY_DUR_MS;
  const stagger = options.stagger ?? STAGGER_MS;
  const iconSize = options.iconSize ?? ICON_SIZE_PX;

  const originX = options.originX ?? window.innerWidth / 2;
  const originY = options.originY ?? window.innerHeight / 2;

  const layer = ensureLayer();
  const keys = Object.keys(rewards).filter(
    (k) => ICONS[k] && Number(rewards[k]) > 0 && targets[k],
  );

  let groupIdx = 0;
  for (const key of keys) {
    const target = targets[key];
    for (let i = 0; i < perResource; i++) {
      spawnFlyer({
        layer,
        src: ICONS[key],
        from: { x: originX, y: originY },
        to: { x: target.x, y: target.y },
        delay: groupIdx * 60 + i * stagger,
        popDur,
        flyDur,
        iconSize,
      });
    }
    groupIdx++;
  }
}

function ensureLayer() {
  let layer = document.getElementById('clash-resource-fly-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'clash-resource-fly-layer';
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '9999',
  });
  document.body.appendChild(layer);
  return layer;
}

function spawnFlyer({ layer, src, from, to, delay, popDur, flyDur, iconSize }) {
  const half = iconSize / 2;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  Object.assign(img.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${iconSize}px`,
    height: `${iconSize}px`,
    objectFit: 'contain',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.55))',
    transform: `translate(${from.x - half}px, ${from.y - half}px) scale(0)`,
    opacity: '0',
    willChange: 'transform, opacity',
  });
  layer.appendChild(img);

  // POP target: small drift outward + upward bias, exactly like Godot
  // (random_offset: x ∈ [-90, 90], y ∈ [-110, -50]).
  const popDx = (Math.random() * 180 - 90);
  const popDy = -(50 + Math.random() * 60);
  const popX = from.x + popDx;
  const popY = from.y + popDy;

  // Phase 1: POP — expand to scale 1.5 mid-pop, settle at 1, drift to (popX, popY).
  const popAnim = img.animate(
    [
      {
        transform: `translate(${from.x - half}px, ${from.y - half}px) scale(0)`,
        opacity: 0,
        offset: 0,
      },
      {
        transform: `translate(${(from.x + popX) / 2 - half}px, ${(from.y + popY) / 2 - half}px) scale(1.5)`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate(${popX - half}px, ${popY - half}px) scale(1)`,
        opacity: 1,
        offset: 1,
      },
    ],
    {
      duration: popDur,
      delay,
      easing: 'cubic-bezier(0.22, 1.0, 0.36, 1)', // ease-out, like TRANS_QUAD EASE_OUT
      fill: 'forwards',
    },
  );

  // Phase 2: FLY — glide to the HUD bar with sine ease-in, fade tail.
  popAnim.onfinish = () => {
    const flyAnim = img.animate(
      [
        {
          transform: `translate(${popX - half}px, ${popY - half}px) scale(1)`,
          opacity: 1,
          offset: 0,
        },
        {
          transform: `translate(${(popX + to.x) / 2 - half}px, ${(popY + to.y) / 2 - half}px) scale(1)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${to.x - half}px, ${to.y - half}px) scale(0.7)`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration: flyDur,
        // Sine ease-in: gentle start, accelerates into the bar — matches
        // Godot's TRANS_SINE EASE_IN. CSS doesn't expose sine directly so
        // a cubic-bezier approximation is used.
        easing: 'cubic-bezier(0.47, 0.0, 0.745, 0.715)',
        fill: 'forwards',
      },
    );
    flyAnim.onfinish = () => img.remove();
    flyAnim.oncancel = () => img.remove();
  };
  popAnim.oncancel = () => img.remove();
}
