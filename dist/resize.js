// engine.ts
var plugins = /* @__PURE__ */ new Map();
function registerPlugin(plugin) {
  plugins.set(plugin.name, plugin);
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
    let projectedColumn = startCell.column;
    let projectedRow = startCell.row;
    if (handle === "w" || handle === "sw" || handle === "nw") {
      const rightEdge = startCell.column + originalSize.colspan - 1;
      projectedColumn = rightEdge - projectedColspan + 1;
    }
    if (handle === "n" || handle === "ne" || handle === "nw") {
      const bottomEdge = startCell.row + originalSize.rowspan - 1;
      projectedRow = bottomEdge - projectedRowspan + 1;
    }
    activeResize.currentSize = { colspan: projectedColspan, rowspan: projectedRowspan };
    activeResize.currentCell = { column: projectedColumn, row: projectedRow };
    if (sizeLabel) {
      sizeLabel.textContent = `${projectedColspan}\xD7${projectedRowspan}`;
    }
    let anchorCell;
    if (handle === "se" || handle === "s" || handle === "e") {
      anchorCell = { column: startCell.column, row: startCell.row };
    } else if (handle === "nw" || handle === "n" || handle === "w") {
      anchorCell = {
        column: startCell.column + originalSize.colspan - 1,
        row: startCell.row + originalSize.rowspan - 1
      };
    } else if (handle === "ne") {
      anchorCell = {
        column: startCell.column,
        row: startCell.row + originalSize.rowspan - 1
      };
    } else {
      anchorCell = {
        column: startCell.column + originalSize.colspan - 1,
        row: startCell.row
      };
    }
    emit("resize-move", {
      item,
      cell: { column: projectedColumn, row: projectedRow },
      anchorCell,
      startCell,
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
export {
  attachResize
};
//# sourceMappingURL=resize.js.map
