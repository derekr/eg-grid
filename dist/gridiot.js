// engine.ts
var plugins = /* @__PURE__ */ new Map();
function registerPlugin(plugin) {
  plugins.set(plugin.name, plugin);
}
function getPlugin(name) {
  return plugins.get(name);
}
function init(element, options = {}) {
  const {
    layoutModel,
    styleElement,
    plugins: pluginOptions = {},
    disablePlugins = []
  } = options;
  const cleanups = [];
  let selectedItem = null;
  const providerMap = /* @__PURE__ */ new Map();
  const providers = {
    register(capability, provider) {
      if (providerMap.has(capability)) {
        console.warn(
          `Gridiot: Provider for "${capability}" already registered, overwriting`
        );
      }
      providerMap.set(capability, provider);
    },
    get(capability) {
      const provider = providerMap.get(capability);
      return provider ? provider() : void 0;
    },
    has(capability) {
      return providerMap.has(capability);
    }
  };
  const core = {
    element,
    providers,
    // Selection state
    get selectedItem() {
      return selectedItem;
    },
    set selectedItem(item) {
      this.select(item);
    },
    select(item) {
      if (item === selectedItem) return;
      const previousItem = selectedItem;
      if (previousItem) {
        previousItem.removeAttribute("data-gridiot-selected");
      }
      selectedItem = item;
      if (item) {
        item.setAttribute("data-gridiot-selected", "");
        this.emit("select", { item });
      } else if (previousItem) {
        this.emit("deselect", { item: previousItem });
      }
    },
    deselect() {
      this.select(null);
    },
    getCellFromPoint(x, y) {
      const rect = element.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return null;
      }
      const style = getComputedStyle(element);
      const columns = parseGridTemplate(style.gridTemplateColumns);
      const rows = parseGridTemplate(style.gridTemplateRows);
      const columnGap = parseFloat(style.columnGap) || 0;
      const rowGap = parseFloat(style.rowGap) || 0;
      const relX = x - rect.left + element.scrollLeft;
      const relY = y - rect.top + element.scrollTop;
      const column = getGridIndex(relX, columns, columnGap);
      const row = getGridIndex(relY, rows, rowGap);
      return { column, row };
    },
    emit(event, detail) {
      element.dispatchEvent(
        new CustomEvent(`gridiot:${event}`, {
          bubbles: true,
          detail
        })
      );
    },
    getGridInfo() {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const columns = parseGridTemplate(style.gridTemplateColumns);
      const rows = parseGridTemplate(style.gridTemplateRows);
      const columnGap = parseFloat(style.columnGap) || 0;
      const rowGap = parseFloat(style.rowGap) || 0;
      return {
        rect,
        columns,
        rows,
        gap: columnGap,
        // Assume uniform gap for simplicity
        cellWidth: columns[0] || 0,
        cellHeight: rows[0] || 0
      };
    },
    destroy() {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    }
  };
  const observer = new MutationObserver((mutations) => {
    const changedItems = /* @__PURE__ */ new Set();
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
        const item = mutation.target.closest(
          "[data-gridiot-item]"
        );
        if (item && element.contains(item)) {
          changedItems.add(item);
        }
      }
    }
    if (changedItems.size > 0 && "startViewTransition" in document) {
    }
  });
  observer.observe(element, {
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });
  for (const plugin of plugins.values()) {
    if (disablePlugins.includes(plugin.name)) {
      continue;
    }
    const pluginSpecificOptions = pluginOptions[plugin.name] ?? {};
    const opts = {
      ...pluginSpecificOptions,
      // Pass shared resources to all plugins that might need them
      layoutModel,
      styleElement,
      core
    };
    const cleanup = plugin.init(core, opts);
    if (cleanup) {
      cleanups.push(cleanup);
    }
  }
  return core;
}
function parseGridTemplate(template) {
  const values = template.split(" ").filter(Boolean);
  return values.map((v) => parseFloat(v) || 0);
}
function getGridIndex(pos, tracks, gap) {
  let accumulated = 0;
  const halfGap = gap / 2;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const trackEnd = accumulated + track + halfGap;
    if (pos <= trackEnd) {
      return i + 1;
    }
    accumulated += track + gap;
  }
  return tracks.length || 1;
}
function getItemCell(item) {
  const style = getComputedStyle(item);
  return {
    column: parseInt(style.gridColumnStart, 10) || 1,
    row: parseInt(style.gridRowStart, 10) || 1
  };
}
function setItemCell(item, cell) {
  item.style.gridColumn = String(cell.column);
  item.style.gridRow = String(cell.row);
}

