/**
 * Pure push-down layout algorithm for server-side use.
 * Copied from plugins/algorithm-push.ts — zero DOM dependencies.
 */

export interface ItemRect {
  id: string;
  column: number;
  row: number;
  width: number;
  height: number;
}

export interface GridCell {
  column: number;
  row: number;
}

export function itemsOverlap(a: ItemRect, b: ItemRect): boolean {
  return !(
    a.column + a.width <= b.column ||
    b.column + b.width <= a.column ||
    a.row + a.height <= b.row ||
    b.row + b.height <= a.row
  );
}

export function pushDown(
  items: ItemRect[],
  moved: ItemRect,
  movedId: string,
  depth = 0,
): void {
  if (depth > 50) return;
  const colliders = items
    .filter(
      (it) =>
        it.id !== movedId && it.id !== moved.id && itemsOverlap(moved, it),
    )
    .sort((a, b) => b.row - a.row || a.column - b.column);
  for (const collider of colliders) {
    const newRow = moved.row + moved.height;
    if (collider.row < newRow) {
      collider.row = newRow;
      pushDown(items, collider, movedId, depth + 1);
    }
  }
}

export function compactUp(items: ItemRect[], excludeId: string): void {
  const sorted = [...items]
    .filter((it) => it.id !== excludeId)
    .sort((a, b) => a.row - b.row || a.column - b.column);
  for (const item of sorted) {
    let iterations = 0;
    while (item.row > 1 && iterations < 100) {
      iterations++;
      item.row -= 1;
      const hasCollision = items.some(
        (other) => other.id !== item.id && itemsOverlap(item, other),
      );
      if (hasCollision) {
        item.row += 1;
        break;
      }
    }
  }
}

export function calculateLayout(
  items: ItemRect[],
  movedId: string,
  targetCell: GridCell,
): ItemRect[] {
  const result = items.map((item) => ({ ...item }));
  const movedItem = result.find((it) => it.id === movedId);
  if (!movedItem) return result;
  movedItem.column = targetCell.column;
  movedItem.row = targetCell.row;
  pushDown(result, movedItem, movedId);
  compactUp(result, movedId);
  return result;
}

export function layoutToCSS(
  items: ItemRect[],
  selector = '[data-egg-item="ID"]',
): string {
  return items
    .map((item) => {
      const sel = selector.replace("ID", item.id);
      return `${sel} { grid-column: ${item.column} / span ${item.width}; grid-row: ${item.row} / span ${item.height}; }`;
    })
    .join("\n");
}
