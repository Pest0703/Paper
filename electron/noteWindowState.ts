export type NoteWindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
};

export function ensureVisibleNoteWindowState(
  saved: NoteWindowState | undefined,
  workAreas: Array<{ x: number; y: number; width: number; height: number }>,
): NoteWindowState {
  const fallback = { width: 1100, height: 820, maximized: false };
  if (!saved) return fallback;
  const width = Math.max(760, saved.width || 1100);
  const height = Math.max(560, saved.height || 820);
  if (saved.x == null || saved.y == null)
    return { width, height, maximized: saved.maximized };
  const visible = workAreas.some((area) => {
    const overlapX = Math.max(0, Math.min(saved.x! + width, area.x + area.width) - Math.max(saved.x!, area.x));
    const overlapY = Math.max(0, Math.min(saved.y! + height, area.y + area.height) - Math.max(saved.y!, area.y));
    return overlapX >= 120 && overlapY >= 80;
  });
  return visible
    ? { x: saved.x, y: saved.y, width, height, maximized: saved.maximized }
    : fallback;
}