// plugins/accessibility.ts
registerPlugin({
  name: "accessibility",
  init(core) {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "assertive");
    liveRegion.setAttribute("aria-atomic", "true");
    Object.assign(liveRegion.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0"
    });
    core.element.appendChild(liveRegion);
    let lastCell = null;
    function announce(message) {
      liveRegion.textContent = "";
      requestAnimationFrame(() => {
        liveRegion.textContent = message;
      });
    }
    function getLabel(item) {
      return item.getAttribute("data-gridiot-label") || item.getAttribute("aria-label") || item.id || "Item";
    }
    function formatPosition(cell) {
      return `row ${cell.row}, column ${cell.column}`;
    }
    function getAnnouncement(item, event, cell) {
      const label = getLabel(item);
      const pos = cell ? formatPosition(cell) : "";
      const itemTemplate = item.getAttribute(`data-gridiot-announce-${event}`);
      if (itemTemplate) {
        return itemTemplate.replace("{label}", label).replace("{row}", String(cell?.row ?? "")).replace("{column}", String(cell?.column ?? ""));
      }
      const gridTemplate = core.element.getAttribute(
        `data-gridiot-announce-${event}`
      );
      if (gridTemplate) {
        return gridTemplate.replace("{label}", label).replace("{row}", String(cell?.row ?? "")).replace("{column}", String(cell?.column ?? ""));
      }
      switch (event) {
        case "grab":
          return `${label} grabbed. Position ${pos}. Use arrow keys to move, Enter to drop, Escape to cancel.`;
        case "move":
          return `Moved to ${pos}.`;
        case "drop":
          return `${label} dropped at ${pos}.`;
        case "cancel":
          return `${label} drag cancelled.`;
      }
    }
    const onDragStart = (e) => {
      lastCell = e.detail.cell;
      announce(getAnnouncement(e.detail.item, "grab", e.detail.cell));
    };
    const onDragMove = (e) => {
      const { cell } = e.detail;
      if (lastCell && cell.row === lastCell.row && cell.column === lastCell.column) {
        return;
      }
      lastCell = cell;
      announce(getAnnouncement(e.detail.item, "move", cell));
    };
    const onDragEnd = (e) => {
      lastCell = null;
      announce(getAnnouncement(e.detail.item, "drop", e.detail.cell));
    };
    const onDragCancel = (e) => {
      lastCell = null;
      announce(getAnnouncement(e.detail.item, "cancel"));
    };
    core.element.addEventListener(
      "gridiot:drag-start",
      onDragStart
    );
    core.element.addEventListener(
      "gridiot:drag-move",
      onDragMove
    );
    core.element.addEventListener(
      "gridiot:drag-end",
      onDragEnd
    );
    core.element.addEventListener(
      "gridiot:drag-cancel",
      onDragCancel
    );
    return () => {
      core.element.removeEventListener(
        "gridiot:drag-start",
        onDragStart
      );
      core.element.removeEventListener(
        "gridiot:drag-move",
        onDragMove
      );
      core.element.removeEventListener(
        "gridiot:drag-end",
        onDragEnd
      );
      core.element.removeEventListener(
        "gridiot:drag-cancel",
        onDragCancel
      );
      liveRegion.remove();
    };
  }
});

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
        case "K":
          return "up";
        case "ArrowDown":
        case "j":
        case "J":
          return "down";
        case "ArrowLeft":
        case "h":
        case "H":
          return "left";
        case "ArrowRight":
        case "l":
        case "L":
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
      if (e.key === "G" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
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
        if (e.altKey && !e.ctrlKey && !e.shiftKey && selectedItem) {
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
        if (e.shiftKey && !e.ctrlKey && !e.altKey) {
          let newColspan = itemSize.colspan;
          let newRowspan = itemSize.rowspan;
          switch (direction) {
            case "right":
              newColspan = Math.min(itemSize.colspan + 1, gridInfo.columns.length - currentCell.column + 1);
              break;
            case "left":
              newColspan = Math.max(1, itemSize.colspan - 1);
              break;
            case "down":
              newRowspan = itemSize.rowspan + 1;
              break;
            case "up":
              newRowspan = Math.max(1, itemSize.rowspan - 1);
              break;
          }
          if (newColspan === itemSize.colspan && newRowspan === itemSize.rowspan) {
            return;
          }
          const originalViewTransitionName = selectedItem.style.viewTransitionName || "";
          selectedItem.style.viewTransitionName = "resizing";
          const handle = direction === "right" || direction === "down" ? "se" : direction === "left" ? "w" : "n";
          core.emit("resize-start", {
            item: selectedItem,
            cell: currentCell,
            colspan: itemSize.colspan,
            rowspan: itemSize.rowspan,
            handle
          });
          selectedItem.setAttribute("data-gridiot-colspan", String(newColspan));
          selectedItem.setAttribute("data-gridiot-rowspan", String(newRowspan));
          core.emit("resize-end", {
            item: selectedItem,
            cell: currentCell,
            colspan: newColspan,
            rowspan: newRowspan
          });
          setTimeout(() => {
            selectedItem.style.viewTransitionName = originalViewTransitionName;
          }, 250);
          log("resize", { direction, newColspan, newRowspan });
          return;
        }
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

// utils/flip.ts
function animateFLIP(element, firstRect, options = {}) {
  const {
    duration = 200,
    easing = "cubic-bezier(0.2, 0, 0, 1)",
    includeScale = false,
    transformOrigin,
    onStart,
    onFinish
  } = options;
  const lastRect = element.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;
  const needsTranslate = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
  let scaleX = 1;
  let scaleY = 1;
  let needsScale = false;
  if (includeScale) {
    scaleX = firstRect.width / lastRect.width;
    scaleY = firstRect.height / lastRect.height;
    needsScale = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01;
  }
  if (!needsTranslate && !needsScale) {
    onFinish?.();
    return null;
  }
  onStart?.();
  const keyframes = includeScale ? [
    {
      transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
      transformOrigin: transformOrigin ?? "top left"
    },
    {
      transform: "translate(0, 0) scale(1, 1)",
      transformOrigin: transformOrigin ?? "top left"
    }
  ] : [
    { transform: `translate(${deltaX}px, ${deltaY}px)` },
    { transform: "translate(0, 0)" }
  ];
  const animation = element.animate(keyframes, {
    duration,
    easing
  });
  animation.onfinish = () => onFinish?.();
  return animation;
}
function getItemViewTransitionName(element) {
  return element.style.getPropertyValue("--item-id") || element.id || element.dataset.id || null;
}
function withViewTransitionExclusion(element, fn) {
  element.style.viewTransitionName = "none";
  const animation = fn();
  const restoreViewTransitionName = () => {
    const itemId = getItemViewTransitionName(element);
    if (itemId) {
      element.style.viewTransitionName = itemId;
    }
  };
  if (animation) {
    animation.addEventListener("finish", restoreViewTransitionName, { once: true });
  } else {
    restoreViewTransitionName();
  }
  return animation;
}
function animateFLIPWithTracking(element, firstRect, options = {}) {
  const { attributeName = "data-gridiot-dropping", ...flipOptions } = options;
  element.style.viewTransitionName = "none";
  const animation = animateFLIP(element, firstRect, {
    ...flipOptions,
    onStart: () => {
      element.setAttribute(attributeName, "");
      flipOptions.onStart?.();
    },
    onFinish: () => {
      element.removeAttribute(attributeName);
      const itemId = getItemViewTransitionName(element);
      if (itemId) {
        element.style.viewTransitionName = itemId;
      }
      flipOptions.onFinish?.();
    }
  });
  if (!animation) {
    const itemId = getItemViewTransitionName(element);
    if (itemId) {
      element.style.viewTransitionName = itemId;
    }
  }
  return animation;
}

// plugins/pointer.ts
var HYSTERESIS = 0.4;
var TARGET_CHANGE_DEBOUNCE = 40;
var DRAG_THRESHOLD = 5;
var PREDICTION_THRESHOLD = 30;
var PREDICTION_LEAD = 0.5;
var DEBUG2 = false;
function log2(...args) {
  if (DEBUG2) console.log("[pointer]", ...args);
}
registerPlugin({
  name: "pointer",
  init(core) {
    let pendingDrag = null;
    let dragState = null;
    core.providers.register("drag", () => {
      if (!dragState) return null;
      return {
        item: dragState.item,
        cell: dragState.lastCell,
        startCell: dragState.startCell,
        colspan: dragState.colspan,
        rowspan: dragState.rowspan
      };
    });
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
        rowspan,
        dragStartX: e.clientX,
        dragStartY: e.clientY
      };
      item.setAttribute("data-gridiot-dragging", "");
      document.body.classList.add("is-dragging");
      log2("drag-start", { startCell, rect: { left: rect.left, top: rect.top } });
      core.emit("drag-start", { item, cell: startCell, colspan, rowspan });
      item.style.position = "fixed";
      item.style.left = `${rect.left}px`;
      item.style.top = `${rect.top}px`;
      item.style.width = `${rect.width}px`;
      item.style.height = `${rect.height}px`;
      item.style.zIndex = "100";
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
      let cardCenterX = newLeft + initialRect.width / 2;
      let cardCenterY = newTop + initialRect.height / 2;
      const gridInfo = core.getGridInfo();
      const cumulativeDx = e.clientX - dragState.dragStartX;
      const cumulativeDy = e.clientY - dragState.dragStartY;
      if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
        const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
        cardCenterX += Math.sign(cumulativeDx) * leadOffset;
      }
      if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
        const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
        cardCenterY += Math.sign(cumulativeDy) * leadOffset;
      }
      const rawCell = core.getCellFromPoint(cardCenterX, cardCenterY);
      if (rawCell) {
        const gridInfo2 = core.getGridInfo();
        const maxColumn = Math.max(1, gridInfo2.columns.length - colspan + 1);
        const maxRow = Math.max(1, gridInfo2.rows.length - rowspan + 1);
        const cell = {
          column: Math.max(1, Math.min(maxColumn, rawCell.column)),
          row: Math.max(1, Math.min(maxRow, rawCell.row))
        };
        const now = performance.now();
        const timeSinceLastChange = now - dragState.lastTargetChangeTime;
        const cellChanged = cell.column !== dragState.lastCell.column || cell.row !== dragState.lastCell.row;
        if (cellChanged && timeSinceLastChange >= TARGET_CHANGE_DEBOUNCE) {
          const cellWidth = gridInfo2.cellWidth + gridInfo2.gap;
          const cellHeight = gridInfo2.cellHeight + gridInfo2.gap;
          const currentCellCenterX = gridInfo2.rect.left + (dragState.lastCell.column - 1) * cellWidth + gridInfo2.cellWidth / 2;
          const currentCellCenterY = gridInfo2.rect.top + (dragState.lastCell.row - 1) * cellHeight + gridInfo2.cellHeight / 2;
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
          log2("drag-move", { cell, distX: distX.toFixed(2), distY: distY.toFixed(2) });
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
        log2("click (no drag)");
        cleanupListeners(item, pendingDrag.pointerId);
        pendingDrag = null;
        return;
      }
      if (!dragState) return;
      const { initialRect, colspan, rowspan, lastCell, offsetX, offsetY, dragStartX, dragStartY } = dragState;
      const gridInfo = core.getGridInfo();
      const cumulativeDx = e.clientX - dragStartX;
      const cumulativeDy = e.clientY - dragStartY;
      const newLeft = e.clientX - offsetX;
      const newTop = e.clientY - offsetY;
      let effectiveCenterX = newLeft + initialRect.width / 2;
      let effectiveCenterY = newTop + initialRect.height / 2;
      if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
        const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
        effectiveCenterX += Math.sign(cumulativeDx) * leadOffset;
      }
      if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
        const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
        effectiveCenterY += Math.sign(cumulativeDy) * leadOffset;
      }
      const rawCell = core.getCellFromPoint(effectiveCenterX, effectiveCenterY);
      const firstRect = item.getBoundingClientRect();
      if (rawCell) {
        const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
        const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);
        const cell = {
          column: Math.max(1, Math.min(maxColumn, rawCell.column)),
          row: Math.max(1, Math.min(maxRow, rawCell.row))
        };
        log2("drag-end", { cell });
        core.emit("drag-end", { item, cell, colspan, rowspan });
      } else {
        log2("drag-end", { cell: lastCell, note: "using lastCell (pointer outside grid)" });
        core.emit("drag-end", { item, cell: lastCell, colspan, rowspan });
      }
      cleanup();
      requestAnimationFrame(() => {
        log2("FLIP", { firstRect: { left: firstRect.left.toFixed(0), top: firstRect.top.toFixed(0) } });
        animateFLIPWithTracking(item, firstRect);
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
        document.body.classList.remove("is-dragging");
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

// plugins/camera.ts
function findScrollParent(element) {
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (overflowY === "auto" || overflowY === "scroll" || overflowX === "auto" || overflowX === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}
function getViewportRect(container) {
  if (container === window) {
    return {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }
  const rect = container.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}
function attachCamera(gridElement, options = {}) {
  const {
    mode: initialMode = "contain",
    scrollContainer: customContainer,
    edgeSize = 60,
    scrollSpeed = 15,
    scrollBehavior = "smooth",
    scrollMargin = 20,
    scrollOnSelect = true,
    autoScrollOnDrag = true,
    settleDelay = 150,
    core
  } = options;
  let mode = initialMode;
  let scrollContainer = customContainer ?? findScrollParent(gridElement);
  let animationFrameId = null;
  let isDragging = false;
  let sawPointerMove = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let isScrolling = false;
  let settleTimeoutId = null;
  if (core) {
    core.providers.register("camera", () => ({
      isScrolling,
      mode
    }));
  }
  function setScrolling(active) {
    if (active) {
      isScrolling = true;
      if (settleTimeoutId) {
        clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
      }
    } else {
      if (settleTimeoutId) clearTimeout(settleTimeoutId);
      settleTimeoutId = setTimeout(() => {
        isScrolling = false;
        settleTimeoutId = null;
        gridElement.dispatchEvent(
          new CustomEvent("gridiot:camera-settled", { bubbles: true })
        );
      }, settleDelay);
    }
  }
  function scrollTo(item, behavior = scrollBehavior) {
    if (mode === "off") return;
    const itemRect = item.getBoundingClientRect();
    const viewport = getViewportRect(scrollContainer);
    if (mode === "center") {
      const targetScrollTop = scrollContainer === window ? window.scrollY + itemRect.top - viewport.height / 2 + itemRect.height / 2 : scrollContainer.scrollTop + itemRect.top - viewport.top - viewport.height / 2 + itemRect.height / 2;
      const targetScrollLeft = scrollContainer === window ? window.scrollX + itemRect.left - viewport.width / 2 + itemRect.width / 2 : scrollContainer.scrollLeft + itemRect.left - viewport.left - viewport.width / 2 + itemRect.width / 2;
      if (scrollContainer === window) {
        window.scrollTo({ top: targetScrollTop, left: targetScrollLeft, behavior });
      } else {
        scrollContainer.scrollTo({
          top: targetScrollTop,
          left: targetScrollLeft,
          behavior
        });
      }
    } else {
      item.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "nearest"
      });
    }
  }
  function getEdgeScrollVelocity(pointerX, pointerY) {
    const viewport = getViewportRect(scrollContainer);
    let velocityX = 0;
    let velocityY = 0;
    const relativeX = pointerX - viewport.left;
    const relativeY = pointerY - viewport.top;
    if (relativeX < edgeSize) {
      velocityX = -scrollSpeed * (1 - relativeX / edgeSize);
    } else if (relativeX > viewport.width - edgeSize) {
      velocityX = scrollSpeed * (1 - (viewport.width - relativeX) / edgeSize);
    }
    if (relativeY < edgeSize) {
      velocityY = -scrollSpeed * (1 - relativeY / edgeSize);
    } else if (relativeY > viewport.height - edgeSize) {
      velocityY = scrollSpeed * (1 - (viewport.height - relativeY) / edgeSize);
    }
    return { x: velocityX, y: velocityY };
  }
  let wasScrollingLastFrame = false;
  function scrollLoop() {
    if (!isDragging || !autoScrollOnDrag || mode === "off") {
      animationFrameId = null;
      if (wasScrollingLastFrame) {
        setScrolling(false);
        wasScrollingLastFrame = false;
      }
      return;
    }
    const velocity = getEdgeScrollVelocity(lastPointerX, lastPointerY);
    const isNearEdge = velocity.x !== 0 || velocity.y !== 0;
    if (isNearEdge) {
      if (!wasScrollingLastFrame) {
        setScrolling(true);
      }
      wasScrollingLastFrame = true;
      if (scrollContainer === window) {
        window.scrollBy(velocity.x, velocity.y);
      } else {
        scrollContainer.scrollLeft += velocity.x;
        scrollContainer.scrollTop += velocity.y;
      }
    } else {
      if (wasScrollingLastFrame) {
        setScrolling(false);
        wasScrollingLastFrame = false;
      }
    }
    animationFrameId = requestAnimationFrame(scrollLoop);
  }
  function startScrollLoop() {
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(scrollLoop);
    }
  }
  function stopScrollLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    setScrolling(false);
  }
  function onPointerMove(e) {
    if (!isDragging || !autoScrollOnDrag || mode === "off") return;
    sawPointerMove = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    startScrollLoop();
  }
  function onDragStart(e) {
    isDragging = true;
    sawPointerMove = false;
    window.addEventListener("pointermove", onPointerMove);
  }
  function onDragMove(e) {
    if (mode === "off") return;
    if (e.detail.x !== 0 || e.detail.y !== 0) {
      lastPointerX = e.detail.x;
      lastPointerY = e.detail.y;
    } else {
      requestAnimationFrame(() => {
        scrollTo(e.detail.item, "smooth");
      });
    }
  }
  function onDragEnd(e) {
    const wasPointerDrag = sawPointerMove;
    isDragging = false;
    sawPointerMove = false;
    stopScrollLoop();
    window.removeEventListener("pointermove", onPointerMove);
    if (!wasPointerDrag && scrollOnSelect) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          scrollTo(e.detail.item, "smooth");
        });
      }, 100);
    }
  }
  function onDragCancel(e) {
    isDragging = false;
    stopScrollLoop();
    window.removeEventListener("pointermove", onPointerMove);
  }
  function onSelect(e) {
    if (!scrollOnSelect || mode === "off") return;
    if (isDragging) return;
    scrollTo(e.detail.item);
  }
  gridElement.addEventListener(
    "gridiot:drag-start",
    onDragStart
  );
  gridElement.addEventListener(
    "gridiot:drag-move",
    onDragMove
  );
  gridElement.addEventListener("gridiot:drag-end", onDragEnd);
  gridElement.addEventListener(
    "gridiot:drag-cancel",
    onDragCancel
  );
  gridElement.addEventListener("gridiot:select", onSelect);
  function destroy() {
    stopScrollLoop();
    gridElement.removeEventListener(
      "gridiot:drag-start",
      onDragStart
    );
    gridElement.removeEventListener(
      "gridiot:drag-move",
      onDragMove
    );
    gridElement.removeEventListener(
      "gridiot:drag-end",
      onDragEnd
    );
    gridElement.removeEventListener(
      "gridiot:drag-cancel",
      onDragCancel
    );
    gridElement.removeEventListener(
      "gridiot:select",
      onSelect
    );
  }
  return {
    setMode(newMode) {
      mode = newMode;
      if (mode === "off") {
        stopScrollLoop();
      }
    },
    getMode() {
      return mode;
    },
    scrollTo,
    stop: stopScrollLoop,
    destroy
  };
}
registerPlugin({
  name: "camera",
  init(core, options) {
    const instance = attachCamera(core.element, {
      ...options,
      core: options?.core ?? core
    });
    return () => instance.destroy();
  }
});

