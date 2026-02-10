// plugins/algorithm-push-core.ts
function itemsOverlap(a, b) {
  return !(a.column + a.width <= b.column || b.column + b.width <= a.column || a.row + a.height <= b.row || b.row + b.height <= a.row);
}
function findOverlaps(items) {
  const overlaps = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsOverlap(items[i], items[j])) {
        overlaps.push([items[i], items[j]]);
      }
    }
  }
  return overlaps;
}
function pushDown(items, moved, movedId, depth = 0) {
  if (depth > 50) {
    return;
  }
  const colliders = items.filter((it) => it.id !== movedId && it.id !== moved.id && itemsOverlap(moved, it)).sort((a, b) => b.row - a.row || a.column - b.column);
  for (const collider of colliders) {
    const newRow = moved.row + moved.height;
    if (collider.row < newRow) {
      collider.row = newRow;
      pushDown(items, collider, movedId, depth + 1);
    }
  }
}
function compactUp(items, excludeId) {
  const sorted = [...items].filter((it) => it.id !== excludeId).sort((a, b) => a.row - b.row || a.column - b.column);
  for (const item of sorted) {
    let iterations = 0;
    while (item.row > 1 && iterations < 100) {
      iterations++;
      item.row -= 1;
      const hasCollision = items.some(
        (other) => other.id !== item.id && itemsOverlap(item, other)
      );
      if (hasCollision) {
        item.row += 1;
        break;
      }
    }
  }
}
function calculateLayout(items, movedId, targetCell) {
  const result = items.map((item) => ({ ...item }));
  const movedItem = result.find((it) => it.id === movedId);
  if (!movedItem) return result;
  movedItem.column = targetCell.column;
  movedItem.row = targetCell.row;
  pushDown(result, movedItem, movedId);
  compactUp(result, movedId);
  return result;
}
function layoutToCSS(items, options = {}) {
  const {
    selectorPrefix = "#",
    selectorSuffix = "",
    excludeSelector = "",
    maxColumns
  } = options;
  const rules = [];
  for (const item of items) {
    const width = maxColumns ? Math.min(item.width, maxColumns) : item.width;
    const selector = `${selectorPrefix}${item.id}${selectorSuffix}${excludeSelector}`;
    const gridColumn = `${item.column} / span ${width}`;
    const gridRow = `${item.row} / span ${item.height}`;
    rules.push(`${selector} { grid-column: ${gridColumn}; grid-row: ${gridRow}; }`);
  }
  return rules.join("\n");
}

