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
var DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[pointer]", ...args);
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
      log("drag-start", { startCell, rect: { left: rect.left, top: rect.top } });
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
        log("drag-end", { cell });
        core.emit("drag-end", { item, cell, colspan, rowspan });
      } else {
        log("drag-end", { cell: lastCell, note: "using lastCell (pointer outside grid)" });
        core.emit("drag-end", { item, cell: lastCell, colspan, rowspan });
      }
      cleanup();
      requestAnimationFrame(() => {
        log("FLIP", { firstRect: { left: firstRect.left.toFixed(0), top: firstRect.top.toFixed(0) } });
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
export {
  getItemCell,
  getPlugin,
  init,
  registerPlugin,
  setItemCell
};
//# sourceMappingURL=gridiot-minimal.js.map