// plugins/resize.ts
function detectHandle(e, item, size, mode) {
  const rect = item.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const nearLeft = x < size;
  const nearRight = x > rect.width - size;
  const nearTop = y < size;
  const nearBottom = y > rect.height - size;
  if (mode === "corners" || mode === "all") {
    if (nearTop && nearLeft) return "nw";
    if (nearTop && nearRight) return "ne";
    if (nearBottom && nearLeft) return "sw";
    if (nearBottom && nearRight) return "se";
  }
  if (mode === "edges" || mode === "all") {
    if (nearTop) return "n";
    if (nearBottom) return "s";
    if (nearLeft) return "w";
    if (nearRight) return "e";
  }
  return null;
}
function getCursor(handle) {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "";
  }
}
function calculateNewSize(core, handle, startCell, originalSize, pointerX, pointerY, minSize, maxSize) {
  const gridInfo = core.getGridInfo();
  const maxColumn = gridInfo.columns.length;
  const maxRow = gridInfo.rows.length;
  let pointerCell = core.getCellFromPoint(pointerX, pointerY);
  if (!pointerCell) {
    const rect = gridInfo.rect;
    const cellWidth = gridInfo.cellWidth + gridInfo.gap;
    const cellHeight = gridInfo.cellHeight + gridInfo.gap;
    let column;
    let row;
    if (pointerX < rect.left) {
      column = 1;
    } else if (pointerX > rect.right) {
      column = maxColumn;
    } else {
      column = Math.max(1, Math.min(maxColumn, Math.floor((pointerX - rect.left) / cellWidth) + 1));
    }
    if (pointerY < rect.top) {
      row = 1;
    } else if (pointerY > rect.bottom) {
      row = maxRow;
    } else {
      row = Math.max(1, Math.min(maxRow, Math.floor((pointerY - rect.top) / cellHeight) + 1));
    }
    pointerCell = { column, row };
  }
  let newColspan = originalSize.colspan;
  let newRowspan = originalSize.rowspan;
  let newColumn = startCell.column;
  let newRow = startCell.row;
  if (handle === "e" || handle === "se" || handle === "ne") {
    newColspan = Math.max(
      minSize.colspan,
      Math.min(
        maxSize.colspan,
        pointerCell.column - startCell.column + 1,
        maxColumn - startCell.column + 1
      )
    );
  } else if (handle === "w" || handle === "sw" || handle === "nw") {
    const rightEdge = startCell.column + originalSize.colspan - 1;
    const newLeft = Math.max(1, Math.min(pointerCell.column, rightEdge));
    newColspan = Math.max(
      minSize.colspan,
      Math.min(maxSize.colspan, rightEdge - newLeft + 1)
    );
    newColumn = rightEdge - newColspan + 1;
  }
  if (handle === "s" || handle === "se" || handle === "sw") {
    newRowspan = Math.max(
      minSize.rowspan,
      Math.min(
        maxSize.rowspan,
        pointerCell.row - startCell.row + 1,
        maxRow - startCell.row + 1
      )
    );
  } else if (handle === "n" || handle === "ne" || handle === "nw") {
    const bottomEdge = startCell.row + originalSize.rowspan - 1;
    const newTop = Math.max(1, Math.min(pointerCell.row, bottomEdge));
    newRowspan = Math.max(
      minSize.rowspan,
      Math.min(maxSize.rowspan, bottomEdge - newTop + 1)
    );
    newRow = bottomEdge - newRowspan + 1;
  }
  return {
    colspan: newColspan,
    rowspan: newRowspan,
    column: newColumn,
    row: newRow
  };
}
function createSizeLabel() {
  const label = document.createElement("div");
  label.className = "gridiot-resize-label";
  label.style.cssText = `
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 14px;
		font-weight: 600;
		font-family: system-ui, sans-serif;
		pointer-events: none;
		z-index: 1000;
		white-space: nowrap;
	`;
  return label;
}
function attachResize(gridElement, options) {
  const {
    core,
    handles = "corners",
    handleSize = 12,
    minSize = { colspan: 1, rowspan: 1 },
    maxSize = { colspan: 6, rowspan: 6 },
    showSizeLabel = true
  } = options;
  let activeResize = null;
  let hoveredItem = null;
  let hoveredHandle = null;
  core.providers.register("resize", () => {
    if (!activeResize) return null;
    return {
      item: activeResize.item,
      originalSize: activeResize.originalSize,
      currentSize: activeResize.currentSize,
      handle: activeResize.handle
    };
  });
  function emit(event, detail) {
    gridElement.dispatchEvent(
      new CustomEvent(`gridiot:${event}`, {
        bubbles: true,
        detail
      })
    );
  }
  function startResize(item, handle, e) {
    const colspan = parseInt(item.getAttribute("data-gridiot-colspan") || "1", 10) || 1;
    const rowspan = parseInt(item.getAttribute("data-gridiot-rowspan") || "1", 10) || 1;
    const style = getComputedStyle(item);
    const column = parseInt(style.gridColumnStart, 10) || 1;
    const row = parseInt(style.gridRowStart, 10) || 1;
    const originalSize = { colspan, rowspan };
    const startCell = { column, row };
    const initialRect = item.getBoundingClientRect();
    let sizeLabel = null;
    if (showSizeLabel) {
      sizeLabel = createSizeLabel();
      sizeLabel.textContent = `${colspan}\xD7${rowspan}`;
      item.appendChild(sizeLabel);
    }
    activeResize = {
      item,
      pointerId: e.pointerId,
      handle,
      startCell,
      originalSize,
      currentCell: { ...startCell },
      currentSize: { ...originalSize },
      originalGridColumn: item.style.gridColumn,
      originalGridRow: item.style.gridRow,
      sizeLabel,
      initialRect,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      placeholder: null
      // Will be set below if enabled
    };
    item.setAttribute("data-gridiot-resizing", "");
    item.setAttribute("data-gridiot-handle-active", handle);
    item.removeAttribute("data-gridiot-handle-hover");
    item.setPointerCapture(e.pointerId);
    item.addEventListener("pointermove", onItemPointerMove);
    item.addEventListener("pointerup", onItemPointerUp);
    item.addEventListener("pointercancel", onItemPointerCancel);
    emit("resize-start", {
      item,
      cell: startCell,
      colspan: originalSize.colspan,
      rowspan: originalSize.rowspan,
      handle
    });
    activeResize.placeholder = null;
    item.style.position = "fixed";
    item.style.left = `${initialRect.left}px`;
    item.style.top = `${initialRect.top}px`;
    item.style.width = `${initialRect.width}px`;
    item.style.height = `${initialRect.height}px`;
    item.style.zIndex = "100";
    item.style.viewTransitionName = "resizing";
  }
  function updateResize(e) {
    if (!activeResize) return;
    const { item, handle, startCell, originalSize, currentCell, currentSize, sizeLabel, initialRect, startPointerX, startPointerY } = activeResize;
    const gridInfo = core.getGridInfo();
    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;
    let newWidth = initialRect.width;
    let newHeight = initialRect.height;
    let newLeft = initialRect.left;
    let newTop = initialRect.top;
    const minWidth = gridInfo.cellWidth;
    const minHeight = gridInfo.cellHeight;
    const maxWidthByConfig = maxSize.colspan * gridInfo.cellWidth + (maxSize.colspan - 1) * gridInfo.gap;
    const maxHeightByConfig = maxSize.rowspan * gridInfo.cellHeight + (maxSize.rowspan - 1) * gridInfo.gap;
    const maxWidthByGrid = gridInfo.rect.right - initialRect.left;
    const maxHeightByGrid = gridInfo.rect.bottom - initialRect.top;
    const maxWidth = Math.min(maxWidthByConfig, maxWidthByGrid);
    const maxHeight = Math.min(maxHeightByConfig, maxHeightByGrid);
    if (handle === "e" || handle === "se" || handle === "ne") {
      newWidth = Math.max(minWidth, Math.min(maxWidth, initialRect.width + deltaX));
    }
    if (handle === "w" || handle === "sw" || handle === "nw") {
      const maxLeftShift = initialRect.left - gridInfo.rect.left;
      const maxWidthFromLeft = Math.min(maxWidthByConfig, initialRect.width + maxLeftShift);
      const widthChange = Math.max(-initialRect.width + minWidth, Math.min(maxWidthFromLeft - initialRect.width, -deltaX));
      newWidth = initialRect.width + widthChange;
      newLeft = initialRect.left - widthChange;
    }
    if (handle === "s" || handle === "se" || handle === "sw") {
      newHeight = Math.max(minHeight, Math.min(maxHeight, initialRect.height + deltaY));
    }
    if (handle === "n" || handle === "ne" || handle === "nw") {
      const maxTopShift = initialRect.top - gridInfo.rect.top;
      const maxHeightFromTop = Math.min(maxHeightByConfig, initialRect.height + maxTopShift);
      const heightChange = Math.max(-initialRect.height + minHeight, Math.min(maxHeightFromTop - initialRect.height, -deltaY));
      newHeight = initialRect.height + heightChange;
      newTop = initialRect.top - heightChange;
    }
    item.style.left = `${newLeft}px`;
    item.style.top = `${newTop}px`;
    item.style.width = `${newWidth}px`;
    item.style.height = `${newHeight}px`;
    const cellPlusGap = gridInfo.cellWidth + gridInfo.gap;
    const rowPlusGap = gridInfo.cellHeight + gridInfo.gap;
    const rawColspanRatio = (newWidth + gridInfo.gap) / cellPlusGap;
    const rawRowspanRatio = (newHeight + gridInfo.gap) / rowPlusGap;
    const isGrowingWidth = handle === "e" || handle === "se" || handle === "ne";
    const isGrowingHeight = handle === "s" || handle === "se" || handle === "sw";
    const GROW_THRESHOLD = 0.3;
    const SHRINK_THRESHOLD = 0.7;
    let projectedColspan;
    let projectedRowspan;
    if (isGrowingWidth) {
      projectedColspan = Math.floor(rawColspanRatio);
      if (rawColspanRatio - projectedColspan >= GROW_THRESHOLD) {
        projectedColspan += 1;
      }
    } else {
      projectedColspan = Math.ceil(rawColspanRatio);
      if (projectedColspan - rawColspanRatio > 1 - SHRINK_THRESHOLD) {
        projectedColspan -= 1;
      }
    }
    if (isGrowingHeight) {
      projectedRowspan = Math.floor(rawRowspanRatio);
      if (rawRowspanRatio - projectedRowspan >= GROW_THRESHOLD) {
        projectedRowspan += 1;
      }
    } else {
      projectedRowspan = Math.ceil(rawRowspanRatio);
      if (projectedRowspan - rawRowspanRatio > 1 - SHRINK_THRESHOLD) {
        projectedRowspan -= 1;
      }
    }
    projectedColspan = Math.max(minSize.colspan, Math.min(maxSize.colspan, projectedColspan));
    projectedRowspan = Math.max(minSize.rowspan, Math.min(maxSize.rowspan, projectedRowspan));
    const newSize = calculateNewSize(
      core,
      handle,
      startCell,
      originalSize,
      e.clientX,
      e.clientY,
      minSize,
      maxSize
    );
    activeResize.currentSize = { colspan: projectedColspan, rowspan: projectedRowspan };
    activeResize.currentCell = { column: newSize.column, row: newSize.row };
    if (sizeLabel) {
      sizeLabel.textContent = `${projectedColspan}\xD7${projectedRowspan}`;
    }
    emit("resize-move", {
      item,
      cell: { column: newSize.column, row: newSize.row },
      colspan: projectedColspan,
      rowspan: projectedRowspan,
      handle
    });
  }
  function cleanupResizeListeners(item, pointerId) {
    item.releasePointerCapture(pointerId);
    item.removeEventListener("pointermove", onItemPointerMove);
    item.removeEventListener("pointerup", onItemPointerUp);
    item.removeEventListener("pointercancel", onItemPointerCancel);
  }
  function finishResize() {
    if (!activeResize) return;
    const { item, pointerId, currentSize, currentCell, originalSize, sizeLabel, initialRect, placeholder } = activeResize;
    if (placeholder) {
      placeholder.remove();
    }
    cleanupResizeListeners(item, pointerId);
    const firstRect = item.getBoundingClientRect();
    item.setAttribute("data-gridiot-colspan", String(currentSize.colspan));
    item.setAttribute("data-gridiot-rowspan", String(currentSize.rowspan));
    if (sizeLabel) {
      sizeLabel.remove();
    }
    emit("resize-end", {
      item,
      cell: currentCell,
      colspan: currentSize.colspan,
      rowspan: currentSize.rowspan
    });
    const applyFinalState = () => {
      item.style.position = "";
      item.style.left = "";
      item.style.top = "";
      item.style.width = "";
      item.style.height = "";
      item.style.zIndex = "";
      item.style.gridColumn = `${currentCell.column} / span ${currentSize.colspan}`;
      item.style.gridRow = `${currentCell.row} / span ${currentSize.rowspan}`;
      item.removeAttribute("data-gridiot-resizing");
      item.removeAttribute("data-gridiot-handle-active");
    };
    item.style.viewTransitionName = "none";
    applyFinalState();
    requestAnimationFrame(() => {
      const itemId = item.style.getPropertyValue("--item-id") || item.id || item.dataset.id;
      const animation = animateFLIPWithTracking(item, firstRect, {
        includeScale: true,
        transformOrigin: "top left",
        onFinish: () => {
          item.style.transform = "";
          item.style.gridColumn = "";
          item.style.gridRow = "";
          if (itemId) {
            item.style.viewTransitionName = itemId;
          } else {
            item.style.viewTransitionName = "";
          }
        }
      });
      if (!animation) {
        item.style.transform = "";
        item.style.gridColumn = "";
        item.style.gridRow = "";
        if (itemId) {
          item.style.viewTransitionName = itemId;
        } else {
          item.style.viewTransitionName = "";
        }
      }
    });
    activeResize = null;
  }
  function cancelResize() {
    if (!activeResize) return;
    const { item, pointerId, originalGridColumn, originalGridRow, sizeLabel, placeholder } = activeResize;
    cleanupResizeListeners(item, pointerId);
    if (placeholder) {
      placeholder.remove();
    }
    if (sizeLabel) {
      sizeLabel.remove();
    }
    item.style.position = "";
    item.style.left = "";
    item.style.top = "";
    item.style.width = "";
    item.style.height = "";
    item.style.zIndex = "";
    item.style.gridColumn = originalGridColumn;
    item.style.gridRow = originalGridRow;
    const itemId = item.style.getPropertyValue("--item-id") || item.id || item.dataset.id;
    if (itemId) {
      item.style.viewTransitionName = itemId;
    } else {
      item.style.viewTransitionName = "";
    }
    item.removeAttribute("data-gridiot-resizing");
    item.removeAttribute("data-gridiot-handle-active");
    emit("resize-cancel", {
      item
    });
    activeResize = null;
  }
  const onPointerDown = (e) => {
    const item = e.target.closest(
      "[data-gridiot-item]"
    );
    if (!item) return;
    const handle = detectHandle(e, item, handleSize, handles);
    if (!handle) return;
    e.stopPropagation();
    e.preventDefault();
    startResize(item, handle, e);
  };
  const onItemPointerMove = (e) => {
    if (activeResize && e.pointerId === activeResize.pointerId) {
      updateResize(e);
    }
  };
  const onItemPointerUp = (e) => {
    if (activeResize && e.pointerId === activeResize.pointerId) {
      finishResize();
    }
  };
  const onItemPointerCancel = (e) => {
    if (activeResize && e.pointerId === activeResize.pointerId) {
      cancelResize();
    }
  };
  const onPointerMove = (e) => {
    if (activeResize) return;
    const item = e.target.closest(
      "[data-gridiot-item]"
    );
    if (item) {
      const handle = detectHandle(e, item, handleSize, handles);
      if (handle !== hoveredHandle || item !== hoveredItem) {
        if (hoveredItem && hoveredItem !== item) {
          hoveredItem.style.cursor = "";
          hoveredItem.removeAttribute("data-gridiot-handle-hover");
        }
        if (hoveredItem === item && hoveredHandle && !handle) {
          item.removeAttribute("data-gridiot-handle-hover");
        }
        hoveredItem = item;
        hoveredHandle = handle;
        item.style.cursor = getCursor(handle) || "";
        if (handle) {
          item.setAttribute("data-gridiot-handle-hover", handle);
        } else {
          item.removeAttribute("data-gridiot-handle-hover");
        }
      }
    } else if (hoveredItem) {
      hoveredItem.style.cursor = "";
      hoveredItem.removeAttribute("data-gridiot-handle-hover");
      hoveredItem = null;
      hoveredHandle = null;
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape" && activeResize) {
      cancelResize();
    }
  };
  gridElement.addEventListener("pointerdown", onPointerDown, { capture: true });
  gridElement.addEventListener("pointermove", onPointerMove);
  document.addEventListener("keydown", onKeyDown);
  function setSize(item, size) {
    const clampedColspan = Math.max(
      minSize.colspan,
      Math.min(maxSize.colspan, size.colspan)
    );
    const clampedRowspan = Math.max(
      minSize.rowspan,
      Math.min(maxSize.rowspan, size.rowspan)
    );
    const style = getComputedStyle(item);
    const column = parseInt(style.gridColumnStart, 10) || 1;
    const row = parseInt(style.gridRowStart, 10) || 1;
    item.setAttribute("data-gridiot-colspan", String(clampedColspan));
    item.setAttribute("data-gridiot-rowspan", String(clampedRowspan));
    item.style.gridColumn = `${column} / span ${clampedColspan}`;
    item.style.gridRow = `${row} / span ${clampedRowspan}`;
    emit("resize-end", {
      item,
      cell: { column, row },
      colspan: clampedColspan,
      rowspan: clampedRowspan
    });
  }
  function destroy() {
    gridElement.removeEventListener("pointerdown", onPointerDown, {
      capture: true
    });
    gridElement.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("keydown", onKeyDown);
    if (activeResize) {
      cancelResize();
    }
  }
  return { setSize, destroy };
}
registerPlugin({
  name: "resize",
  init(core, options) {
    const instance = attachResize(core.element, {
      ...options,
      core: options?.core ?? core
    });
    return () => instance.destroy();
  }
});

