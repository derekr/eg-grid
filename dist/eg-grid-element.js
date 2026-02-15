function reducer(state, action) {
	switch (action.type) {
		case "SELECT":
			if (state.phase !== "idle" && state.phase !== "selected") return state;
			return {
				...state,
				phase: "selected",
				selectedItemId: action.itemId
			};
		case "DESELECT":
			if (state.phase !== "selected") return state;
			return {
				...state,
				phase: "idle",
				selectedItemId: null
			};
		case "START_INTERACTION":
			if (state.phase !== "selected") return state;
			return {
				...state,
				phase: "interacting",
				interaction: action.context
			};
		case "COMMIT_INTERACTION":
			if (state.phase !== "interacting") return state;
			return {
				...state,
				phase: "committing"
			};
		case "CANCEL_INTERACTION":
			if (state.phase !== "interacting") return state;
			return {
				...state,
				phase: "selected",
				interaction: null
			};
		case "FINISH_COMMIT":
			if (state.phase !== "committing") return state;
			return {
				...state,
				phase: "selected",
				interaction: null
			};
		default: return state;
	}
}
function createStateMachine() {
	let state = {
		phase: "idle",
		selectedItemId: null,
		interaction: null
	};
	return {
		getState() {
			return state;
		},
		transition(action) {
			const nextState = reducer(state, action);
			if (nextState !== state) state = nextState;
			return state;
		}
	};
}
function isDragging(state) {
	return (state.phase === "interacting" || state.phase === "committing") && state.interaction?.type === "drag";
}
function animateFLIP(element, firstRect, options = {}) {
	const { duration = 200, easing = "cubic-bezier(0.2, 0, 0, 1)", onStart, onFinish } = options;
	const lastRect = element.getBoundingClientRect();
	const deltaX = firstRect.left - lastRect.left;
	const deltaY = firstRect.top - lastRect.top;
	if (Math.abs(deltaX) <= 1 && Math.abs(deltaY) <= 1) {
		onFinish?.();
		return null;
	}
	onStart?.();
	const keyframes = [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }];
	const animation = element.animate(keyframes, {
		duration,
		easing
	});
	animation.onfinish = () => onFinish?.();
	return animation;
}
function getItemViewTransitionName(element) {
	return element.style.getPropertyValue("--item-id") || element.dataset.eggItem || element.id || element.dataset.id || null;
}
function animateFLIPWithTracking(element, firstRect, options = {}) {
	const { attributeName = "data-egg-dropping", ...flipOptions } = options;
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
			if (itemId) element.style.viewTransitionName = itemId;
			flipOptions.onFinish?.();
		}
	});
	if (!animation) {
		const itemId = getItemViewTransitionName(element);
		if (itemId) element.style.viewTransitionName = itemId;
	}
	return animation;
}
var HYSTERESIS = .4;
var TARGET_CHANGE_DEBOUNCE = 40;
var DRAG_THRESHOLD = 5;
var PREDICTION_THRESHOLD = 30;
var PREDICTION_LEAD = .5;
function attachPointer(core) {
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
			rowspan,
			dragStartX: e.clientX,
			dragStartY: e.clientY
		};
		item.setAttribute("data-egg-dragging", "");
		document.body.classList.add("is-dragging");
		const itemId = item.id || item.getAttribute("data-egg-item") || "";
		core.stateMachine.transition({
			type: "START_INTERACTION",
			context: {
				type: "drag",
				mode: "pointer",
				itemId,
				element: item,
				columnCount: core.getGridInfo().columns.length
			}
		});
		core.emit("drag-start", {
			item,
			cell: startCell,
			colspan,
			rowspan,
			source: "pointer"
		});
		item.style.position = "fixed";
		item.style.left = `${rect.left}px`;
		item.style.top = `${rect.top}px`;
		item.style.width = `${rect.width}px`;
		item.style.height = `${rect.height}px`;
		item.style.zIndex = "100";
		pendingDrag = null;
	};
	const onPointerDown = (e) => {
		const item = e.target.closest("[data-egg-item]");
		if (!item) return;
		core.select(item);
		e.preventDefault();
		const rect = item.getBoundingClientRect();
		const startCell = getItemCell(item);
		const { colspan, rowspan } = getItemSize(item);
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
			if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) startDrag(pendingDrag, e);
			else return;
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
			const gridInfo = core.getGridInfo();
			const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
			const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);
			const cell = {
				column: Math.max(1, Math.min(maxColumn, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row))
			};
			const now = performance.now();
			const timeSinceLastChange = now - dragState.lastTargetChangeTime;
			if ((cell.column !== dragState.lastCell.column || cell.row !== dragState.lastCell.row) && timeSinceLastChange >= TARGET_CHANGE_DEBOUNCE) {
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
				const thresholdX = alignedX ? .5 : .5 + HYSTERESIS;
				const thresholdY = alignedY ? .5 : .5 + HYSTERESIS;
				if (Math.abs(offsetFromCellX) < thresholdX && Math.abs(offsetFromCellY) < thresholdY) return;
				dragState.lastCell = cell;
				dragState.lastTargetChangeTime = now;
				core.emit("drag-move", {
					item,
					cell,
					x: e.clientX,
					y: e.clientY,
					colspan,
					rowspan,
					source: "pointer"
				});
			}
		}
	};
	const onPointerUp = (e) => {
		const item = pendingDrag?.item || dragState?.item;
		if (!item) return;
		if (pendingDrag && !dragState) {
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
		core.stateMachine.transition({ type: "COMMIT_INTERACTION" });
		if (rawCell) {
			const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
			const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);
			const cell = {
				column: Math.max(1, Math.min(maxColumn, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row))
			};
			core.emit("drag-end", {
				item,
				cell,
				colspan,
				rowspan,
				source: "pointer"
			});
		} else core.emit("drag-end", {
			item,
			cell: lastCell,
			colspan,
			rowspan,
			source: "pointer"
		});
		cleanup();
		core.stateMachine.transition({ type: "FINISH_COMMIT" });
		requestAnimationFrame(() => {
			animateFLIPWithTracking(item, firstRect);
		});
	};
	const onPointerCancel = () => {
		const item = pendingDrag?.item || dragState?.item;
		if (!item) return;
		if (dragState) {
			core.emit("drag-cancel", {
				item,
				source: "pointer"
			});
			core.stateMachine.transition({ type: "CANCEL_INTERACTION" });
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
			item.removeAttribute("data-egg-dragging");
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
function attachKeyboard(core) {
	const { stateMachine } = core;
	let keyboardModeActive = false;
	let keyboardTargetCell = null;
	let pendingVtnRestore = null;
	const getColumnCount = () => {
		return core.getGridInfo().columns.length;
	};
	const getHeldItem = () => {
		const state = stateMachine.getState();
		if (isDragging(state) && state.interaction?.mode === "keyboard") return state.interaction.element;
		return null;
	};
	const KEY_DIR = {
		ArrowUp: "up",
		ArrowDown: "down",
		ArrowLeft: "left",
		ArrowRight: "right",
		k: "up",
		K: "up",
		j: "down",
		J: "down",
		h: "left",
		H: "left",
		l: "right",
		L: "right"
	};
	const CODE_DIR = {
		KeyK: "up",
		KeyJ: "down",
		KeyH: "left",
		KeyL: "right"
	};
	const getDirection = (key, code) => KEY_DIR[key] ?? CODE_DIR[code] ?? null;
	const getAdjacentCell = (cell, direction, amount = 1) => {
		switch (direction) {
			case "up": return {
				...cell,
				row: Math.max(1, cell.row - amount)
			};
			case "down": return {
				...cell,
				row: cell.row + amount
			};
			case "left": return {
				...cell,
				column: Math.max(1, cell.column - amount)
			};
			case "right": return {
				...cell,
				column: cell.column + amount
			};
		}
	};
	const findItemInDirection = (fromCell, direction, excludeItem) => {
		const items = Array.from(core.element.querySelectorAll("[data-egg-item]"));
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
					distance = fromCell.row - cell.row + Math.abs(cell.column - fromCell.column) * .1;
					break;
				case "down":
					isInDirection = cell.row > fromCell.row;
					distance = cell.row - fromCell.row + Math.abs(cell.column - fromCell.column) * .1;
					break;
				case "left":
					isInDirection = cell.column < fromCell.column;
					distance = fromCell.column - cell.column + Math.abs(cell.row - fromCell.row) * .1;
					break;
				case "right":
					isInDirection = cell.column > fromCell.column;
					distance = cell.column - fromCell.column + Math.abs(cell.row - fromCell.row) * .1;
					break;
			}
			if (isInDirection && distance < bestDistance) {
				bestDistance = distance;
				bestItem = item;
			}
		}
		return bestItem;
	};
	const onKeyDown = (e) => {
		if (e.key === "G" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
			e.preventDefault();
			keyboardModeActive = !keyboardModeActive;
			if (keyboardModeActive) {
				core.element.setAttribute("data-egg-keyboard-mode", "");
				if (!core.selectedItem) {
					const firstItem = core.element.querySelector("[data-egg-item]");
					if (firstItem) core.select(firstItem);
				}
			} else core.element.removeAttribute("data-egg-keyboard-mode");
			return;
		}
		const focused = document.activeElement;
		const focusInGrid = focused && core.element.contains(focused);
		const hasSelection = core.selectedItem !== null;
		if (!keyboardModeActive && !focusInGrid && !hasSelection) return;
		const selectedItem = core.selectedItem;
		const direction = getDirection(e.key, e.code);
		if (e.key === "Escape") {
			e.preventDefault();
			const heldItem = getHeldItem();
			if (heldItem) {
				heldItem.removeAttribute("data-egg-dragging");
				core.emit("drag-cancel", {
					item: heldItem,
					source: "keyboard"
				});
				stateMachine.transition({ type: "CANCEL_INTERACTION" });
				keyboardTargetCell = null;
			} else if (selectedItem) core.deselect();
			if (keyboardModeActive) keyboardModeActive = false;
			core.element.removeAttribute("data-egg-keyboard-mode");
			return;
		}
		if (e.key === "Enter" || e.key === " ") {
			if (!selectedItem) return;
			e.preventDefault();
			const heldItem = getHeldItem();
			if (heldItem) {
				const targetCell = keyboardTargetCell ?? getItemCell(heldItem);
				const size = getItemSize(heldItem);
				heldItem.removeAttribute("data-egg-dragging");
				core.emit("drag-end", {
					item: heldItem,
					cell: targetCell,
					colspan: size.colspan,
					rowspan: size.rowspan,
					source: "keyboard"
				});
				stateMachine.transition({ type: "COMMIT_INTERACTION" });
				stateMachine.transition({ type: "FINISH_COMMIT" });
				keyboardTargetCell = null;
			} else {
				const itemId = selectedItem.id || selectedItem.getAttribute("data-egg-item") || "";
				const size = getItemSize(selectedItem);
				const startCell = getItemCell(selectedItem);
				stateMachine.transition({
					type: "START_INTERACTION",
					context: {
						type: "drag",
						mode: "keyboard",
						itemId,
						element: selectedItem,
						columnCount: getColumnCount()
					}
				});
				keyboardTargetCell = startCell;
				selectedItem.setAttribute("data-egg-dragging", "");
				core.emit("drag-start", {
					item: selectedItem,
					cell: startCell,
					colspan: size.colspan,
					rowspan: size.rowspan,
					source: "keyboard"
				});
			}
			return;
		}
		if (direction) {
			e.preventDefault();
			if (e.altKey && !e.ctrlKey && !e.shiftKey && selectedItem) {
				const adjacentItem = findItemInDirection(getItemCell(selectedItem), direction, selectedItem);
				if (adjacentItem) core.select(adjacentItem);
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
				if (newColspan === itemSize.colspan && newRowspan === itemSize.rowspan) return;
				if (pendingVtnRestore) {
					clearTimeout(pendingVtnRestore.timeoutId);
					pendingVtnRestore.item.style.removeProperty("view-transition-name");
					pendingVtnRestore = null;
				}
				const itemId = selectedItem.id || selectedItem.getAttribute("data-egg-item") || "";
				stateMachine.transition({
					type: "START_INTERACTION",
					context: {
						type: "resize",
						mode: "keyboard",
						itemId,
						element: selectedItem,
						columnCount: getColumnCount()
					}
				});
				selectedItem.style.viewTransitionName = "resizing";
				const handle = direction === "right" || direction === "down" ? "se" : direction === "left" ? "w" : "n";
				core.emit("resize-start", {
					item: selectedItem,
					cell: currentCell,
					colspan: itemSize.colspan,
					rowspan: itemSize.rowspan,
					handle
				});
				selectedItem.setAttribute("data-egg-colspan", String(newColspan));
				selectedItem.setAttribute("data-egg-rowspan", String(newRowspan));
				core.emit("resize-end", {
					item: selectedItem,
					cell: currentCell,
					colspan: newColspan,
					rowspan: newRowspan
				});
				stateMachine.transition({ type: "COMMIT_INTERACTION" });
				stateMachine.transition({ type: "FINISH_COMMIT" });
				const itemToRestore = selectedItem;
				pendingVtnRestore = {
					item: itemToRestore,
					timeoutId: window.setTimeout(() => {
						itemToRestore.style.removeProperty("view-transition-name");
						if (pendingVtnRestore?.item === itemToRestore) pendingVtnRestore = null;
					}, 250)
				};
				return;
			}
			let amount = 1;
			if (e.ctrlKey || e.metaKey) amount = direction === "up" || direction === "down" ? itemSize.rowspan : itemSize.colspan;
			const rawCell = getAdjacentCell(currentCell, direction, amount);
			const maxColumn = Math.max(1, gridInfo.columns.length - itemSize.colspan + 1);
			const maxRow = Math.max(1, gridInfo.rows.length - itemSize.rowspan + 1);
			const targetCell = {
				column: Math.max(1, Math.min(maxColumn, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row))
			};
			if (targetCell.column === currentCell.column && targetCell.row === currentCell.row) return;
			const heldItem = getHeldItem();
			if (heldItem) {
				keyboardTargetCell = targetCell;
				core.emit("drag-move", {
					item: heldItem,
					cell: targetCell,
					x: 0,
					y: 0,
					colspan: itemSize.colspan,
					rowspan: itemSize.rowspan,
					source: "keyboard"
				});
			} else {
				core.emit("drag-start", {
					item: selectedItem,
					cell: currentCell,
					colspan: itemSize.colspan,
					rowspan: itemSize.rowspan,
					source: "keyboard"
				});
				core.emit("drag-end", {
					item: selectedItem,
					cell: targetCell,
					colspan: itemSize.colspan,
					rowspan: itemSize.rowspan,
					source: "keyboard"
				});
			}
			return;
		}
	};
	document.addEventListener("keydown", onKeyDown);
	return () => {
		document.removeEventListener("keydown", onKeyDown);
		core.element.removeAttribute("data-egg-keyboard-mode");
	};
}
function attachAccessibility(core) {
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
	let lastResizeSize = null;
	function announce(message) {
		liveRegion.textContent = "";
		requestAnimationFrame(() => {
			liveRegion.textContent = message;
		});
	}
	function getLabel(item) {
		return item.getAttribute("data-egg-label") || item.getAttribute("aria-label") || item.id || "Item";
	}
	function formatPosition(cell) {
		return `row ${cell.row}, column ${cell.column}`;
	}
	function resolveTemplate(item, event, vars, fallback) {
		const template = item.getAttribute(`data-egg-announce-${event}`) || core.element.getAttribute(`data-egg-announce-${event}`);
		if (!template) return fallback;
		return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
	}
	function getAnnouncement(item, event, cell) {
		const label = getLabel(item);
		const pos = cell ? formatPosition(cell) : "";
		return resolveTemplate(item, event, {
			label,
			row: String(cell?.row ?? ""),
			column: String(cell?.column ?? "")
		}, {
			grab: `${label} grabbed. Position ${pos}. Use arrow keys to move, Enter to drop, Escape to cancel.`,
			move: `Moved to ${pos}.`,
			drop: `${label} dropped at ${pos}.`,
			cancel: `${label} drag cancelled.`
		}[event]);
	}
	function getResizeAnnouncement(item, event, opts) {
		const label = getLabel(item);
		const size = opts?.colspan != null && opts?.rowspan != null ? `${opts.colspan} columns by ${opts.rowspan} rows` : "";
		const pos = opts?.cell ? formatPosition(opts.cell) : "";
		return resolveTemplate(item, event, {
			label,
			colspan: String(opts?.colspan ?? ""),
			rowspan: String(opts?.rowspan ?? ""),
			row: String(opts?.cell?.row ?? ""),
			column: String(opts?.cell?.column ?? "")
		}, {
			"resize-start": `${label} resize started. Size ${size}. Use pointer to resize, Escape to cancel.`,
			"resize-move": `Resized to ${size}.`,
			"resize-end": `${label} resized to ${size} at ${pos}.`,
			"resize-cancel": `${label} resize cancelled.`
		}[event]);
	}
	const onDragStart = (e) => {
		lastCell = e.detail.cell;
		announce(getAnnouncement(e.detail.item, "grab", e.detail.cell));
	};
	const onDragMove = (e) => {
		const { cell } = e.detail;
		if (lastCell && cell.row === lastCell.row && cell.column === lastCell.column) return;
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
	const onResizeStart = (e) => {
		const { item, colspan, rowspan } = e.detail;
		lastResizeSize = {
			colspan,
			rowspan
		};
		announce(getResizeAnnouncement(item, "resize-start", {
			colspan,
			rowspan
		}));
	};
	const onResizeMove = (e) => {
		const { item, cell, colspan, rowspan } = e.detail;
		if (lastResizeSize && colspan === lastResizeSize.colspan && rowspan === lastResizeSize.rowspan) return;
		lastResizeSize = {
			colspan,
			rowspan
		};
		announce(getResizeAnnouncement(item, "resize-move", {
			cell,
			colspan,
			rowspan
		}));
	};
	const onResizeEnd = (e) => {
		const { item, cell, colspan, rowspan } = e.detail;
		lastResizeSize = null;
		announce(getResizeAnnouncement(item, "resize-end", {
			cell,
			colspan,
			rowspan
		}));
	};
	const onResizeCancel = (e) => {
		lastResizeSize = null;
		announce(getResizeAnnouncement(e.detail.item, "resize-cancel"));
	};
	const unlisten = listenEvents(core.element, {
		"egg-drag-start": onDragStart,
		"egg-drag-move": onDragMove,
		"egg-drag-end": onDragEnd,
		"egg-drag-cancel": onDragCancel,
		"egg-resize-start": onResizeStart,
		"egg-resize-move": onResizeMove,
		"egg-resize-end": onResizeEnd,
		"egg-resize-cancel": onResizeCancel
	});
	return () => {
		unlisten();
		liveRegion.remove();
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
function findScrollParent(element) {
	let parent = element.parentElement;
	while (parent) {
		const style = getComputedStyle(parent);
		const overflowY = style.overflowY;
		const overflowX = style.overflowX;
		if (overflowY === "auto" || overflowY === "scroll" || overflowX === "auto" || overflowX === "scroll") return parent;
		parent = parent.parentElement;
	}
	return window;
}
function getViewportRect(container) {
	if (container === window) return {
		top: 0,
		left: 0,
		width: window.innerWidth,
		height: window.innerHeight
	};
	const rect = container.getBoundingClientRect();
	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height
	};
}
function attachCamera(gridElement, options = {}) {
	const { mode: initialMode = "contain", scrollContainer: customContainer, edgeSize = 60, scrollSpeed = 15, scrollBehavior = "smooth", scrollMargin = 20, scrollOnSelect = true, autoScrollOnDrag = true, settleDelay = 150, core } = options;
	let mode = initialMode;
	let scrollContainer = customContainer ?? findScrollParent(gridElement);
	let animationFrameId = null;
	let isDragging = false;
	let dragSource = null;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let settleTimeoutId = null;
	if (core) core.cameraScrolling = false;
	function setScrolling(active) {
		if (active) {
			if (core) core.cameraScrolling = true;
			if (settleTimeoutId) {
				clearTimeout(settleTimeoutId);
				settleTimeoutId = null;
			}
		} else {
			if (settleTimeoutId) clearTimeout(settleTimeoutId);
			settleTimeoutId = setTimeout(() => {
				if (core) core.cameraScrolling = false;
				settleTimeoutId = null;
				gridElement.dispatchEvent(new CustomEvent("egg-camera-settled", { bubbles: true }));
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
			if (scrollContainer === window) window.scrollTo({
				top: targetScrollTop,
				left: targetScrollLeft,
				behavior
			});
			else scrollContainer.scrollTo({
				top: targetScrollTop,
				left: targetScrollLeft,
				behavior
			});
		} else item.scrollIntoView({
			behavior,
			block: "nearest",
			inline: "nearest"
		});
	}
	function getEdgeScrollVelocity(pointerX, pointerY) {
		const viewport = getViewportRect(scrollContainer);
		let velocityX = 0;
		let velocityY = 0;
		const relativeX = pointerX - viewport.left;
		const relativeY = pointerY - viewport.top;
		if (relativeX < edgeSize) velocityX = -scrollSpeed * (1 - relativeX / edgeSize);
		else if (relativeX > viewport.width - edgeSize) velocityX = scrollSpeed * (1 - (viewport.width - relativeX) / edgeSize);
		if (relativeY < edgeSize) velocityY = -scrollSpeed * (1 - relativeY / edgeSize);
		else if (relativeY > viewport.height - edgeSize) velocityY = scrollSpeed * (1 - (viewport.height - relativeY) / edgeSize);
		return {
			x: velocityX,
			y: velocityY
		};
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
		if (velocity.x !== 0 || velocity.y !== 0) {
			if (!wasScrollingLastFrame) setScrolling(true);
			wasScrollingLastFrame = true;
			if (scrollContainer === window) window.scrollBy(velocity.x, velocity.y);
			else {
				scrollContainer.scrollLeft += velocity.x;
				scrollContainer.scrollTop += velocity.y;
			}
		} else if (wasScrollingLastFrame) {
			setScrolling(false);
			wasScrollingLastFrame = false;
		}
		animationFrameId = requestAnimationFrame(scrollLoop);
	}
	function startScrollLoop() {
		if (animationFrameId === null) animationFrameId = requestAnimationFrame(scrollLoop);
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
		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
		startScrollLoop();
	}
	function onDragStart(e) {
		isDragging = true;
		dragSource = e.detail.source;
		if (dragSource === "pointer") window.addEventListener("pointermove", onPointerMove);
	}
	function onDragMove(e) {
		if (mode === "off") return;
		if (e.detail.source === "pointer") {
			lastPointerX = e.detail.x;
			lastPointerY = e.detail.y;
		} else requestAnimationFrame(() => {
			scrollTo(e.detail.item, "smooth");
		});
	}
	function onDragEnd(e) {
		const wasPointerDrag = dragSource === "pointer";
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) window.removeEventListener("pointermove", onPointerMove);
		if (!wasPointerDrag && scrollOnSelect) setTimeout(() => {
			requestAnimationFrame(() => {
				scrollTo(e.detail.item, "smooth");
			});
		}, 100);
	}
	function onDragCancel(e) {
		const wasPointerDrag = dragSource === "pointer";
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) window.removeEventListener("pointermove", onPointerMove);
	}
	function onSelect(e) {
		if (!scrollOnSelect || mode === "off") return;
		if (isDragging) return;
		scrollTo(e.detail.item);
	}
	const removeListeners = listenEvents(gridElement, {
		"egg-drag-start": onDragStart,
		"egg-drag-move": onDragMove,
		"egg-drag-end": onDragEnd,
		"egg-drag-cancel": onDragCancel,
		"egg-select": onSelect
	});
	function destroy() {
		stopScrollLoop();
		removeListeners();
	}
	return {
		setMode(newMode) {
			mode = newMode;
			if (mode === "off") stopScrollLoop();
		},
		getMode() {
			return mode;
		},
		scrollTo,
		stop: stopScrollLoop,
		destroy
	};
}
function attachPlaceholder(gridElement, options = {}) {
	const { className = "egg-placeholder", element: customElement, disableViewTransition = true } = options;
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
		if (disableViewTransition) placeholder.style.viewTransitionName = "none";
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
			if (!isCustomElement) placeholder = null;
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
	function handleDropPreview(e) {
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
			if (placeholder && !document.querySelector("[data-egg-dragging]") && !document.querySelector("[data-egg-resizing]")) remove();
		});
	}
	function handlePointerCancel() {
		remove();
	}
	const removeGridListeners = listenEvents(gridElement, {
		"egg-drag-start": handleDragStart,
		"egg-drag-move": handleDragMove,
		"egg-drag-end": handleDragEnd,
		"egg-drag-cancel": handleDragCancel,
		"egg-drop-preview": handleDropPreview,
		"egg-resize-start": handleResizeStart,
		"egg-resize-move": handleResizeMove,
		"egg-resize-end": handleResizeEnd,
		"egg-resize-cancel": handleResizeCancel
	});
	const removeDocListeners = listenEvents(document, {
		pointerup: handlePointerUp,
		pointercancel: handlePointerCancel
	});
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
			removeGridListeners();
			removeDocListeners();
		}
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
function itemsOverlap(a, b) {
	return !(a.column + a.width <= b.column || b.column + b.width <= a.column || a.row + a.height <= b.row || b.row + b.height <= a.row);
}
function pushDown(items, moved, movedId, depth = 0) {
	if (depth > 50) return;
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
			if (items.some((other) => other.id !== item.id && itemsOverlap(item, other))) {
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
	if (compact) compactUp(result, movedId);
	return result;
}
function attachPushAlgorithm(gridElement, options = {}) {
	const { compaction = true, ...harnessOptions } = options;
	return attachAlgorithm(gridElement, {
		calculateDragLayout(items, movedId, targetCell) {
			return calculateLayout(items, movedId, targetCell, { compact: compaction });
		},
		calculateResizeLayout(items, resizedId, cell) {
			return calculateLayout(items, resizedId, cell, { compact: compaction });
		}
	}, harnessOptions);
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
function attachResponsive(gridElement, options, core) {
	const { layoutModel } = options;
	const styles = core?.styles ?? null;
	let cellSize = options.cellSize;
	let gap = options.gap;
	function inferGridMetrics() {
		if (cellSize !== void 0 && gap !== void 0) return;
		const style = getComputedStyle(gridElement);
		if (gap === void 0) gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 16;
		if (cellSize === void 0) {
			const autoRows = parseFloat(style.gridAutoRows) || 0;
			if (autoRows > 0) cellSize = autoRows;
			else {
				const columns = style.gridTemplateColumns.split(" ");
				cellSize = parseFloat(columns[0] ?? "184") || 184;
			}
		}
	}
	function detectColumnCount() {
		const columns = getComputedStyle(gridElement).gridTemplateColumns.split(" ").filter(Boolean);
		return Math.max(1, columns.length);
	}
	function injectCSS() {
		if (!styles) return;
		inferGridMetrics();
		const gridSelector = gridElement.id ? `#${gridElement.id}` : gridElement.className ? `.${gridElement.className.split(" ")[0]}` : ".grid";
		const css = layoutModel.generateAllBreakpointCSS({
			cellSize,
			gap,
			gridSelector
		});
		styles.set("base", css);
		styles.commit();
	}
	if (!!!styles?.get("base")?.trim()) injectCSS();
	const unsubscribe = layoutModel.subscribe(() => injectCSS());
	let lastColumnCount = layoutModel.currentColumnCount;
	const resizeObserver = new ResizeObserver(() => {
		const newColumnCount = detectColumnCount();
		if (newColumnCount !== lastColumnCount) {
			const previousCount = lastColumnCount;
			lastColumnCount = newColumnCount;
			layoutModel.setCurrentColumnCount(newColumnCount);
			gridElement.dispatchEvent(new CustomEvent("egg-column-count-change", {
				bubbles: true,
				detail: {
					previousCount,
					currentCount: newColumnCount
				}
			}));
		}
	});
	resizeObserver.observe(gridElement);
	return () => {
		resizeObserver.disconnect();
		unsubscribe();
	};
}
function init(element, options = {}) {
	const { layoutModel, styleElement } = options;
	const cleanups = [];
	const stateMachine = createStateMachine();
	let selectedElement = null;
	const styleLayers = /* @__PURE__ */ new Map();
	const layerOrder = [];
	const managedStyleElement = styleElement ?? document.createElement("style");
	if (!styleElement) {
		document.head.appendChild(managedStyleElement);
		cleanups.push(() => managedStyleElement.remove());
	}
	const existingCSS = managedStyleElement.textContent?.trim();
	if (existingCSS) {
		styleLayers.set("base", existingCSS);
		layerOrder.push("base");
	}
	const core = {
		element,
		stateMachine,
		styles: {
			set(layer, css) {
				if (!styleLayers.has(layer)) layerOrder.push(layer);
				styleLayers.set(layer, css);
			},
			get(layer) {
				return styleLayers.get(layer) ?? "";
			},
			clear(layer) {
				if (styleLayers.has(layer)) styleLayers.set(layer, "");
			},
			commit() {
				const parts = [];
				for (const layer of layerOrder) {
					const css = styleLayers.get(layer);
					if (css) parts.push(css);
				}
				managedStyleElement.textContent = parts.join("\n\n");
			}
		},
		cameraScrolling: false,
		get selectedItem() {
			return selectedElement;
		},
		set selectedItem(item) {
			this.select(item);
		},
		select(item) {
			if (item === selectedElement) return;
			const previousItem = selectedElement;
			if (previousItem) previousItem.removeAttribute("data-egg-selected");
			if (item) {
				const itemId = item.id || item.getAttribute("data-egg-item") || "";
				stateMachine.transition({
					type: "SELECT",
					itemId,
					element: item
				});
				selectedElement = item;
				item.setAttribute("data-egg-selected", "");
				this.emit("select", { item });
			} else {
				stateMachine.transition({ type: "DESELECT" });
				selectedElement = null;
				if (previousItem) this.emit("deselect", { item: previousItem });
			}
		},
		deselect() {
			this.select(null);
		},
		getCellFromPoint(x, y) {
			const rect = element.getBoundingClientRect();
			if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
			const style = getComputedStyle(element);
			const columns = parseGridTemplate(style.gridTemplateColumns);
			const rows = parseGridTemplate(style.gridTemplateRows);
			const columnGap = parseFloat(style.columnGap) || 0;
			const rowGap = parseFloat(style.rowGap) || 0;
			const relX = x - rect.left + element.scrollLeft;
			const relY = y - rect.top + element.scrollTop;
			return {
				column: getGridIndex(relX, columns, columnGap),
				row: getGridIndex(relY, rows, rowGap)
			};
		},
		emit(event, detail) {
			element.dispatchEvent(new CustomEvent(`egg-${event}`, {
				bubbles: true,
				detail
			}));
		},
		getGridInfo() {
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const columns = parseGridTemplate(style.gridTemplateColumns);
			const rows = parseGridTemplate(style.gridTemplateRows);
			const columnGap = parseFloat(style.columnGap) || 0;
			parseFloat(style.rowGap);
			return {
				rect,
				columns,
				rows,
				gap: columnGap,
				cellWidth: columns[0] || 0,
				cellHeight: rows[0] || 0
			};
		},
		destroy() {
			cleanups.forEach((cleanup) => cleanup());
		}
	};
	if (options.pointer !== false) cleanups.push(attachPointer(core));
	if (options.keyboard !== false) cleanups.push(attachKeyboard(core));
	if (options.accessibility !== false) cleanups.push(attachAccessibility(core));
	if (options.resize !== false) {
		const inst = attachResize(element, {
			...typeof options.resize === "object" ? options.resize : {},
			core
		});
		cleanups.push(() => inst.destroy());
	}
	if (options.camera !== false) {
		const inst = attachCamera(element, {
			...typeof options.camera === "object" ? options.camera : {},
			core
		});
		cleanups.push(() => inst.destroy());
	}
	if (options.placeholder !== false) {
		const inst = attachPlaceholder(element, typeof options.placeholder === "object" ? options.placeholder : {});
		cleanups.push(() => inst.destroy());
	}
	if (options.algorithm !== false) {
		const algoOpts = options.algorithmOptions ?? {};
		if (options.algorithm === "reorder") cleanups.push(attachReorderAlgorithm(element, {
			...algoOpts,
			core,
			layoutModel
		}));
		else cleanups.push(attachPushAlgorithm(element, {
			...algoOpts,
			core,
			layoutModel
		}));
	}
	if (options.responsive) cleanups.push(attachResponsive(element, options.responsive, core));
	return core;
}
function parseGridTemplate(template) {
	return template.split(" ").filter(Boolean).map((v) => parseFloat(v) || 0);
}
function getGridIndex(pos, tracks, gap) {
	let accumulated = 0;
	const halfGap = gap / 2;
	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i];
		if (pos <= accumulated + track + halfGap) return i + 1;
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
function getItemSize(item) {
	return {
		colspan: parseInt(item.getAttribute("data-egg-colspan") || "1", 10) || 1,
		rowspan: parseInt(item.getAttribute("data-egg-rowspan") || "1", 10) || 1
	};
}
function listenEvents(element, events) {
	for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
	return () => {
		for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
	};
}
var MAX_ROWS = 100;
function createLayoutModel(options) {
	const { maxColumns, minColumns = 1, items: itemDefs } = options;
	const items = /* @__PURE__ */ new Map();
	for (const item of itemDefs) items.set(item.id, {
		id: item.id,
		width: item.width,
		height: item.height
	});
	let canonicalPositions = new Map(options.canonicalPositions);
	const overrides = new Map(options.overrides);
	let currentColumnCount = maxColumns;
	const subscribers = /* @__PURE__ */ new Set();
	function notifySubscribers() {
		for (const callback of Array.from(subscribers)) callback();
	}
	function getItemsInPositionOrder(positions) {
		return Array.from(items.values()).sort((a, b) => {
			const posA = positions.get(a.id) ?? {
				column: 0,
				row: 0
			};
			const posB = positions.get(b.id) ?? {
				column: 0,
				row: 0
			};
			return posA.row - posB.row || posA.column - posB.column;
		});
	}
	function deriveLayoutForColumns(cols, sourcePositions) {
		const sorted = getItemsInPositionOrder(sourcePositions);
		const result = /* @__PURE__ */ new Map();
		const occupied = [];
		for (let r = 0; r < MAX_ROWS; r++) occupied.push(new Array(cols).fill(null));
		for (const itemDef of sorted) {
			const w = Math.min(itemDef.width, cols);
			const h = itemDef.height;
			let placed = false;
			for (let row = 0; row < MAX_ROWS && !placed; row++) for (let col = 0; col <= cols - w && !placed; col++) {
				let canFit = true;
				for (let dy = 0; dy < h && canFit; dy++) for (let dx = 0; dx < w && canFit; dx++) if (occupied[row + dy]?.[col + dx] !== null) canFit = false;
				if (canFit) {
					result.set(itemDef.id, {
						column: col + 1,
						row: row + 1
					});
					for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (occupied[row + dy]) occupied[row + dy][col + dx] = itemDef.id;
					placed = true;
				}
			}
			if (!placed) result.set(itemDef.id, {
				column: 1,
				row: MAX_ROWS
			});
		}
		return result;
	}
	function getBreakpointWidth(cols, cellSize, gap) {
		return cols * cellSize + (cols - 1) * gap;
	}
	return {
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
			if (cols === maxColumns) return new Map(canonicalPositions);
			const override = overrides.get(cols);
			if (override) return new Map(override);
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
			if (cols === maxColumns) canonicalPositions = new Map(positions);
			else overrides.set(cols, new Map(positions));
			notifySubscribers();
		},
		clearOverride(columnCount) {
			if (columnCount === maxColumns) return;
			if (overrides.delete(columnCount)) notifySubscribers();
		},
		updateItemSize(itemId, size) {
			if (!items.get(itemId)) {
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
			if (newCount !== currentColumnCount) currentColumnCount = newCount;
		},
		generateAllBreakpointCSS(options) {
			const { selectorPrefix = "[data-egg-item=\"", selectorSuffix = "\"]", cellSize, gap, gridSelector = ".grid-container" } = options ?? {
				cellSize: 184,
				gap: 16
			};
			const cssRules = [];
			cssRules.push("/* Fallback: canonical layout (before container queries evaluate) */");
			for (const [id, pos] of Array.from(canonicalPositions)) {
				const itemDef = items.get(id);
				if (!itemDef) continue;
				cssRules.push(`${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${itemDef.width}; grid-row: ${pos.row} / span ${itemDef.height}; }`);
			}
			cssRules.push("");
			for (let cols = maxColumns; cols >= minColumns; cols--) {
				const positions = this.getLayoutForColumns(cols);
				const minWidth = getBreakpointWidth(cols, cellSize, gap);
				const hasOverride = overrides.has(cols);
				let containerQuery;
				if (cols === maxColumns) containerQuery = `@container (min-width: ${minWidth}px)`;
				else if (cols === minColumns) containerQuery = `@container (max-width: ${getBreakpointWidth(cols + 1, cellSize, gap) - 1}px)`;
				else containerQuery = `@container (min-width: ${minWidth}px) and (max-width: ${getBreakpointWidth(cols + 1, cellSize, gap) - 1}px)`;
				const itemRules = [];
				itemRules.push(`${gridSelector} { grid-template-columns: repeat(${cols}, 1fr); }`);
				for (const [id, pos] of positions) {
					const itemDef = items.get(id);
					if (!itemDef) continue;
					const w = Math.min(itemDef.width, cols);
					itemRules.push(`${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${w}; grid-row: ${pos.row} / span ${itemDef.height}; }`);
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
}
var nextId = 0;
function parseGridSpan(startStr, endStr) {
	const spanMatch = endStr.match(/span\s+(\d+)/);
	if (spanMatch) return parseInt(spanMatch[1], 10) || 1;
	const endNum = parseInt(endStr, 10);
	const startNum = parseInt(startStr, 10) || 1;
	if (!isNaN(endNum) && endNum > startNum) return endNum - startNum;
	return 1;
}
function resolveItemId(el) {
	return el.dataset.eggItem || el.dataset.id || el.id || "";
}
var EgGridElement = class extends HTMLElement {
	static observedAttributes = [
		"columns",
		"cell-size",
		"gap",
		"algorithm",
		"resize-handles",
		"no-camera",
		"no-placeholder",
		"no-keyboard",
		"no-accessibility",
		"placeholder-class"
	];
	core = null;
	layoutModel = null;
	_styleEl = null;
	_initialized = false;
	_rafId = 0;
	_observer = null;
	connectedCallback() {
		if (this._initialized) return;
		this._init();
	}
	disconnectedCallback() {
		this._teardown();
	}
	attributeChangedCallback() {
		if (!this._initialized) return;
		this._teardown();
		this._init();
	}
	_init() {
		this._initialized = true;
		if (!this.id) this.id = `egg-${++nextId}`;
		const computed = getComputedStyle(this);
		if (computed.display !== "grid" && computed.display !== "inline-grid") this.style.display = "grid";
		const columnsAttr = this.getAttribute("columns");
		const gapAttr = this.getAttribute("gap");
		const cellSizeAttr = this.getAttribute("cell-size");
		const algorithmAttr = this.getAttribute("algorithm");
		const resizeHandlesAttr = this.getAttribute("resize-handles");
		const maxColumns = columnsAttr ? parseInt(columnsAttr, 10) || 4 : this._detectColumnCount();
		const cellSize = cellSizeAttr ? parseInt(cellSizeAttr, 10) || 120 : 0;
		const gap = gapAttr ? parseInt(gapAttr, 10) || 0 : parseFloat(computed.columnGap) || parseFloat(computed.gap) || 0;
		const responsive = cellSize > 0 && !!columnsAttr;
		if (columnsAttr && !responsive) {
			const cols = parseInt(columnsAttr, 10);
			if (cols > 0) this.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		}
		if (gapAttr) this.style.gap = /^\d+$/.test(gapAttr) ? `${gapAttr}px` : gapAttr;
		if (responsive && this.parentElement) this.parentElement.style.containerType = "inline-size";
		this._styleEl = document.createElement("style");
		this.prepend(this._styleEl);
		const items = this.querySelectorAll("[data-egg-item]");
		const itemDefs = [];
		const canonicalPositions = /* @__PURE__ */ new Map();
		for (const item of items) {
			if (!item.hasAttribute("tabindex")) item.setAttribute("tabindex", "0");
			const id = resolveItemId(item);
			if (!id) continue;
			item.style.setProperty("--item-id", id);
			const itemStyle = getComputedStyle(item);
			const colStart = parseInt(itemStyle.gridColumnStart, 10) || 1;
			const rowStart = parseInt(itemStyle.gridRowStart, 10) || 1;
			const cssWidth = parseGridSpan(itemStyle.gridColumnStart, itemStyle.gridColumnEnd);
			const cssHeight = parseGridSpan(itemStyle.gridRowStart, itemStyle.gridRowEnd);
			const width = parseInt(item.getAttribute("data-egg-colspan") || "0", 10) || cssWidth;
			const height = parseInt(item.getAttribute("data-egg-rowspan") || "0", 10) || cssHeight;
			if (!item.hasAttribute("data-egg-colspan") && width > 1) item.setAttribute("data-egg-colspan", String(width));
			if (!item.hasAttribute("data-egg-rowspan") && height > 1) item.setAttribute("data-egg-rowspan", String(height));
			itemDefs.push({
				id,
				width,
				height
			});
			canonicalPositions.set(id, {
				column: colStart,
				row: rowStart
			});
		}
		if (canonicalPositions.size > 1) {
			if (Array.from(canonicalPositions.values()).every((p) => p.column === 1 && p.row === 1)) {
				const occupied = [];
				for (let r = 0; r < 100; r++) occupied.push(new Array(maxColumns).fill(null));
				for (const def of itemDefs) {
					const w = Math.min(def.width, maxColumns);
					const h = def.height;
					let placed = false;
					for (let row = 0; row < 100 && !placed; row++) for (let col = 0; col <= maxColumns - w && !placed; col++) {
						let fits = true;
						for (let dy = 0; dy < h && fits; dy++) for (let dx = 0; dx < w && fits; dx++) if (occupied[row + dy]?.[col + dx] !== null) fits = false;
						if (fits) {
							canonicalPositions.set(def.id, {
								column: col + 1,
								row: row + 1
							});
							for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (occupied[row + dy]) occupied[row + dy][col + dx] = def.id;
							placed = true;
						}
					}
				}
			}
		}
		if (itemDefs.length > 0) this.layoutModel = createLayoutModel({
			maxColumns,
			minColumns: 1,
			items: itemDefs,
			canonicalPositions
		});
		const options = {
			styleElement: this._styleEl,
			layoutModel: this.layoutModel ?? void 0,
			algorithm: algorithmAttr === "none" ? false : algorithmAttr === "reorder" ? "reorder" : "push",
			keyboard: this.hasAttribute("no-keyboard") ? false : void 0,
			accessibility: this.hasAttribute("no-accessibility") ? false : void 0,
			camera: this.hasAttribute("no-camera") ? false : void 0,
			placeholder: this.hasAttribute("no-placeholder") ? false : this.getAttribute("placeholder-class") ? { className: this.getAttribute("placeholder-class") } : void 0,
			resize: resizeHandlesAttr ? { handles: resizeHandlesAttr } : false
		};
		if (responsive && this.layoutModel) options.responsive = {
			layoutModel: this.layoutModel,
			cellSize,
			gap
		};
		this.core = init(this, options);
		for (const item of items) {
			item.style.removeProperty("grid-column");
			item.style.removeProperty("grid-row");
		}
		this.setAttribute("data-pointer-active", "");
		this._observeChildren();
	}
	_teardown() {
		if (!this._initialized) return;
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = 0;
		}
		if (this._observer) {
			this._observer.disconnect();
			this._observer = null;
		}
		if (this.core) {
			this.core.destroy();
			this.core = null;
		}
		if (this._styleEl) {
			this._styleEl.remove();
			this._styleEl = null;
		}
		this.layoutModel = null;
		this._initialized = false;
	}
	_observeChildren() {
		this._observer = new MutationObserver((mutations) => {
			let itemsChanged = false;
			for (const m of mutations) {
				for (const node of m.addedNodes) if (node instanceof HTMLElement && node.hasAttribute("data-egg-item")) itemsChanged = true;
				for (const node of m.removedNodes) if (node instanceof HTMLElement && node.hasAttribute("data-egg-item")) itemsChanged = true;
			}
			if (!itemsChanged) return;
			if (this._rafId) return;
			this._rafId = requestAnimationFrame(() => {
				this._rafId = 0;
				if (this.core?.stateMachine.getState().phase === "interacting") return;
				this._teardown();
				this._init();
			});
		});
		this._observer.observe(this, { childList: true });
	}
	_detectColumnCount() {
		const cols = getComputedStyle(this).gridTemplateColumns.split(" ").filter(Boolean);
		return Math.max(1, cols.length);
	}
};
if (!customElements.get("eg-grid")) customElements.define("eg-grid", EgGridElement);
export { EgGridElement, animateFLIP, animateFLIPWithTracking, attachAccessibility, attachCamera, attachKeyboard, attachPlaceholder, attachPointer, attachPushAlgorithm, attachReorderAlgorithm, attachResize, attachResponsive, calculateLayout, calculateReorderLayout, createLayoutModel, getItemCell, getItemOrder, getItemSize, getItemViewTransitionName, init, layoutToCSS, listenEvents, readItemsFromDOM, reflowItems };

//# sourceMappingURL=eg-grid-element.js.map