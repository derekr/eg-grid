// engine.ts
var plugins = /* @__PURE__ */ new Map();
function registerPlugin(plugin) {
  plugins.set(plugin.name, plugin);
}
function getItemCell(item) {
  const style = getComputedStyle(item);
  return {
    column: parseInt(style.gridColumnStart, 10) || 1,
    row: parseInt(style.gridRowStart, 10) || 1
  };
}

// plugins/pointer.ts
var HYSTERESIS = 0.4;
var TARGET_CHANGE_DEBOUNCE = 40;
var DRAG_THRESHOLD = 5;
var DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[pointer]", ...args);
}
registerPlugin({
  name: "pointer",
  init(core) {
    let pendingDrag = null;
    let dragState = null;
    const startDrag = (pending, e) => {
      const { item, pointerId, rect, startCell, colspan, rowspan } = pending;
      dragState = {
        item,
        pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        initialRect: rect,
        startCell,
        lastCell: startCell,
        lastTargetChangeTime: 0,
        colspan,
        rowspan
      };
      item.setAttribute("data-gridiot-dragging", "");
      item.style.position = "fixed";
      item.style.left = `${rect.left}px`;
      item.style.top = `${rect.top}px`;
      item.style.width = `${rect.width}px`;
      item.style.height = `${rect.height}px`;
      item.style.zIndex = "100";
      item.style.gridColumn = "";
      item.style.gridRow = "";
      log("drag-start", { startCell, rect: { left: rect.left, top: rect.top } });
      core.emit("drag-start", { item, cell: startCell, colspan, rowspan });
      pendingDrag = null;
    };
    const onPointerDown = (e) => {
      const item = e.target.closest(
        "[data-gridiot-item]"
      );
      if (!item) return;
      core.select(item);
      e.preventDefault();
      const rect = item.getBoundingClientRect();
      const startCell = getItemCell(item);
      const colspan = parseInt(item.getAttribute("data-gridiot-colspan") || "1", 10) || 1;
      const rowspan = parseInt(item.getAttribute("data-gridiot-rowspan") || "1", 10) || 1;
      pendingDrag = {
        item,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        rect,
        startCell,
        colspan,
        rowspan
      };
      item.setPointerCapture(e.pointerId);
      item.addEventListener("pointermove", onPointerMove);
      item.addEventListener("pointerup", onPointerUp);
      item.addEventListener("pointercancel", onPointerCancel);
    };
    const onPointerMove = (e) => {
      if (pendingDrag && !dragState) {
        const dx = e.clientX - pendingDrag.startX;
        const dy = e.clientY - pendingDrag.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= DRAG_THRESHOLD) {
          startDrag(pendingDrag, e);
        } else {
          return;
        }
      }
      if (!dragState) return;
      const { item, offsetX, offsetY, initialRect, colspan, rowspan } = dragState;
      const newLeft = e.clientX - offsetX;
      const newTop = e.clientY - offsetY;
      item.style.left = `${newLeft}px`;
      item.style.top = `${newTop}px`;
      const cardCenterX = newLeft + initialRect.width / 2;
      const cardCenterY = newTop + initialRect.height / 2;
      const rawCell = core.getCellFromPoint(cardCenterX, cardCenterY);
      if (rawCell) {
        const gridInfo = core.getGridInfo();
        const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
        const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);
        const cell = {
          column: Math.max(1, Math.min(maxColumn, rawCell.column)),
          row: Math.max(1, Math.min(maxRow, rawCell.row))
        };
        const now = performance.now();
        const timeSinceLastChange = now - dragState.lastTargetChangeTime;
        const cellChanged = cell.column !== dragState.lastCell.column || cell.row !== dragState.lastCell.row;
        if (cellChanged && timeSinceLastChange >= TARGET_CHANGE_DEBOUNCE) {
          const cellWidth = gridInfo.cellWidth + gridInfo.gap;
          const cellHeight = gridInfo.cellHeight + gridInfo.gap;
          const currentCellCenterX = gridInfo.rect.left + (dragState.lastCell.column - 1) * cellWidth + gridInfo.cellWidth / 2;
          const currentCellCenterY = gridInfo.rect.top + (dragState.lastCell.row - 1) * cellHeight + gridInfo.cellHeight / 2;
          const offsetFromCellX = (cardCenterX - currentCellCenterX) / cellWidth;
          const offsetFromCellY = (cardCenterY - currentCellCenterY) / cellHeight;
          const newCellIsRight = cell.column > dragState.lastCell.column;
          const newCellIsBelow = cell.row > dragState.lastCell.row;
          const cardIsRight = offsetFromCellX > 0;
          const cardIsBelow = offsetFromCellY > 0;
          const alignedX = newCellIsRight && cardIsRight || !newCellIsRight && !cardIsRight;
          const alignedY = newCellIsBelow && cardIsBelow || !newCellIsBelow && !cardIsBelow;
          const thresholdX = alignedX ? 0.5 : 0.5 + HYSTERESIS;
          const thresholdY = alignedY ? 0.5 : 0.5 + HYSTERESIS;
          const distX = Math.abs(offsetFromCellX);
          const distY = Math.abs(offsetFromCellY);
          if (distX < thresholdX && distY < thresholdY) {
            return;
          }
          log("drag-move", { cell, distX: distX.toFixed(2), distY: distY.toFixed(2) });
          dragState.lastCell = cell;
          dragState.lastTargetChangeTime = now;
          core.emit("drag-move", { item, cell, x: e.clientX, y: e.clientY, colspan, rowspan });
        }
      }
    };
    const onPointerUp = (e) => {
      const item = pendingDrag?.item || dragState?.item;
      if (!item) return;
      if (pendingDrag && !dragState) {
        log("click (no drag)");
        cleanupListeners(item, pendingDrag.pointerId);
        pendingDrag = null;
        return;
      }
      if (!dragState) return;
      const { initialRect, colspan, rowspan, lastCell } = dragState;
      const rawCell = core.getCellFromPoint(e.clientX, e.clientY);
      const firstRect = item.getBoundingClientRect();
      if (rawCell) {
        const gridInfo = core.getGridInfo();
        const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
        const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);
        const cell = {
          column: Math.max(1, Math.min(maxColumn, rawCell.column)),
          row: Math.max(1, Math.min(maxRow, rawCell.row))
        };
        log("drag-end", { cell });
        core.emit("drag-end", { item, cell, colspan, rowspan });
      } else {
        log("drag-end", { cell: lastCell, note: "using lastCell (pointer outside grid)" });
        core.emit("drag-end", { item, cell: lastCell, colspan, rowspan });
      }
      item.style.viewTransitionName = "none";
      cleanup();
      requestAnimationFrame(() => {
        const lastRect = item.getBoundingClientRect();
        const deltaX = firstRect.left - lastRect.left;
        const deltaY = firstRect.top - lastRect.top;
        log("FLIP", { delta: { x: deltaX.toFixed(0), y: deltaY.toFixed(0) } });
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          item.setAttribute("data-gridiot-dropping", "");
          const animation = item.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: "translate(0, 0)" }
            ],
            {
              duration: 200,
              easing: "cubic-bezier(0.2, 0, 0, 1)"
            }
          );
          animation.onfinish = () => {
            item.removeAttribute("data-gridiot-dropping");
            const itemId = item.style.getPropertyValue("--item-id") || item.id || item.dataset.id;
            if (itemId) {
              item.style.viewTransitionName = itemId;
            }
          };
        } else {
          const itemId = item.style.getPropertyValue("--item-id") || item.id || item.dataset.id;
          if (itemId) {
            item.style.viewTransitionName = itemId;
          }
        }
      });
    };
    const onPointerCancel = () => {
      const item = pendingDrag?.item || dragState?.item;
      if (!item) return;
      if (dragState) {
        core.emit("drag-cancel", { item });
      }
      cleanup();
    };
    const cleanupListeners = (item, pointerId) => {
      item.releasePointerCapture(pointerId);
      item.removeEventListener("pointermove", onPointerMove);
      item.removeEventListener("pointerup", onPointerUp);
      item.removeEventListener("pointercancel", onPointerCancel);
    };
    const cleanup = () => {
      if (dragState) {
        const { item, pointerId } = dragState;
        item.removeAttribute("data-gridiot-dragging");
        item.style.position = "";
        item.style.left = "";
        item.style.top = "";
        item.style.width = "";
        item.style.height = "";
        item.style.zIndex = "";
        cleanupListeners(item, pointerId);
        dragState = null;
      }
      if (pendingDrag) {
        cleanupListeners(pendingDrag.item, pendingDrag.pointerId);
        pendingDrag = null;
      }
    };
    const onDocumentPointerDown = (e) => {
      if (core.element.contains(e.target)) return;
      if (dragState) return;
      core.deselect();
    };
    core.element.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      core.element.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      cleanup();
    };
  }
});
//# sourceMappingURL=pointer.js.map