// plugins/placeholder.ts
function attachPlaceholder(gridElement, options = {}) {
  const {
    className = "gridiot-placeholder",
    element: customElement,
    disableViewTransition = true
  } = options;
  let placeholder = null;
  let isCustomElement = false;
  function create() {
    if (placeholder) return;
    if (customElement) {
      placeholder = customElement;
      isCustomElement = true;
    } else {
      placeholder = document.createElement("div");
      placeholder.className = className;
    }
    placeholder.style.pointerEvents = "none";
    if (disableViewTransition) {
      placeholder.style.viewTransitionName = "none";
    }
    gridElement.appendChild(placeholder);
  }
  function update(column, row, colspan = 1, rowspan = 1) {
    if (!placeholder) return;
    placeholder.style.gridColumn = `${column} / span ${colspan}`;
    placeholder.style.gridRow = `${row} / span ${rowspan}`;
  }
  function remove() {
    if (placeholder) {
      placeholder.remove();
      if (!isCustomElement) {
        placeholder = null;
      }
    }
  }
  function handleDragStart(e) {
    const { cell, colspan, rowspan } = e.detail;
    create();
    update(cell.column, cell.row, colspan, rowspan);
  }
  function handleDragMove(e) {
    const { cell, colspan, rowspan } = e.detail;
    update(cell.column, cell.row, colspan, rowspan);
  }
  function handleDragEnd(_e) {
    remove();
  }
  function handleDragCancel(_e) {
    remove();
  }
  function handleResizeStart(e) {
    const { cell, colspan, rowspan } = e.detail;
    create();
    update(cell.column, cell.row, colspan, rowspan);
  }
  function handleResizeMove(e) {
    const { cell, colspan, rowspan } = e.detail;
    update(cell.column, cell.row, colspan, rowspan);
  }
  function handleResizeEnd(_e) {
    remove();
  }
  function handleResizeCancel(_e) {
    remove();
  }
  function handlePointerUp() {
    requestAnimationFrame(() => {
      if (placeholder && !document.querySelector("[data-gridiot-dragging]") && !document.querySelector("[data-gridiot-resizing]")) {
        remove();
      }
    });
  }
  function handlePointerCancel() {
    remove();
  }
  gridElement.addEventListener(
    "gridiot:drag-start",
    handleDragStart
  );
  gridElement.addEventListener(
    "gridiot:drag-move",
    handleDragMove
  );
  gridElement.addEventListener(
    "gridiot:drag-end",
    handleDragEnd
  );
  gridElement.addEventListener(
    "gridiot:drag-cancel",
    handleDragCancel
  );
  gridElement.addEventListener(
    "gridiot:resize-start",
    handleResizeStart
  );
  gridElement.addEventListener(
    "gridiot:resize-move",
    handleResizeMove
  );
  gridElement.addEventListener(
    "gridiot:resize-end",
    handleResizeEnd
  );
  gridElement.addEventListener(
    "gridiot:resize-cancel",
    handleResizeCancel
  );
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerCancel);
  return {
    show(column, row, colspan = 1, rowspan = 1) {
      create();
      update(column, row, colspan, rowspan);
    },
    hide() {
      remove();
    },
    destroy() {
      remove();
      gridElement.removeEventListener(
        "gridiot:drag-start",
        handleDragStart
      );
      gridElement.removeEventListener(
        "gridiot:drag-move",
        handleDragMove
      );
      gridElement.removeEventListener(
        "gridiot:drag-end",
        handleDragEnd
      );
      gridElement.removeEventListener(
        "gridiot:drag-cancel",
        handleDragCancel
      );
      gridElement.removeEventListener(
        "gridiot:resize-start",
        handleResizeStart
      );
      gridElement.removeEventListener(
        "gridiot:resize-move",
        handleResizeMove
      );
      gridElement.removeEventListener(
        "gridiot:resize-end",
        handleResizeEnd
      );
      gridElement.removeEventListener(
        "gridiot:resize-cancel",
        handleResizeCancel
      );
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
    }
  };
}
var PLACEHOLDER_CSS = `
.gridiot-placeholder {
  background: rgba(255, 255, 255, 0.1);
  border: 2px dashed rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  pointer-events: none;
}
`;
function attachPlaceholderStyles() {
  if (document.getElementById("gridiot-placeholder-styles")) return;
  const style = document.createElement("style");
  style.id = "gridiot-placeholder-styles";
  style.textContent = PLACEHOLDER_CSS;
  document.head.appendChild(style);
}
registerPlugin({
  name: "placeholder",
  init(core, options) {
    const instance = attachPlaceholder(core.element, options);
    return () => instance.destroy();
  }
});

