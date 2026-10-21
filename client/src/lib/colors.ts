export const COLLABORATOR_COLORS: string[] = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Rose
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#6366F1', // Indigo
];

/**
 * Deterministically returns a hex color from the palette based on any string (e.g. user ID or name).
 */
export function getUserColor(seed?: string): string {
  if (!seed) return COLLABORATOR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

/**
 * Returns a random color from the predefined collaborator palette.
 */
export function getRandomColor(): string {
  const index = Math.floor(Math.random() * COLLABORATOR_COLORS.length);
  return COLLABORATOR_COLORS[index];
}