// plugins/algorithm-push.ts
var DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[algorithm-push]", ...args);
}
function readItemsFromDOM(container) {
  const elements = container.querySelectorAll("[data-gridiot-item]");
  return Array.from(elements).map((el) => {
    const element = el;
    const style = getComputedStyle(element);
    const column = parseInt(style.gridColumnStart, 10) || 1;
    const row = parseInt(style.gridRowStart, 10) || 1;
    const width = parseInt(element.getAttribute("data-gridiot-colspan") || "1", 10) || 1;
    const height = parseInt(element.getAttribute("data-gridiot-rowspan") || "1", 10) || 1;
    const id = element.dataset.id || element.dataset.gridiotItem || "";
    return { id, column, row, width, height };
  });
}
function attachPushAlgorithm(gridElement, options = {}) {
  const { styleElement, selectorPrefix = "#", selectorSuffix = "" } = options;
  let originalPositions = null;
  let draggedItemId = null;
  let draggedElement = null;
  let layoutVersion = 0;
  function getItemId(element) {
    return element.dataset.id || element.dataset.gridiotItem || "";
  }
  function setItemCell(item, cell) {
    const colspan = parseInt(item.getAttribute("data-gridiot-colspan") || "1", 10) || 1;
    const rowspan = parseInt(item.getAttribute("data-gridiot-rowspan") || "1", 10) || 1;
    const colValue = `${cell.column} / span ${colspan}`;
    const rowValue = `${cell.row} / span ${rowspan}`;
    log("setItemCell", { id: getItemId(item), colValue, rowValue });
    item.style.gridColumn = colValue;
    item.style.gridRow = rowValue;
  }
  function applyLayout(layout, excludeId, useViewTransition) {
    const thisVersion = ++layoutVersion;
    const applyChanges = () => {
      if (thisVersion !== layoutVersion) {
        return;
      }
      if (styleElement) {
        const itemsToStyle = excludeId ? layout.filter((item) => item.id !== excludeId) : layout;
        const css = layoutToCSS(itemsToStyle, {
          selectorPrefix,
          selectorSuffix
        });
        styleElement.textContent = css;
        const elements = gridElement.querySelectorAll("[data-gridiot-item]");
        for (const el of elements) {
          const element = el;
          const id = getItemId(element);
          if (id !== excludeId) {
            element.style.gridColumn = "";
            element.style.gridRow = "";
          }
        }
      } else {
        const elements = gridElement.querySelectorAll("[data-gridiot-item]");
        for (const el of elements) {
          const element = el;
          const id = getItemId(element);
          if (id === excludeId) continue;
          const item = layout.find((it) => it.id === id);
          if (item) {
            setItemCell(element, { column: item.column, row: item.row });
          }
        }
      }
    };
    if (useViewTransition && "startViewTransition" in document) {
      log("starting view transition, excludeId:", excludeId);
      if (draggedElement && excludeId) {
        draggedElement.style.viewTransitionName = "dragging";
      }
      document.startViewTransition(applyChanges);
    } else {
      log("applying without view transition");
      applyChanges();
    }
  }
  const onDragStart = (e) => {
    const detail = e.detail;
    draggedElement = detail.item;
    draggedItemId = getItemId(detail.item);
    const items = readItemsFromDOM(gridElement);
    originalPositions = /* @__PURE__ */ new Map();
    for (const item of items) {
      originalPositions.set(item.id, { column: item.column, row: item.row });
    }
    if (styleElement) {
      const elements = gridElement.querySelectorAll("[data-gridiot-item]");
      for (const el of elements) {
        const element = el;
        if (element !== draggedElement) {
          element.style.gridColumn = "";
          element.style.gridRow = "";
        }
      }
      const css = layoutToCSS(items, { selectorPrefix, selectorSuffix });
      styleElement.textContent = css;
    }
    log("drag-start", {
      item: draggedItemId,
      positions: Array.from(originalPositions.entries())
    });
  };
  const onDragMove = (e) => {
    if (!draggedItemId || !originalPositions) return;
    const detail = e.detail;
    const items = readItemsFromDOM(gridElement).map((item) => {
      const original = originalPositions.get(item.id);
      if (original && item.id !== draggedItemId) {
        return { ...item, column: original.column, row: original.row };
      }
      return item;
    });
    log("drag-move", { targetCell: detail.cell });
    const newLayout = calculateLayout(items, draggedItemId, detail.cell);
    log(
      "calculated layout",
      newLayout.map((it) => ({ id: it.id, col: it.column, row: it.row }))
    );
    applyLayout(newLayout, draggedItemId, true);
  };
  const onDragEnd = (e) => {
    if (!draggedItemId || !originalPositions) return;
    const detail = e.detail;
    log("drag-end", { finalCell: detail.cell });
    const items = readItemsFromDOM(gridElement).map((item) => {
      const original = originalPositions.get(item.id);
      if (original && item.id !== draggedItemId) {
        return { ...item, column: original.column, row: original.row };
      }
      return item;
    });
    const finalLayout = calculateLayout(items, draggedItemId, detail.cell);
    log(
      "final layout",
      finalLayout.map((it) => ({ id: it.id, col: it.column, row: it.row }))
    );
    const isPointerDrag = draggedElement?.style.position === "fixed";
    log("drag-end isPointerDrag:", isPointerDrag, "position:", draggedElement?.style.position);
    if (draggedElement && draggedElement.style.viewTransitionName === "dragging") {
      draggedElement.style.viewTransitionName = "";
    }
    const useViewTransition = !isPointerDrag;
    log("drag-end useViewTransition:", useViewTransition);
    applyLayout(finalLayout, null, useViewTransition);
    draggedItemId = null;
    draggedElement = null;
    originalPositions = null;
  };
  const onDragCancel = () => {
    if (!draggedItemId || !originalPositions) return;
    if (draggedElement && draggedElement.style.viewTransitionName === "dragging") {
      draggedElement.style.viewTransitionName = "";
    }
    const restoreLayout = readItemsFromDOM(gridElement).map(
      (item) => {
        const original = originalPositions.get(item.id);
        if (original) {
          return { ...item, column: original.column, row: original.row };
        }
        return item;
      }
    );
    const restore = () => {
      applyLayout(restoreLayout, null, false);
    };
    if ("startViewTransition" in document) {
      document.startViewTransition(restore);
    } else {
      restore();
    }
    draggedItemId = null;
    draggedElement = null;
    originalPositions = null;
  };
  gridElement.addEventListener("gridiot:drag-start", onDragStart);
  gridElement.addEventListener("gridiot:drag-move", onDragMove);
  gridElement.addEventListener("gridiot:drag-end", onDragEnd);
  gridElement.addEventListener("gridiot:drag-cancel", onDragCancel);
  return () => {
    gridElement.removeEventListener("gridiot:drag-start", onDragStart);
    gridElement.removeEventListener("gridiot:drag-move", onDragMove);
    gridElement.removeEventListener("gridiot:drag-end", onDragEnd);
    gridElement.removeEventListener("gridiot:drag-cancel", onDragCancel);
  };
}
export {
  attachPushAlgorithm,
  calculateLayout,
  compactUp,
  findOverlaps,
  itemsOverlap,
  layoutToCSS,
  pushDown,
  readItemsFromDOM
};
//# sourceMappingURL=algorithm-push.js.map
