function getItemSize(item) {
	return {
		colspan: parseInt(item.getAttribute("data-egg-colspan") || "1", 10) || 1,
		rowspan: parseInt(item.getAttribute("data-egg-rowspan") || "1", 10) || 1
	};
}
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
var CURSOR = {
	nw: "nwse-resize",
	se: "nwse-resize",
	ne: "nesw-resize",
	sw: "nesw-resize",
	n: "ns-resize",
	s: "ns-resize",
	e: "ew-resize",
	w: "ew-resize"
};
function createSizeLabel() {
	const label = document.createElement("div");
	label.className = "egg-resize-label";
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
	const { core, handles = "corners", handleSize = 12, minSize = {
		colspan: 1,
		rowspan: 1
	}, maxSize = {
		colspan: 6,
		rowspan: 6
	}, showSizeLabel = true } = options;
	let activeResize = null;
	let hoveredItem = null;
	let hoveredHandle = null;
	function emit(event, detail) {
		gridElement.dispatchEvent(new CustomEvent(`egg-${event}`, {
			bubbles: true,
			detail
		}));
	}
	function startResize(item, handle, e) {
		const { colspan, rowspan } = getItemSize(item);
		const style = getComputedStyle(item);
		const column = parseInt(style.gridColumnStart, 10) || 1;
		const row = parseInt(style.gridRowStart, 10) || 1;
		const originalSize = {
			colspan,
			rowspan
		};
		const startCell = {
			column,
			row
		};
		const initialRect = item.getBoundingClientRect();
		let sizeLabel = null;
		if (showSizeLabel) {
			sizeLabel = createSizeLabel();
			sizeLabel.textContent = `${colspan}×${rowspan}`;
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
			sizeLabel,
			initialRect,
			startPointerX: e.clientX,
			startPointerY: e.clientY
		};
		item.setAttribute("data-egg-resizing", "");
		item.setAttribute("data-egg-handle-active", handle);
		item.removeAttribute("data-egg-handle-hover");
		item.setPointerCapture(e.pointerId);
		item.addEventListener("pointermove", onItemPointerMove);
		item.addEventListener("pointerup", onItemPointerUp);
		item.addEventListener("pointercancel", onItemPointerCancel);
		const itemId = item.id || item.getAttribute("data-egg-item") || "";
		core.stateMachine.transition({
			type: "START_INTERACTION",
			context: {
				type: "resize",
				mode: "pointer",
				itemId,
				element: item,
				columnCount: core.getGridInfo().columns.length
			}
		});
		emit("resize-start", {
			item,
			cell: startCell,
			colspan: originalSize.colspan,
			rowspan: originalSize.rowspan,
			handle,
			source: "pointer"
		});
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
		if (handle === "e" || handle === "se" || handle === "ne") newWidth = Math.max(minWidth, Math.min(maxWidth, initialRect.width + deltaX));
		if (handle === "w" || handle === "sw" || handle === "nw") {
			const maxLeftShift = initialRect.left - gridInfo.rect.left;
			const maxWidthFromLeft = Math.min(maxWidthByConfig, initialRect.width + maxLeftShift);
			const widthChange = Math.max(-initialRect.width + minWidth, Math.min(maxWidthFromLeft - initialRect.width, -deltaX));
			newWidth = initialRect.width + widthChange;
			newLeft = initialRect.left - widthChange;
		}
		if (handle === "s" || handle === "se" || handle === "sw") newHeight = Math.max(minHeight, Math.min(maxHeight, initialRect.height + deltaY));
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
		const RESIZE_SNAP = .3;
		let projectedColspan = Math.floor(rawColspanRatio + (1 - RESIZE_SNAP));
		let projectedRowspan = Math.floor(rawRowspanRatio + (1 - RESIZE_SNAP));
		projectedColspan = Math.max(minSize.colspan, Math.min(maxSize.colspan, projectedColspan));
		projectedRowspan = Math.max(minSize.rowspan, Math.min(maxSize.rowspan, projectedRowspan));
		let projectedColumn = startCell.column;
		let projectedRow = startCell.row;
		if (handle === "w" || handle === "sw" || handle === "nw") projectedColumn = startCell.column + originalSize.colspan - 1 - projectedColspan + 1;
		if (handle === "n" || handle === "ne" || handle === "nw") projectedRow = startCell.row + originalSize.rowspan - 1 - projectedRowspan + 1;
		activeResize.currentSize = {
			colspan: projectedColspan,
			rowspan: projectedRowspan
		};
		activeResize.currentCell = {
			column: projectedColumn,
			row: projectedRow
		};
		if (sizeLabel) sizeLabel.textContent = `${projectedColspan}×${projectedRowspan}`;
		let anchorCell;
		if (handle === "se" || handle === "s" || handle === "e") anchorCell = {
			column: startCell.column,
			row: startCell.row
		};
		else if (handle === "nw" || handle === "n" || handle === "w") anchorCell = {
			column: startCell.column + originalSize.colspan - 1,
			row: startCell.row + originalSize.rowspan - 1
		};
		else if (handle === "ne") anchorCell = {
			column: startCell.column,
			row: startCell.row + originalSize.rowspan - 1
		};
		else anchorCell = {
			column: startCell.column + originalSize.colspan - 1,
			row: startCell.row
		};
		emit("resize-move", {
			item,
			cell: {
				column: projectedColumn,
				row: projectedRow
			},
			anchorCell,
			startCell,
			colspan: projectedColspan,
			rowspan: projectedRowspan,
			handle,
			source: "pointer"
		});
	}
	function cleanupResizeListeners(item, pointerId) {
		item.releasePointerCapture(pointerId);
		item.removeEventListener("pointermove", onItemPointerMove);
		item.removeEventListener("pointerup", onItemPointerUp);
		item.removeEventListener("pointercancel", onItemPointerCancel);
	}
	function resetItem(item, pointerId, sizeLabel) {
		cleanupResizeListeners(item, pointerId);
		if (sizeLabel) sizeLabel.remove();
		item.style.position = "";
		item.style.left = "";
		item.style.top = "";
		item.style.width = "";
		item.style.height = "";
		item.style.zIndex = "";
		const itemId = item.style.getPropertyValue("--item-id") || item.dataset.eggItem || item.id || item.dataset.id;
		item.style.viewTransitionName = itemId || "";
		item.removeAttribute("data-egg-resizing");
		item.removeAttribute("data-egg-handle-active");
	}
	function finishResize() {
		if (!activeResize) return;
		const { item, pointerId, currentSize, currentCell, sizeLabel } = activeResize;
		item.setAttribute("data-egg-colspan", String(currentSize.colspan));
		item.setAttribute("data-egg-rowspan", String(currentSize.rowspan));
		core.stateMachine.transition({ type: "COMMIT_INTERACTION" });
		emit("resize-end", {
			item,
			cell: currentCell,
			colspan: currentSize.colspan,
			rowspan: currentSize.rowspan,
			source: "pointer"
		});
		resetItem(item, pointerId, sizeLabel);
		activeResize = null;
		core.stateMachine.transition({ type: "FINISH_COMMIT" });
	}
	function cancelResize() {
		if (!activeResize) return;
		const { item, pointerId, sizeLabel } = activeResize;
		emit("resize-cancel", {
			item,
			source: "pointer"
		});
		core.stateMachine.transition({ type: "CANCEL_INTERACTION" });
		resetItem(item, pointerId, sizeLabel);
		activeResize = null;
	}
	const onPointerDown = (e) => {
		const item = e.target.closest("[data-egg-item]");
		if (!item) return;
		const handle = detectHandle(e, item, handleSize, handles);
		if (!handle) return;
		e.stopPropagation();
		e.preventDefault();
		core.select(item);
		startResize(item, handle, e);
	};
	const onItemPointerMove = (e) => {
		if (activeResize && e.pointerId === activeResize.pointerId) updateResize(e);
	};
	const onItemPointerUp = (e) => {
		if (activeResize && e.pointerId === activeResize.pointerId) finishResize();
	};
	const onItemPointerCancel = (e) => {
		if (activeResize && e.pointerId === activeResize.pointerId) cancelResize();
	};
	const onPointerMove = (e) => {
		if (activeResize) return;
		const item = e.target.closest("[data-egg-item]");
		if (item) {
			const handle = detectHandle(e, item, handleSize, handles);
			if (handle !== hoveredHandle || item !== hoveredItem) {
				if (hoveredItem && hoveredItem !== item) {
					hoveredItem.style.cursor = "";
					hoveredItem.removeAttribute("data-egg-handle-hover");
				}
				if (hoveredItem === item && hoveredHandle && !handle) item.removeAttribute("data-egg-handle-hover");
				hoveredItem = item;
				hoveredHandle = handle;
				item.style.cursor = (handle ? CURSOR[handle] : "") || "";
				if (handle) item.setAttribute("data-egg-handle-hover", handle);
				else item.removeAttribute("data-egg-handle-hover");
			}
		} else if (hoveredItem) {
			hoveredItem.style.cursor = "";
			hoveredItem.removeAttribute("data-egg-handle-hover");
			hoveredItem = null;
			hoveredHandle = null;
		}
	};
	const onKeyDown = (e) => {
		if (e.key === "Escape" && activeResize) cancelResize();
	};
	gridElement.addEventListener("pointerdown", onPointerDown, { capture: true });
	gridElement.addEventListener("pointermove", onPointerMove);
	document.addEventListener("keydown", onKeyDown);
	function destroy() {
		gridElement.removeEventListener("pointerdown", onPointerDown, { capture: true });
		gridElement.removeEventListener("pointermove", onPointerMove);
		document.removeEventListener("keydown", onKeyDown);
		if (activeResize) cancelResize();
	}
	return { destroy };
}
export { attachResize };

//# sourceMappingURL=resize.js.map