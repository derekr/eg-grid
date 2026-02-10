function listenEvents(element, events) {
	for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
	return () => {
		for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
	};
}
function layoutToCSS(items, options = {}) {
	const { selectorPrefix = "[data-egg-item=\"", selectorSuffix = "\"]", excludeSelector = "", maxColumns } = options;
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
function readItemsFromDOM(container) {
	const elements = container.querySelectorAll("[data-egg-item]");
	return Array.from(elements).map((el) => {
		const element = el;
		const style = getComputedStyle(element);
		const column = parseInt(style.gridColumnStart, 10) || 1;
		const row = parseInt(style.gridRowStart, 10) || 1;
		const width = parseInt(element.getAttribute("data-egg-colspan") || "1", 10) || 1;
		const height = parseInt(element.getAttribute("data-egg-rowspan") || "1", 10) || 1;
		return {
			id: element.dataset.eggItem || element.dataset.id || "",
			column,
			row,
			width,
			height
		};
	});
}
function attachAlgorithm(gridElement, strategy, options = {}) {
	const { selectorPrefix = "[data-egg-item=\"", selectorSuffix = "\"]", core, layoutModel } = options;
	const styles = core?.styles ?? null;
	function getCurrentColumnCount() {
		const columns = getComputedStyle(gridElement).gridTemplateColumns.split(" ").filter(Boolean);
		return Math.max(1, columns.length);
	}
	let originalPositions = null;
	let draggedItemId = null;
	let draggedElement = null;
	let dragSource = null;
	let layoutVersion = 0;
	let dragStartColumnCount = null;
	let resizedItemId = null;
	let resizedElement = null;
	let resizeSource = null;
	let resizeOriginalPositions = null;
	let lastResizeLayout = null;
	let resizeStartColumnCount = null;
	function getItemId(element) {
		return element.dataset.eggItem || element.dataset.id || "";
	}
	function getItemsWithOriginals(excludeId, originals) {
		return readItemsFromDOM(gridElement).map((item) => {
			const original = originals.get(item.id);
			if (original && item.id !== excludeId) return {
				...item,
				column: original.column,
				row: original.row
			};
			return item;
		});
	}
	function getResizeItems(originals, resizedId, cell, colspan, rowspan) {
		const items = [];
		for (const [id, original] of originals) if (id === resizedId) items.push({
			id,
			column: cell.column,
			row: cell.row,
			width: colspan,
			height: rowspan
		});
		else items.push({
			id,
			column: original.column,
			row: original.row,
			width: original.width,
			height: original.height
		});
		return items;
	}
	function saveAndClearPreview(layout, columnCount, afterSave) {
		if (!layoutModel || !columnCount) return;
		const positions = /* @__PURE__ */ new Map();
		for (const item of layout) positions.set(item.id, {
			column: item.column,
			row: item.row
		});
		layoutModel.saveLayout(columnCount, positions);
		if (afterSave) afterSave();
		if (styles) {
			styles.clear("preview");
			styles.commit();
		}
		if (core) core.emit("layout-change", {
			items: layout,
			columnCount
		});
	}
	function applyLayout(layout, excludeId, useViewTransition, onApplied) {
		const thisVersion = ++layoutVersion;
		const capturedColumnCount = dragStartColumnCount ?? resizeStartColumnCount;
		const applyChanges = () => {
			if (thisVersion !== layoutVersion) return;
			if (styles) {
				const css = layoutToCSS(excludeId ? layout.filter((item) => item.id !== excludeId) : layout, {
					selectorPrefix,
					selectorSuffix,
					maxColumns: capturedColumnCount ?? void 0
				});
				styles.set("preview", css);
				styles.commit();
				const elements = gridElement.querySelectorAll("[data-egg-item]");
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
				const elements = gridElement.querySelectorAll("[data-egg-item]");
				for (const el of elements) {
					const element = el;
					const id = getItemId(element);
					if (id === excludeId) continue;
					const item = layout.find((it) => it.id === id);
					if (item) {
						const colspan = parseInt(element.getAttribute("data-egg-colspan") || "1", 10) || 1;
						const rowspan = parseInt(element.getAttribute("data-egg-rowspan") || "1", 10) || 1;
						element.style.gridColumn = `${item.column} / span ${colspan}`;
						element.style.gridRow = `${item.row} / span ${rowspan}`;
					}
				}
			}
			if (onApplied) onApplied();
		};
		if (useViewTransition && "startViewTransition" in document) {
			if (draggedElement && excludeId) draggedElement.style.viewTransitionName = "dragging";
			document.startViewTransition(applyChanges);
		} else applyChanges();
	}
	const onDragStart = (e) => {
		const detail = e.detail;
		draggedElement = detail.item;
		draggedItemId = getItemId(detail.item);
		dragSource = detail.source;
		dragStartColumnCount = getCurrentColumnCount();
		const items = readItemsFromDOM(gridElement);
		originalPositions = /* @__PURE__ */ new Map();
		for (const item of items) originalPositions.set(item.id, {
			column: item.column,
			row: item.row
		});
		if (styles) {
			const elements = gridElement.querySelectorAll("[data-egg-item]");
			for (const el of elements) {
				const element = el;
				if (element !== draggedElement) {
					element.style.gridColumn = "";
					element.style.gridRow = "";
				}
			}
			const css = layoutToCSS(items, {
				selectorPrefix,
				selectorSuffix,
				maxColumns: dragStartColumnCount
			});
			styles.set("preview", css);
			styles.commit();
		}
	};
	let pendingCell = null;
	const onDragMove = (e) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = e.detail;
		if (core?.cameraScrolling) {
			pendingCell = detail.cell;
			return;
		}
		pendingCell = null;
		const items = getItemsWithOriginals(draggedItemId, originalPositions);
		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateDragLayout(items, draggedItemId, detail.cell, columns);
		applyLayout(newLayout, draggedItemId, true);
		if (strategy.afterDragMove) strategy.afterDragMove(newLayout, draggedItemId, gridElement);
	};
	const onDragEnd = (e) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = e.detail;
		const items = getItemsWithOriginals(draggedItemId, originalPositions);
		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const finalLayout = strategy.calculateDragLayout(items, draggedItemId, detail.cell, columns);
		const isPointerDrag = dragSource === "pointer";
		if (draggedElement && draggedElement.style.viewTransitionName === "dragging") draggedElement.style.viewTransitionName = "";
		const useViewTransition = !isPointerDrag;
		const savedDragStartColumnCount = dragStartColumnCount;
		applyLayout(finalLayout, null, useViewTransition, () => saveAndClearPreview(finalLayout, savedDragStartColumnCount));
		draggedItemId = null;
		draggedElement = null;
		dragSource = null;
		originalPositions = null;
		pendingCell = null;
		dragStartColumnCount = null;
	};
	const onDragCancel = () => {
		if (!draggedItemId || !originalPositions) return;
		if (draggedElement && draggedElement.style.viewTransitionName === "dragging") draggedElement.style.viewTransitionName = "";
		const restoreLayout = getItemsWithOriginals(null, originalPositions);
		const restore = () => applyLayout(restoreLayout, null, false);
		if ("startViewTransition" in document) document.startViewTransition(restore);
		else restore();
		draggedItemId = null;
		draggedElement = null;
		dragSource = null;
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
		if (!cell) return;
		pendingCell = null;
		const items = getItemsWithOriginals(draggedItemId, originalPositions);
		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateDragLayout(items, draggedItemId, cell, columns);
		applyLayout(newLayout, draggedItemId, true);
		if (strategy.afterDragMove) strategy.afterDragMove(newLayout, draggedItemId, gridElement);
	};
	const onResizeStart = (e) => {
		if (!strategy.calculateResizeLayout) return;
		const detail = e.detail;
		resizedElement = detail.item;
		resizedItemId = getItemId(detail.item);
		resizeSource = detail.source;
		resizeStartColumnCount = getCurrentColumnCount();
		const items = readItemsFromDOM(gridElement);
		resizeOriginalPositions = /* @__PURE__ */ new Map();
		for (const item of items) resizeOriginalPositions.set(item.id, {
			column: item.column,
			row: item.row,
			width: item.width,
			height: item.height
		});
		if (styles) {
			const elements = gridElement.querySelectorAll("[data-egg-item]");
			for (const el of elements) {
				const element = el;
				if (element !== resizedElement) {
					element.style.gridColumn = "";
					element.style.gridRow = "";
				}
			}
			const css = layoutToCSS(items, {
				selectorPrefix,
				selectorSuffix,
				maxColumns: resizeStartColumnCount
			});
			styles.set("preview", css);
			styles.commit();
		}
		lastResizeLayout = null;
	};
	const onResizeMove = (e) => {
		if (!strategy.calculateResizeLayout) return;
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = e.detail;
		if (lastResizeLayout && lastResizeLayout.cell.column === detail.cell.column && lastResizeLayout.cell.row === detail.cell.row && lastResizeLayout.colspan === detail.colspan && lastResizeLayout.rowspan === detail.rowspan) return;
		lastResizeLayout = {
			cell: { ...detail.cell },
			colspan: detail.colspan,
			rowspan: detail.rowspan
		};
		const items = getResizeItems(resizeOriginalPositions, resizedItemId, detail.cell, detail.colspan, detail.rowspan);
		const columns = resizeStartColumnCount ?? getCurrentColumnCount();
		applyLayout(strategy.calculateResizeLayout(items, resizedItemId, detail.cell, detail.colspan, detail.rowspan, columns), resizedItemId, true);
	};
	const onResizeEnd = (e) => {
		if (!strategy.calculateResizeLayout) return;
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = e.detail;
		const items = getResizeItems(resizeOriginalPositions, resizedItemId, detail.cell, detail.colspan, detail.rowspan);
		const columns = resizeStartColumnCount ?? getCurrentColumnCount();
		const finalLayout = strategy.calculateResizeLayout(items, resizedItemId, detail.cell, detail.colspan, detail.rowspan, columns);
		const useViewTransition = !(resizeSource === "pointer");
		const savedResizedItemId = resizedItemId;
		const savedResizeStartColumnCount = resizeStartColumnCount;
		applyLayout(finalLayout, null, useViewTransition, () => saveAndClearPreview(finalLayout, savedResizeStartColumnCount, () => {
			layoutModel.updateItemSize(savedResizedItemId, {
				width: detail.colspan,
				height: detail.rowspan
			});
		}));
		resizedItemId = null;
		resizedElement = null;
		resizeSource = null;
		resizeOriginalPositions = null;
		lastResizeLayout = null;
		resizeStartColumnCount = null;
	};
	const onResizeCancel = () => {
		if (!resizedItemId || !resizeOriginalPositions) return;
		const restoreLayout = Array.from(resizeOriginalPositions, ([id, o]) => ({
			id,
			column: o.column,
			row: o.row,
			width: o.width,
			height: o.height
		}));
		const restore = () => applyLayout(restoreLayout, null, false);
		if ("startViewTransition" in document) document.startViewTransition(restore);
		else restore();
		resizedItemId = null;
		resizedElement = null;
		resizeSource = null;
		resizeOriginalPositions = null;
		lastResizeLayout = null;
		resizeStartColumnCount = null;
	};
	return listenEvents(gridElement, {
		"egg-drag-start": onDragStart,
		"egg-drag-move": onDragMove,
		"egg-drag-end": onDragEnd,
		"egg-drag-cancel": onDragCancel,
		"egg-camera-settled": onCameraSettled,
		"egg-resize-start": onResizeStart,
		"egg-resize-move": onResizeMove,
		"egg-resize-end": onResizeEnd,
		"egg-resize-cancel": onResizeCancel
	});
}
function getItemOrder(items) {
	return [...items].sort((a, b) => a.row - b.row || a.column - b.column);
}
function rangeAvailable(occupied, column, row, width, height, columns) {
	if (column + width - 1 > columns) return false;
	for (let r = row; r < row + height; r++) for (let c = column; c < column + width; c++) if (occupied.has(`${c},${r}`)) return false;
	return true;
}
function markOccupied(occupied, column, row, width, height) {
	for (let r = row; r < row + height; r++) for (let c = column; c < column + width; c++) occupied.add(`${c},${r}`);
}
function reflowItems(items, columns) {
	const occupied = /* @__PURE__ */ new Set();
	const result = [];
	for (const item of items) {
		const width = Math.min(item.width, columns);
		let placed = false;
		for (let row = 1; !placed; row++) {
			for (let col = 1; col <= columns; col++) if (rangeAvailable(occupied, col, row, width, item.height, columns)) {
				markOccupied(occupied, col, row, width, item.height);
				result.push({
					...item,
					column: col,
					row,
					width
				});
				placed = true;
				break;
			}
			if (row > 100) {
				result.push({
					...item,
					column: 1,
					row,
					width
				});
				markOccupied(occupied, 1, row, width, item.height);
				placed = true;
			}
		}
	}
	return result;
}
function positionBefore(a, b) {
	return a.row < b.row || a.row === b.row && a.column < b.column;
}
function calculateReorderLayout(items, movedId, targetCell, options) {
	const { columns } = options;
	const ordered = getItemOrder(items.map((item) => ({ ...item })));
	const movedItem = ordered.find((it) => it.id === movedId);
	if (!movedItem) return reflowItems(ordered, columns);
	const remaining = ordered.filter((it) => it.id !== movedId);
	const reflowed = reflowItems(remaining, columns);
	let insertIndex = reflowed.length;
	for (let i = 0; i < reflowed.length; i++) if (!positionBefore(reflowed[i], targetCell)) {
		insertIndex = i;
		break;
	}
	return reflowItems([
		...remaining.slice(0, insertIndex),
		movedItem,
		...remaining.slice(insertIndex)
	], columns);
}
function attachReorderAlgorithm(gridElement, options = {}) {
	return attachAlgorithm(gridElement, {
		calculateDragLayout(items, movedId, targetCell, columns) {
			return calculateReorderLayout(items, movedId, targetCell, { columns });
		},
		afterDragMove(layout, movedId, el) {
			const landingItem = layout.find((it) => it.id === movedId);
			if (landingItem) {
				const previewDetail = {
					cell: {
						column: landingItem.column,
						row: landingItem.row
					},
					colspan: landingItem.width,
					rowspan: landingItem.height
				};
				queueMicrotask(() => {
					el.dispatchEvent(new CustomEvent("egg-drop-preview", {
						detail: previewDetail,
						bubbles: true
					}));
				});
			}
		},
		calculateResizeLayout(items, _resizedId, _cell, _colspan, _rowspan, columns) {
			return reflowItems([...items].sort((a, b) => a.row - b.row || a.column - b.column), columns);
		}
	}, options);
}
export { attachReorderAlgorithm, calculateReorderLayout, getItemOrder, layoutToCSS, reflowItems };

//# sourceMappingURL=algorithm-reorder.js.map