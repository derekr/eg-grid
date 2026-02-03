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

// plugins/keyboard.ts
var DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[keyboard]", ...args);
}
registerPlugin({
  name: "keyboard",
  init(core) {
    let keyboardMode = false;
    let heldItem = null;
    const getDirection = (key) => {
      switch (key) {
        case "ArrowUp":
        case "k":
          return "up";
        case "ArrowDown":
        case "j":
          return "down";
        case "ArrowLeft":
        case "h":
          return "left";
        case "ArrowRight":
        case "l":
          return "right";
        default:
          return null;
      }
    };
    const getAdjacentCell = (cell, direction, amount = 1) => {
      switch (direction) {
        case "up":
          return { ...cell, row: Math.max(1, cell.row - amount) };
        case "down":
          return { ...cell, row: cell.row + amount };
        case "left":
          return { ...cell, column: Math.max(1, cell.column - amount) };
        case "right":
          return { ...cell, column: cell.column + amount };
      }
    };
    const findItemInDirection = (fromCell, direction, excludeItem) => {
      const items = Array.from(
        core.element.querySelectorAll("[data-gridiot-item]")
      );
      let bestItem = null;
      let bestDistance = Infinity;
      for (const item of items) {
        if (item === excludeItem) continue;
        const cell = getItemCell(item);
        let distance;
        let isInDirection;
        switch (direction) {
          case "up":
            isInDirection = cell.row < fromCell.row;
            distance = fromCell.row - cell.row + Math.abs(cell.column - fromCell.column) * 0.1;
            break;
          case "down":
            isInDirection = cell.row > fromCell.row;
            distance = cell.row - fromCell.row + Math.abs(cell.column - fromCell.column) * 0.1;
            break;
          case "left":
            isInDirection = cell.column < fromCell.column;
            distance = fromCell.column - cell.column + Math.abs(cell.row - fromCell.row) * 0.1;
            break;
          case "right":
            isInDirection = cell.column > fromCell.column;
            distance = cell.column - fromCell.column + Math.abs(cell.row - fromCell.row) * 0.1;
            break;
        }
        if (isInDirection && distance < bestDistance) {
          bestDistance = distance;
          bestItem = item;
        }
      }
      return bestItem;
    };
    const getItemSize = (item) => {
      return {
        colspan: parseInt(item.getAttribute("data-gridiot-colspan") || "1", 10) || 1,
        rowspan: parseInt(item.getAttribute("data-gridiot-rowspan") || "1", 10) || 1
      };
    };
    const onKeyDown = (e) => {
      if (e.key === "K" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        keyboardMode = !keyboardMode;
        log("keyboard mode:", keyboardMode);
        if (keyboardMode) {
          core.element.setAttribute("data-gridiot-keyboard-mode", "");
          if (!core.selectedItem) {
            const firstItem = core.element.querySelector("[data-gridiot-item]");
            if (firstItem) {
              core.select(firstItem);
            }
          }
        } else {
          core.element.removeAttribute("data-gridiot-keyboard-mode");
        }
        return;
      }
      const focused = document.activeElement;
      const focusInGrid = focused && core.element.contains(focused);
      const hasSelection = core.selectedItem !== null;
      if (!keyboardMode && !focusInGrid && !hasSelection) return;
      const selectedItem = core.selectedItem;
      const direction = getDirection(e.key);
      if (e.key === "Escape") {
        e.preventDefault();
        if (heldItem) {
          heldItem.removeAttribute("data-gridiot-dragging");
          core.emit("drag-cancel", { item: heldItem });
          heldItem = null;
        } else if (selectedItem) {
          core.deselect();
        }
        keyboardMode = false;
        core.element.removeAttribute("data-gridiot-keyboard-mode");
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (!selectedItem) return;
        e.preventDefault();
        if (heldItem) {
          const cell = getItemCell(heldItem);
          const size = getItemSize(heldItem);
          heldItem.removeAttribute("data-gridiot-dragging");
          core.emit("drag-end", { item: heldItem, cell, colspan: size.colspan, rowspan: size.rowspan });
          log("drop", { cell });
          heldItem = null;
        } else {
          heldItem = selectedItem;
          const size = getItemSize(heldItem);
          heldItem.setAttribute("data-gridiot-dragging", "");
          core.emit("drag-start", { item: heldItem, cell: getItemCell(heldItem), colspan: size.colspan, rowspan: size.rowspan });
          log("pick up");
        }
        return;
      }
      if (direction) {
        e.preventDefault();
        if (e.altKey && !e.ctrlKey && selectedItem) {
          const fromCell = getItemCell(selectedItem);
          const adjacentItem = findItemInDirection(fromCell, direction, selectedItem);
          if (adjacentItem) {
            core.select(adjacentItem);
            log("select adjacent", direction);
          }
          return;
        }
        if (!selectedItem) return;
        const currentCell = getItemCell(selectedItem);
        const itemSize = getItemSize(selectedItem);
        const gridInfo = core.getGridInfo();
        let amount = 1;
        if (e.ctrlKey || e.metaKey) {
          amount = direction === "up" || direction === "down" ? itemSize.rowspan : itemSize.colspan;
        }
        const rawCell = getAdjacentCell(currentCell, direction, amount);
        const maxColumn = Math.max(1, gridInfo.columns.length - itemSize.colspan + 1);
        const maxRow = Math.max(1, gridInfo.rows.length - itemSize.rowspan + 1);
        const targetCell = {
          column: Math.max(1, Math.min(maxColumn, rawCell.column)),
          row: Math.max(1, Math.min(maxRow, rawCell.row))
        };
        if (targetCell.column === currentCell.column && targetCell.row === currentCell.row) {
          return;
        }
        if (heldItem) {
          core.emit("drag-move", { item: heldItem, cell: targetCell, x: 0, y: 0, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
          log("move", { direction, amount, targetCell });
        } else {
          core.emit("drag-start", { item: selectedItem, cell: currentCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
          core.emit("drag-end", { item: selectedItem, cell: targetCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
          log("nudge", { direction, amount, targetCell });
        }
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      core.element.removeAttribute("data-gridiot-keyboard-mode");
    };
  }
});
//# sourceMappingURL=keyboard.js.map
