function panelAnchor(work, anchor, overflow) {
  const corner = { x: work.x + work.width - 24, y: work.y + work.height, width: 16, height: 0 };
  if (!anchor?.width) return corner;
  if (anchor.strip) return anchor;
  const center = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const inside = rect => rect && center.x >= rect.x && center.x < rect.x + rect.width && center.y >= rect.y && center.y < rect.y + rect.height;
  // Overflow icon coordinates stay cached after Explorer closes its flyout.
  if (inside(overflow)) return anchor;
  return inside(work) ? corner : anchor;
}

module.exports = { panelAnchor };