// plugins/algorithm-push-core.ts
function itemsOverlap(a, b) {
  return !(a.column + a.width <= b.column || b.column + b.width <= a.column || a.row + a.height <= b.row || b.row + b.height <= a.row);
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
function calculateLayout(items, movedId, targetCell, options = {}) {
  const { compact = true } = options;
  const result = items.map((item) => ({ ...item }));
  const movedItem = result.find((it) => it.id === movedId);
  if (!movedItem) return result;
  movedItem.column = targetCell.column;
  movedItem.row = targetCell.row;
  pushDown(result, movedItem, movedId);
  if (compact) {
    compactUp(result, movedId);
  }
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
    const column = maxColumns ? Math.max(1, Math.min(item.column, maxColumns - width + 1)) : item.column;
    const selector = `${selectorPrefix}${item.id}${selectorSuffix}${excludeSelector}`;
    const gridColumn = `${column} / span ${width}`;
    const gridRow = `${item.row} / span ${item.height}`;
    rules.push(`${selector} { grid-column: ${gridColumn}; grid-row: ${gridRow}; }`);
  }
  return rules.join("\n");
}

// plugins/algorithm-push.ts
var DEBUG3 = false;
function log3(...args) {
  if (DEBUG3) console.log("[algorithm-push]", ...args);
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
  const { styleElement, selectorPrefix = "#", selectorSuffix = "", compaction = true, core, layoutModel } = options;
  function getCurrentColumnCount() {
    const style = getComputedStyle(gridElement);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean);
    return Math.max(1, columns.length);
  }
  let originalPositions = null;
  let draggedItemId = null;
  let draggedElement = null;
  let layoutVersion = 0;
  let currentLayout = null;
  let dragStartColumnCount = null;
  if (core) {
    core.providers.register("layout", () => {
      if (!currentLayout) return null;
      const gridStyle = getComputedStyle(gridElement);
      const columns = gridStyle.gridTemplateColumns.split(" ").length;
      return {
        items: currentLayout.map((item) => ({
          id: item.id,
          column: item.column,
          row: item.row,
          colspan: item.width,
          rowspan: item.height
        })),
        columns
      };
    });
  }
  function getItemId(element) {
    return element.dataset.id || element.dataset.gridiotItem || "";
  }
  function setItemCell2(item, cell) {
    const colspan = parseInt(item.getAttribute("data-gridiot-colspan") || "1", 10) || 1;
    const rowspan = parseInt(item.getAttribute("data-gridiot-rowspan") || "1", 10) || 1;
    const colValue = `${cell.column} / span ${colspan}`;
    const rowValue = `${cell.row} / span ${rowspan}`;
    log3("setItemCell", { id: getItemId(item), colValue, rowValue });
    item.style.gridColumn = colValue;
    item.style.gridRow = rowValue;
  }
  function applyLayout(layout, excludeId, useViewTransition, onApplied) {
    const thisVersion = ++layoutVersion;
    currentLayout = layout;
    const capturedColumnCount = dragStartColumnCount ?? resizeStartColumnCount;
    const applyChanges = () => {
      if (thisVersion !== layoutVersion) {
        return;
      }
      if (styleElement) {
        const itemsToStyle = excludeId ? layout.filter((item) => item.id !== excludeId) : layout;
        const css = layoutToCSS(itemsToStyle, {
          selectorPrefix,
          selectorSuffix,
          maxColumns: capturedColumnCount ?? void 0
        });
        log3("injecting CSS:", css.substring(0, 200) + "...");
        styleElement.textContent = css;
        const elements = gridElement.querySelectorAll("[data-gridiot-item]");
        for (const el of elements) {
          const element = el;
          const id = getItemId(element);
          const vtn = element.style.viewTransitionName;
          if (id !== excludeId && vtn !== "none") {
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
            setItemCell2(element, { column: item.column, row: item.row });
          }
        }
      }
      if (onApplied) {
        onApplied();
      }
    };
    if (useViewTransition && "startViewTransition" in document) {
      log3("starting view transition, excludeId:", excludeId);
      if (draggedElement && excludeId) {
        draggedElement.style.viewTransitionName = "dragging";
      }
      const items = gridElement.querySelectorAll("[data-gridiot-item]");
      for (const item of items) {
        const el = item;
        const vtn = getComputedStyle(el).viewTransitionName;
        log3("item", getItemId(el), "view-transition-name:", vtn);
      }
      const transition = document.startViewTransition(applyChanges);
      transition.finished.then(() => log3("view transition finished"));
    } else {
      log3("applying without view transition, useViewTransition:", useViewTransition, "hasAPI:", "startViewTransition" in document);
      applyChanges();
    }
  }
  const onDragStart = (e) => {
    const detail = e.detail;
    draggedElement = detail.item;
    draggedItemId = getItemId(detail.item);
    dragStartColumnCount = getCurrentColumnCount();
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
      const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: dragStartColumnCount });
      styleElement.textContent = css;
    }
    log3("drag-start", {
      item: draggedItemId,
      positions: Array.from(originalPositions.entries())
    });
  };
  let pendingCell = null;
  const onDragMove = (e) => {
    if (!draggedItemId || !originalPositions) return;
    const detail = e.detail;
    if (core) {
      const cameraState = core.providers.get("camera");
      if (cameraState?.isScrolling) {
        pendingCell = detail.cell;
        log3("drag-move deferred (camera scrolling)", pendingCell);
        return;
      }
    }
    pendingCell = null;
    const items = readItemsFromDOM(gridElement).map((item) => {
      const original = originalPositions.get(item.id);
      if (original && item.id !== draggedItemId) {
        return { ...item, column: original.column, row: original.row };
      }
      return item;
    });
    log3("drag-move", { targetCell: detail.cell });
    const newLayout = calculateLayout(items, draggedItemId, detail.cell, { compact: compaction });
    log3(
      "calculated layout",
      newLayout.map((it) => ({ id: it.id, col: it.column, row: it.row }))
    );
    applyLayout(newLayout, draggedItemId, true);
  };
  const onDragEnd = (e) => {
    if (!draggedItemId || !originalPositions) return;
    const detail = e.detail;
    log3("drag-end", { finalCell: detail.cell });
    const items = readItemsFromDOM(gridElement).map((item) => {
      const original = originalPositions.get(item.id);
      if (original && item.id !== draggedItemId) {
        return { ...item, column: original.column, row: original.row };
      }
      return item;
    });
    const finalLayout = calculateLayout(items, draggedItemId, detail.cell, { compact: compaction });
    log3(
      "final layout",
      finalLayout.map((it) => ({ id: it.id, col: it.column, row: it.row }))
    );
    const isPointerDrag = draggedElement?.style.position === "fixed";
    log3("drag-end isPointerDrag:", isPointerDrag, "position:", draggedElement?.style.position);
    if (draggedElement && draggedElement.style.viewTransitionName === "dragging") {
      draggedElement.style.viewTransitionName = "";
    }
    const useViewTransition = !isPointerDrag;
    log3("drag-end useViewTransition:", useViewTransition);
    const savedDragStartColumnCount = dragStartColumnCount;
    const saveToLayoutModel = () => {
      if (layoutModel && savedDragStartColumnCount) {
        const positions = /* @__PURE__ */ new Map();
        for (const item of finalLayout) {
          positions.set(item.id, { column: item.column, row: item.row });
        }
        layoutModel.saveLayout(savedDragStartColumnCount, positions);
        log3("saved layout to model for", savedDragStartColumnCount, "columns");
        if (styleElement) {
          styleElement.textContent = "";
          log3("cleared preview styles");
        }
      }
    };
    applyLayout(finalLayout, null, useViewTransition, saveToLayoutModel);
    draggedItemId = null;
    draggedElement = null;
    originalPositions = null;
    pendingCell = null;
    dragStartColumnCount = null;
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
    pendingCell = null;
    dragStartColumnCount = null;
  };
  const onCameraSettled = () => {
    if (!draggedItemId || !originalPositions) return;
    let cell = pendingCell;
    if (!cell && draggedElement) {
      const rect = draggedElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      cell = core?.getCellFromPoint(centerX, centerY) ?? null;
    }
    if (!cell) {
      log3("camera-settled, no cell to update to");
      return;
    }
    log3("camera-settled, updating to cell", cell);
    pendingCell = null;
    const items = readItemsFromDOM(gridElement).map((item) => {
      const original = originalPositions.get(item.id);
      if (original && item.id !== draggedItemId) {
        return { ...item, column: original.column, row: original.row };
      }
      return item;
    });
    const newLayout = calculateLayout(items, draggedItemId, cell, { compact: compaction });
    applyLayout(newLayout, draggedItemId, true);
  };
  let resizedItemId = null;
  let resizedElement = null;
  let resizeOriginalPositions = null;
  let lastResizeLayout = null;
  let resizeStartColumnCount = null;
  const onResizeStart = (e) => {
    const detail = e.detail;
    resizedElement = detail.item;
    resizedItemId = getItemId(detail.item);
    resizeStartColumnCount = getCurrentColumnCount();
    const items = readItemsFromDOM(gridElement);
    resizeOriginalPositions = /* @__PURE__ */ new Map();
    for (const item of items) {
      resizeOriginalPositions.set(item.id, {
        column: item.column,
        row: item.row,
        width: item.width,
        height: item.height
      });
    }
    if (styleElement) {
      const elements = gridElement.querySelectorAll("[data-gridiot-item]");
      for (const el of elements) {
        const element = el;
        if (element !== resizedElement) {
          element.style.gridColumn = "";
          element.style.gridRow = "";
        }
      }
      const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: resizeStartColumnCount });
      styleElement.textContent = css;
    }
    lastResizeLayout = null;
    log3("resize-start", {
      item: resizedItemId,
      cell: detail.cell,
      size: { colspan: detail.colspan, rowspan: detail.rowspan }
    });
  };
  const onResizeMove = (e) => {
    if (!resizedItemId || !resizeOriginalPositions) return;
    const detail = e.detail;
    if (lastResizeLayout && lastResizeLayout.cell.column === detail.cell.column && lastResizeLayout.cell.row === detail.cell.row && lastResizeLayout.colspan === detail.colspan && lastResizeLayout.rowspan === detail.rowspan) {
      return;
    }
    lastResizeLayout = {
      cell: { ...detail.cell },
      colspan: detail.colspan,
      rowspan: detail.rowspan
    };
    const items = [];
    for (const [id, original] of resizeOriginalPositions) {
      if (id === resizedItemId) {
        items.push({
          id,
          column: detail.cell.column,
          row: detail.cell.row,
          width: detail.colspan,
          height: detail.rowspan
        });
      } else {
        items.push({
          id,
          column: original.column,
          row: original.row,
          width: original.width,
          height: original.height
        });
      }
    }
    log3("resize-move", { targetCell: detail.cell, size: { colspan: detail.colspan, rowspan: detail.rowspan } });
    const newLayout = calculateLayout(items, resizedItemId, detail.cell, { compact: compaction });
    log3(
      "calculated resize layout",
      newLayout.map((it) => ({ id: it.id, col: it.column, row: it.row, w: it.width, h: it.height }))
    );
    applyLayout(newLayout, resizedItemId, false);
  };
  const onResizeEnd = (e) => {
    if (!resizedItemId || !resizeOriginalPositions) return;
    const detail = e.detail;
    log3("resize-end", { finalCell: detail.cell, size: { colspan: detail.colspan, rowspan: detail.rowspan } });
    const items = [];
    for (const [id, original] of resizeOriginalPositions) {
      if (id === resizedItemId) {
        items.push({
          id,
          column: detail.cell.column,
          row: detail.cell.row,
          width: detail.colspan,
          height: detail.rowspan
        });
      } else {
        items.push({
          id,
          column: original.column,
          row: original.row,
          width: original.width,
          height: original.height
        });
      }
    }
    const finalLayout = calculateLayout(items, resizedItemId, detail.cell, { compact: compaction });
    log3(
      "final resize layout",
      finalLayout.map((it) => ({ id: it.id, col: it.column, row: it.row, w: it.width, h: it.height }))
    );
    const isPointerResize = resizedElement?.style.position === "fixed";
    log3("resize-end isPointerResize:", isPointerResize);
    const useViewTransition = !isPointerResize;
    log3("resize-end: useViewTransition:", useViewTransition);
    const savedResizedItemId = resizedItemId;
    const savedResizeStartColumnCount = resizeStartColumnCount;
    const saveToLayoutModel = () => {
      if (layoutModel && savedResizeStartColumnCount) {
        const positions = /* @__PURE__ */ new Map();
        for (const item of finalLayout) {
          positions.set(item.id, { column: item.column, row: item.row });
        }
        layoutModel.saveLayout(savedResizeStartColumnCount, positions);
        layoutModel.updateItemSize(savedResizedItemId, { width: detail.colspan, height: detail.rowspan });
        log3("saved resize layout to model for", savedResizeStartColumnCount, "columns");
        if (styleElement) {
          styleElement.textContent = "";
          log3("cleared preview styles");
        }
      }
    };
    applyLayout(finalLayout, null, useViewTransition, saveToLayoutModel);
    resizedItemId = null;
    resizedElement = null;
    resizeOriginalPositions = null;
    lastResizeLayout = null;
    resizeStartColumnCount = null;
  };
  const onResizeCancel = () => {
    if (!resizedItemId || !resizeOriginalPositions) return;
    const restoreLayout = readItemsFromDOM(gridElement).map(
      (item) => {
        const original = resizeOriginalPositions.get(item.id);
        if (original) {
          return {
            ...item,
            column: original.column,
            row: original.row,
            width: original.width,
            height: original.height
          };
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
    resizedItemId = null;
    resizedElement = null;
    resizeOriginalPositions = null;
    lastResizeLayout = null;
    resizeStartColumnCount = null;
  };
  gridElement.addEventListener("gridiot:drag-start", onDragStart);
  gridElement.addEventListener("gridiot:drag-move", onDragMove);
  gridElement.addEventListener("gridiot:drag-end", onDragEnd);
  gridElement.addEventListener("gridiot:drag-cancel", onDragCancel);
  gridElement.addEventListener("gridiot:camera-settled", onCameraSettled);
  gridElement.addEventListener("gridiot:resize-start", onResizeStart);
  gridElement.addEventListener("gridiot:resize-move", onResizeMove);
  gridElement.addEventListener("gridiot:resize-end", onResizeEnd);
  gridElement.addEventListener("gridiot:resize-cancel", onResizeCancel);
  return () => {
    gridElement.removeEventListener("gridiot:drag-start", onDragStart);
    gridElement.removeEventListener("gridiot:drag-move", onDragMove);
    gridElement.removeEventListener("gridiot:drag-end", onDragEnd);
    gridElement.removeEventListener("gridiot:drag-cancel", onDragCancel);
    gridElement.removeEventListener("gridiot:camera-settled", onCameraSettled);
    gridElement.removeEventListener("gridiot:resize-start", onResizeStart);
    gridElement.removeEventListener("gridiot:resize-move", onResizeMove);
    gridElement.removeEventListener("gridiot:resize-end", onResizeEnd);
    gridElement.removeEventListener("gridiot:resize-cancel", onResizeCancel);
  };
}
registerPlugin({
  name: "algorithm-push",
  init(core, options) {
    return attachPushAlgorithm(core.element, {
      ...options,
      core: options?.core ?? core
    });
  }
});

// plugins/responsive.ts
var DEBUG4 = false;
function log4(...args) {
  if (DEBUG4) console.log("[responsive]", ...args);
}
function attachResponsive(gridElement, options, core) {
  const { layoutModel, styleElement } = options;
  let cellSize = options.cellSize;
  let gap = options.gap;
  function inferGridMetrics() {
    if (cellSize !== void 0 && gap !== void 0) return;
    const style = getComputedStyle(gridElement);
    if (gap === void 0) {
      gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 16;
    }
    if (cellSize === void 0) {
      const autoRows = parseFloat(style.gridAutoRows) || 0;
      if (autoRows > 0) {
        cellSize = autoRows;
      } else {
        const columns = style.gridTemplateColumns.split(" ");
        cellSize = parseFloat(columns[0] ?? "184") || 184;
      }
    }
    log4("Inferred grid metrics:", { cellSize, gap });
  }
  function detectColumnCount() {
    const style = getComputedStyle(gridElement);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean);
    return Math.max(1, columns.length);
  }
  function injectCSS() {
    inferGridMetrics();
    const gridSelector = gridElement.id ? `#${gridElement.id}` : gridElement.className ? `.${gridElement.className.split(" ")[0]}` : ".grid";
    const css = layoutModel.generateAllBreakpointCSS({
      cellSize,
      gap,
      gridSelector
    });
    styleElement.textContent = css;
    log4("Injected CSS for all breakpoints");
  }
  if (core) {
    core.providers.register("responsive", () => ({
      columnCount: layoutModel.currentColumnCount,
      maxColumns: layoutModel.maxColumns,
      minColumns: layoutModel.minColumns,
      hasOverride: layoutModel.hasOverride(layoutModel.currentColumnCount)
    }));
  }
  const hasServerRenderedCSS = !!styleElement.textContent?.trim();
  if (!hasServerRenderedCSS) {
    injectCSS();
  } else {
    log4("Skipping initial CSS injection - server-rendered CSS detected");
  }
  const unsubscribe = layoutModel.subscribe(() => {
    log4("Layout model changed, regenerating CSS");
    injectCSS();
  });
  let lastColumnCount = layoutModel.currentColumnCount;
  const resizeObserver = new ResizeObserver(() => {
    const newColumnCount = detectColumnCount();
    if (newColumnCount !== lastColumnCount) {
      const previousCount = lastColumnCount;
      lastColumnCount = newColumnCount;
      layoutModel.setCurrentColumnCount(newColumnCount);
      log4("Column count changed:", previousCount, "->", newColumnCount);
      const detail = {
        previousCount,
        currentCount: newColumnCount
      };
      gridElement.dispatchEvent(
        new CustomEvent("gridiot:column-count-change", {
          bubbles: true,
          detail
        })
      );
    }
  });
  resizeObserver.observe(gridElement);
  return () => {
    resizeObserver.disconnect();
    unsubscribe();
  };
}
function ensureContainerWrapper(gridElement) {
  const parent = gridElement.parentElement;
  if (parent) {
    const style = getComputedStyle(parent);
    if (style.containerType === "inline-size" || style.containerType === "size") {
      return parent;
    }
  }
  const gridStyle = getComputedStyle(gridElement);
  if (gridStyle.containerType === "inline-size" || gridStyle.containerType === "size") {
    return gridElement;
  }
  if (parent) {
    parent.style.containerType = "inline-size";
    log4("Applied container-type: inline-size to parent");
    return parent;
  }
  console.warn(
    "[gridiot:responsive] Grid has no parent element. Container queries may not work."
  );
  return gridElement;
}
registerPlugin({
  name: "responsive",
  init(core, options) {
    if (!options?.layoutModel || !options?.styleElement) {
      return;
    }
    return attachResponsive(
      core.element,
      {
        layoutModel: options.layoutModel,
        styleElement: options.styleElement,
        cellSize: options.cellSize,
        gap: options.gap
      },
      options.core ?? core
    );
  }
});

// layout-model.ts
var MAX_ROWS = 100;
function createLayoutModel(options) {
  const { maxColumns, minColumns = 1, items: itemDefs } = options;
  const items = /* @__PURE__ */ new Map();
  for (const item of itemDefs) {
    items.set(item.id, { id: item.id, width: item.width, height: item.height });
  }
  let canonicalPositions = new Map(
    options.canonicalPositions
  );
  const overrides = new Map(
    options.overrides
  );
  let currentColumnCount = maxColumns;
  const subscribers = /* @__PURE__ */ new Set();
  function notifySubscribers() {
    for (const callback of Array.from(subscribers)) {
      callback();
    }
  }
  function getItemsInPositionOrder(positions) {
    return Array.from(items.values()).sort((a, b) => {
      const posA = positions.get(a.id) ?? { column: 0, row: 0 };
      const posB = positions.get(b.id) ?? { column: 0, row: 0 };
      return posA.row - posB.row || posA.column - posB.column;
    });
  }
  function deriveLayoutForColumns(cols, sourcePositions) {
    const sorted = getItemsInPositionOrder(sourcePositions);
    const result = /* @__PURE__ */ new Map();
    const occupied = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      occupied.push(new Array(cols).fill(null));
    }
    for (const itemDef of sorted) {
      const w = Math.min(itemDef.width, cols);
      const h = itemDef.height;
      let placed = false;
      for (let row = 0; row < MAX_ROWS && !placed; row++) {
        for (let col = 0; col <= cols - w && !placed; col++) {
          let canFit = true;
          for (let dy = 0; dy < h && canFit; dy++) {
            for (let dx = 0; dx < w && canFit; dx++) {
              if (occupied[row + dy]?.[col + dx] !== null) {
                canFit = false;
              }
            }
          }
          if (canFit) {
            result.set(itemDef.id, { column: col + 1, row: row + 1 });
            for (let dy = 0; dy < h; dy++) {
              for (let dx = 0; dx < w; dx++) {
                if (occupied[row + dy]) {
                  occupied[row + dy][col + dx] = itemDef.id;
                }
              }
            }
            placed = true;
          }
        }
      }
      if (!placed) {
        result.set(itemDef.id, { column: 1, row: MAX_ROWS });
      }
    }
    return result;
  }
  function getBreakpointWidth(cols, cellSize, gap) {
    return cols * cellSize + (cols - 1) * gap;
  }
  const model = {
    get maxColumns() {
      return maxColumns;
    },
    get minColumns() {
      return minColumns;
    },
    get items() {
      return items;
    },
    get currentColumnCount() {
      return currentColumnCount;
    },
    getLayoutForColumns(columnCount) {
      const cols = Math.max(minColumns, Math.min(maxColumns, columnCount));
      if (cols === maxColumns) {
        return new Map(canonicalPositions);
      }
      const override = overrides.get(cols);
      if (override) {
        return new Map(override);
      }
      return deriveLayoutForColumns(cols, canonicalPositions);
    },
    getCurrentLayout() {
      return this.getLayoutForColumns(currentColumnCount);
    },
    hasOverride(columnCount) {
      return overrides.has(columnCount);
    },
    getOverrideColumnCounts() {
      return Array.from(overrides.keys()).sort((a, b) => b - a);
    },
    saveLayout(columnCount, positions) {
      const cols = Math.max(minColumns, Math.min(maxColumns, columnCount));
      if (cols === maxColumns) {
        canonicalPositions = new Map(positions);
      } else {
        overrides.set(cols, new Map(positions));
      }
      notifySubscribers();
    },
    clearOverride(columnCount) {
      if (columnCount === maxColumns) {
        return;
      }
      if (overrides.delete(columnCount)) {
        notifySubscribers();
      }
    },
    updateItemSize(itemId, size) {
      const existing = items.get(itemId);
      if (!existing) {
        console.warn(`[layout-model] updateItemSize: item "${itemId}" not found in items Map. Available IDs:`, Array.from(items.keys()));
        return;
      }
      items.set(itemId, {
        id: itemId,
        width: size.width,
        height: size.height
      });
      notifySubscribers();
    },
    setCurrentColumnCount(columnCount) {
      const newCount = Math.max(minColumns, Math.min(maxColumns, columnCount));
      if (newCount !== currentColumnCount) {
        currentColumnCount = newCount;
      }
    },
    generateAllBreakpointCSS(options2) {
      const {
        selectorPrefix = "#",
        selectorSuffix = "",
        cellSize,
        gap,
        gridSelector = ".grid-container"
      } = options2 ?? { cellSize: 184, gap: 16 };
      const cssRules = [];
      cssRules.push("/* Fallback: canonical layout (before container queries evaluate) */");
      for (const [id, pos] of Array.from(canonicalPositions)) {
        const itemDef = items.get(id);
        if (!itemDef) continue;
        cssRules.push(
          `${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${itemDef.width}; grid-row: ${pos.row} / span ${itemDef.height}; }`
        );
      }
      cssRules.push("");
      for (let cols = maxColumns; cols >= minColumns; cols--) {
        const positions = this.getLayoutForColumns(cols);
        const minWidth = getBreakpointWidth(cols, cellSize, gap);
        const hasOverride = overrides.has(cols);
        let containerQuery;
        if (cols === maxColumns) {
          containerQuery = `@container (min-width: ${minWidth}px)`;
        } else if (cols === minColumns) {
          const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
          containerQuery = `@container (max-width: ${maxWidth}px)`;
        } else {
          const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
          containerQuery = `@container (min-width: ${minWidth}px) and (max-width: ${maxWidth}px)`;
        }
        const itemRules = [];
        itemRules.push(
          `${gridSelector} { grid-template-columns: repeat(${cols}, 1fr); }`
        );
        for (const [id, pos] of positions) {
          const itemDef = items.get(id);
          if (!itemDef) continue;
          const w = Math.min(itemDef.width, cols);
          itemRules.push(
            `${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${w}; grid-row: ${pos.row} / span ${itemDef.height}; }`
          );
        }
        const layoutType = cols === maxColumns ? "(canonical)" : hasOverride ? "(override)" : "(derived)";
        cssRules.push(`/* ${cols} columns ${layoutType} */`);
        cssRules.push(`${containerQuery} {`);
        cssRules.push(itemRules.map((r) => "  " + r).join("\n"));
        cssRules.push("}");
        cssRules.push("");
      }
      return cssRules.join("\n");
    },
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }
  };
  return model;
}
function buildLayoutItems(itemDefs, positions, columnCount) {
  const result = [];
  for (const [id, def] of Array.from(itemDefs)) {
    const pos = positions.get(id);
    if (pos) {
      result.push({
        id: def.id,
        // Clamp width to current column count
        width: Math.min(def.width, columnCount),
        height: def.height,
        column: pos.column,
        row: pos.row
      });
    }
  }
  return result;
}
function layoutItemsToPositions(items) {
  const positions = /* @__PURE__ */ new Map();
  for (const item of items) {
    positions.set(item.id, { column: item.column, row: item.row });
  }
  return positions;
}
export {
  PLACEHOLDER_CSS,
  animateFLIP,
  animateFLIPWithTracking,
  attachCamera,
  attachPlaceholder,
  attachPlaceholderStyles,
  attachPushAlgorithm,
  attachResize,
  attachResponsive,
  buildLayoutItems,
  calculateLayout,
  createLayoutModel,
  ensureContainerWrapper,
  getItemCell,
  getItemViewTransitionName,
  getPlugin,
  init,
  layoutItemsToPositions,
  layoutToCSS,
  readItemsFromDOM,
  registerPlugin,
  setItemCell,
  withViewTransitionExclusion
};
//# sourceMappingURL=gridiot.js.map
