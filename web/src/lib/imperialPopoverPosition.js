// Coordinates are viewport-relative because the native dialog lives in the top layer.
export function imperialPopoverPosition(anchor, viewport, contentHeight, panelWidth = 320) {
  const edge = 12;
  const gap = 6;
  const width = Math.min(300, Math.max(0, panelWidth - 16), Math.max(0, viewport.width - edge * 2));
  const left = Math.max(viewport.left + edge,
    Math.min(anchor.right - width, viewport.left + viewport.width - edge - width));
  const below = Math.max(0, viewport.top + viewport.height - edge - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - viewport.top - edge);
  const down = below >= Math.min(contentHeight, 280) || below >= above;
  const maxHeight = Math.min(640, down ? below : above);
  const height = Math.min(contentHeight, maxHeight);
  const top = Math.max(viewport.top + edge, down ? anchor.bottom + gap : anchor.top - gap - height);
  return { left, top, width, maxHeight };
}
