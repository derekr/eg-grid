function parseGridTemplate(template) {
	return template.split(" ").filter(Boolean).map((v) => parseFloat(v) || 0);
}
function getGridIndex(pos, tracks, gap) {
	let acc = 0;
	const halfGap = gap / 2;
	for (let i = 0; i < tracks.length; i++) {
		if (pos <= acc + tracks[i] + halfGap) return i + 1;
		acc += tracks[i] + gap;
	}
	return tracks.length || 1;
}
function getItemCell(item) {
	const s = getComputedStyle(item);
	return {
		column: parseInt(s.gridColumnStart, 10) || 1,
		row: parseInt(s.gridRowStart, 10) || 1
	};
}
function getItemSize(item) {
	return {
		colspan: parseInt(item.getAttribute("data-egg-colspan") || "1", 10) || 1,
		rowspan: parseInt(item.getAttribute("data-egg-rowspan") || "1", 10) || 1
	};
}
function getItemId(el) {
	return el.dataset.eggItem || el.dataset.id || el.id || "";
}
function layoutToCSS(items, opts = {}) {
	const { selectorPrefix = "[data-egg-item=\"", selectorSuffix = "\"]", excludeId, maxColumns } = opts;
	const rules = [];
	for (const item of items) {
		if (item.id === excludeId) continue;
		const w = maxColumns ? Math.min(item.width, maxColumns) : item.width;
		const c = maxColumns ? Math.max(1, Math.min(item.column, maxColumns - w + 1)) : item.column;
		rules.push(`${selectorPrefix}${item.id}${selectorSuffix} { grid-column: ${c} / span ${w}; grid-row: ${item.row} / span ${item.height}; }`);
	}
	return rules.join("\n");
}
function readItemsFromDOM(container) {
	return Array.from(container.querySelectorAll("[data-egg-item]")).map((el) => {
		const element = el;
		const style = getComputedStyle(element);
		return {
			id: getItemId(element),
			column: parseInt(style.gridColumnStart, 10) || 1,
			row: parseInt(style.gridRowStart, 10) || 1,
			width: parseInt(element.getAttribute("data-egg-colspan") || "1", 10) || 1,
			height: parseInt(element.getAttribute("data-egg-rowspan") || "1", 10) || 1
		};
	});
}
function itemsOverlap(a, b) {
	return !(a.column + a.width <= b.column || b.column + b.width <= a.column || a.row + a.height <= b.row || b.row + b.height <= a.row);
}
function pushDown(items, moved, movedId, depth = 0) {
	if (depth > 50) return;
	const colliders = items.filter((it) => it.id !== movedId && it.id !== moved.id && itemsOverlap(moved, it)).sort((a, b) => b.row - a.row || a.column - b.column);
	for (const c of colliders) {
		const newRow = moved.row + moved.height;
		if (c.row < newRow) {
			c.row = newRow;
			pushDown(items, c, movedId, depth + 1);
		}
	}
}
function compactUp(items, excludeId) {
	const sorted = [...items].filter((it) => it.id !== excludeId).sort((a, b) => a.row - b.row || a.column - b.column);
	for (const item of sorted) {
		let iter = 0;
		while (item.row > 1 && iter++ < 100) {
			item.row -= 1;
			if (items.some((o) => o.id !== item.id && itemsOverlap(item, o))) {
				item.row += 1;
				break;
			}
		}
	}
}
function calculatePushLayout(items, movedId, targetCell, compact = true) {
	const result = items.map((i) => ({ ...i }));
	const moved = result.find((i) => i.id === movedId);
	if (!moved) return result;
	moved.column = targetCell.column;
	moved.row = targetCell.row;
	pushDown(result, moved, movedId);
	if (compact) compactUp(result, movedId);
	return result;
}
function init(element, options = {}) {
	const cleanups = [];
	const styleEl = options.styleElement ?? document.createElement("style");
	if (!options.styleElement) {
		document.head.appendChild(styleEl);
		cleanups.push(() => styleEl.remove());
	}
	const existingCSS = styleEl.textContent?.trim() || "";
	let selectedElement = null;
	const core = {
		element,
		phase: "idle",
		interaction: null,
		cameraScrolling: false,
		baseCSS: existingCSS,
		previewCSS: "",
		get selectedItem() {
			return selectedElement;
		},
		set selectedItem(item) {
			this.select(item);
		},
		select(item) {
			if (item === selectedElement) return;
			const prev = selectedElement;
			if (prev) prev.removeAttribute("data-egg-selected");
			if (item) {
				this.phase = this.phase === "idle" ? "selected" : this.phase;
				selectedElement = item;
				item.setAttribute("data-egg-selected", "");
				this.emit("select", { item });
			} else {
				if (this.phase === "selected") this.phase = "idle";
				selectedElement = null;
				if (prev) this.emit("deselect", { item: prev });
			}
		},
		deselect() {
			this.select(null);
		},
		getCellFromPoint(x, y) {
			const rect = element.getBoundingClientRect();
			if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
			const s = getComputedStyle(element);
			const cols = parseGridTemplate(s.gridTemplateColumns);
			const rows = parseGridTemplate(s.gridTemplateRows);
			const cGap = parseFloat(s.columnGap) || 0;
			const rGap = parseFloat(s.rowGap) || 0;
			return {
				column: getGridIndex(x - rect.left + element.scrollLeft, cols, cGap),
				row: getGridIndex(y - rect.top + element.scrollTop, rows, rGap)
			};
		},
		getGridInfo() {
			const rect = element.getBoundingClientRect();
			const s = getComputedStyle(element);
			const columns = parseGridTemplate(s.gridTemplateColumns);
			const rows = parseGridTemplate(s.gridTemplateRows);
			return {
				rect,
				columns,
				rows,
				gap: parseFloat(s.columnGap) || 0,
				cellWidth: columns[0] || 0,
				cellHeight: rows[0] || 0
			};
		},
		emit(event, detail) {
			element.dispatchEvent(new CustomEvent(`egg-${event}`, {
				bubbles: true,
				detail
			}));
		},
		commitStyles() {
			styleEl.textContent = [this.baseCSS, this.previewCSS].filter(Boolean).join("\n\n");
		},
		destroy() {
			cleanups.forEach((fn) => fn());
		}
	};
	if (options.pointer !== false) {
		const DRAG_THRESHOLD = 5;
		const PREDICTION_THRESHOLD = 30;
		const PREDICTION_LEAD = .5;
		const HYSTERESIS = .4;
		const TARGET_DEBOUNCE = 40;
		let pending = null;
		let drag = null;
		function startDrag(p, e) {
			const { item, pointerId, rect, startCell, colspan, rowspan } = p;
			drag = {
				item,
				pointerId,
				offsetX: e.clientX - rect.left,
				offsetY: e.clientY - rect.top,
				initialRect: rect,
				startCell,
				lastCell: startCell,
				lastChangeTime: 0,
				colspan,
				rowspan,
				dragStartX: e.clientX,
				dragStartY: e.clientY
			};
			item.setAttribute("data-egg-dragging", "");
			document.body.classList.add("is-dragging");
			const itemId = getItemId(item);
			core.phase = "interacting";
			core.interaction = {
				type: "drag",
				mode: "pointer",
				itemId,
				element: item,
				columnCount: core.getGridInfo().columns.length
			};
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
			pending = null;
		}
		const onPointerMove = (e) => {
			if (pending && !drag) {
				const dx = e.clientX - pending.startX, dy = e.clientY - pending.startY;
				if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) startDrag(pending, e);
				else return;
			}
			if (!drag) return;
			const { item, offsetX, offsetY, initialRect, colspan, rowspan } = drag;
			const newLeft = e.clientX - offsetX, newTop = e.clientY - offsetY;
			item.style.left = `${newLeft}px`;
			item.style.top = `${newTop}px`;
			let cx = newLeft + initialRect.width / 2, cy = newTop + initialRect.height / 2;
			const gi = core.getGridInfo();
			const cdx = e.clientX - drag.dragStartX, cdy = e.clientY - drag.dragStartY;
			if (Math.abs(cdx) > PREDICTION_THRESHOLD) cx += Math.sign(cdx) * PREDICTION_LEAD * (gi.cellWidth + gi.gap);
			if (Math.abs(cdy) > PREDICTION_THRESHOLD) cy += Math.sign(cdy) * PREDICTION_LEAD * (gi.cellHeight + gi.gap);
			const rawCell = core.getCellFromPoint(cx, cy);
			if (!rawCell) return;
			const maxCol = Math.max(1, gi.columns.length - colspan + 1);
			const maxRow = Math.max(1, gi.rows.length - rowspan + 1);
			const cell = {
				column: Math.max(1, Math.min(maxCol, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row))
			};
			const now = performance.now();
			if (now - drag.lastChangeTime < TARGET_DEBOUNCE) return;
			if (cell.column === drag.lastCell.column && cell.row === drag.lastCell.row) return;
			const cellW = gi.cellWidth + gi.gap, cellH = gi.cellHeight + gi.gap;
			const ccx = gi.rect.left + (drag.lastCell.column - 1) * cellW + gi.cellWidth / 2;
			const ccy = gi.rect.top + (drag.lastCell.row - 1) * cellH + gi.cellHeight / 2;
			const offX = (cx - ccx) / cellW, offY = (cy - ccy) / cellH;
			const alignedX = cell.column > drag.lastCell.column === offX > 0;
			const alignedY = cell.row > drag.lastCell.row === offY > 0;
			if (Math.abs(offX) < (alignedX ? .5 : .5 + HYSTERESIS) && Math.abs(offY) < (alignedY ? .5 : .5 + HYSTERESIS)) return;
			drag.lastCell = cell;
			drag.lastChangeTime = now;
			core.emit("drag-move", {
				item,
				cell,
				x: e.clientX,
				y: e.clientY,
				colspan,
				rowspan,
				source: "pointer"
			});
		};
		const cleanupDrag = () => {
			if (drag) {
				const { item, pointerId } = drag;
				item.removeAttribute("data-egg-dragging");
				document.body.classList.remove("is-dragging");
				item.style.position = "";
				item.style.left = "";
				item.style.top = "";
				item.style.width = "";
				item.style.height = "";
				item.style.zIndex = "";
				item.releasePointerCapture(pointerId);
				item.removeEventListener("pointermove", onPointerMove);
				item.removeEventListener("pointerup", onPointerUp);
				item.removeEventListener("pointercancel", onPointerCancel);
				drag = null;
			}
			if (pending) {
				pending.item.releasePointerCapture(pending.pointerId);
				pending.item.removeEventListener("pointermove", onPointerMove);
				pending.item.removeEventListener("pointerup", onPointerUp);
				pending.item.removeEventListener("pointercancel", onPointerCancel);
				pending = null;
			}
		};
		const onPointerUp = (e) => {
			if (pending && !drag) {
				cleanupDrag();
				return;
			}
			if (!drag) return;
			const { item, initialRect, colspan, rowspan, lastCell, offsetX, offsetY, dragStartX, dragStartY } = drag;
			const gi = core.getGridInfo();
			const cdx = e.clientX - dragStartX, cdy = e.clientY - dragStartY;
			const nL = e.clientX - offsetX, nT = e.clientY - offsetY;
			let ecx = nL + initialRect.width / 2, ecy = nT + initialRect.height / 2;
			if (Math.abs(cdx) > PREDICTION_THRESHOLD) ecx += Math.sign(cdx) * PREDICTION_LEAD * (gi.cellWidth + gi.gap);
			if (Math.abs(cdy) > PREDICTION_THRESHOLD) ecy += Math.sign(cdy) * PREDICTION_LEAD * (gi.cellHeight + gi.gap);
			const rawCell = core.getCellFromPoint(ecx, ecy);
			const firstRect = item.getBoundingClientRect();
			let dropCell = lastCell;
			if (rawCell) {
				const maxCol = Math.max(1, gi.columns.length - colspan + 1);
				const maxRow = Math.max(1, gi.rows.length - rowspan + 1);
				dropCell = {
					column: Math.max(1, Math.min(maxCol, rawCell.column)),
					row: Math.max(1, Math.min(maxRow, rawCell.row))
				};
			}
			core.emit("drag-end", {
				item,
				cell: dropCell,
				colspan,
				rowspan,
				source: "pointer"
			});
			cleanupDrag();
			core.phase = "selected";
			core.interaction = null;
			requestAnimationFrame(() => {
				const lastRect = item.getBoundingClientRect();
				const dx = firstRect.left - lastRect.left, dy = firstRect.top - lastRect.top;
				if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
					item.style.viewTransitionName = "none";
					item.setAttribute("data-egg-dropping", "");
					const anim = item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
						duration: 200,
						easing: "cubic-bezier(0.2, 0, 0, 1)"
					});
					anim.onfinish = () => {
						item.removeAttribute("data-egg-dropping");
						const id = getItemId(item);
						item.style.viewTransitionName = id || "";
					};
				}
			});
		};
		const onPointerCancel = () => {
			if (drag) {
				core.emit("drag-cancel", {
					item: drag.item,
					source: "pointer"
				});
				core.phase = "selected";
				core.interaction = null;
			}
			cleanupDrag();
		};
		const onPointerDown = (e) => {
			const item = e.target.closest("[data-egg-item]");
			if (!item) return;
			core.select(item);
			e.preventDefault();
			const rect = item.getBoundingClientRect();
			pending = {
				item,
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				rect,
				startCell: getItemCell(item),
				...getItemSize(item)
			};
			item.setPointerCapture(e.pointerId);
			item.addEventListener("pointermove", onPointerMove);
			item.addEventListener("pointerup", onPointerUp);
			item.addEventListener("pointercancel", onPointerCancel);
		};
		const onDocPointerDown = (e) => {
			if (element.contains(e.target) || drag) return;
			core.deselect();
		};
		element.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("pointerdown", onDocPointerDown);
		cleanups.push(() => {
			element.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("pointerdown", onDocPointerDown);
			cleanupDrag();
		});
	}
	if (options.resize !== false) {
		const resizeOpts = typeof options.resize === "object" ? options.resize : {};
		const handles = resizeOpts.handles ?? "corners";
		const handleSize = resizeOpts.handleSize ?? 12;
		const minSize = resizeOpts.minSize ?? {
			colspan: 1,
			rowspan: 1
		};
		const maxSize = resizeOpts.maxSize ?? {
			colspan: 6,
			rowspan: 6
		};
		const showSizeLabel = resizeOpts.showSizeLabel ?? true;
		const CURSOR = {
			nw: "nwse-resize",
			se: "nwse-resize",
			ne: "nesw-resize",
			sw: "nesw-resize",
			n: "ns-resize",
			s: "ns-resize",
			e: "ew-resize",
			w: "ew-resize"
		};
		let active = null;
		let hoveredItem = null;
		let hoveredHandle = null;
		function detectHandle(e, item) {
			const r = item.getBoundingClientRect();
			const x = e.clientX - r.left, y = e.clientY - r.top;
			const nL = x < handleSize, nR = x > r.width - handleSize, nT = y < handleSize, nB = y > r.height - handleSize;
			if (handles === "corners" || handles === "all") {
				if (nT && nL) return "nw";
				if (nT && nR) return "ne";
				if (nB && nL) return "sw";
				if (nB && nR) return "se";
			}
			if (handles === "edges" || handles === "all") {
				if (nT) return "n";
				if (nB) return "s";
				if (nL) return "w";
				if (nR) return "e";
			}
			return null;
		}
		function resetResizeItem(item, pointerId, label) {
			item.releasePointerCapture(pointerId);
			item.removeEventListener("pointermove", onResizePointerMove);
			item.removeEventListener("pointerup", onResizePointerUp);
			item.removeEventListener("pointercancel", onResizePointerCancel);
			if (label) label.remove();
			item.style.position = "";
			item.style.left = "";
			item.style.top = "";
			item.style.width = "";
			item.style.height = "";
			item.style.zIndex = "";
			const id = getItemId(item);
			item.style.viewTransitionName = id || "";
			item.removeAttribute("data-egg-resizing");
			item.removeAttribute("data-egg-handle-active");
		}
		const onResizePointerMove = (e) => {
			if (!active || e.pointerId !== active.pointerId) return;
			const { item, handle, startCell, origSize, initRect, startX, startY, sizeLabel } = active;
			const gi = core.getGridInfo();
			const dx = e.clientX - startX, dy = e.clientY - startY;
			let nW = initRect.width, nH = initRect.height, nL = initRect.left, nT = initRect.top;
			const minW = gi.cellWidth, minH = gi.cellHeight;
			const maxW = Math.min(maxSize.colspan * gi.cellWidth + (maxSize.colspan - 1) * gi.gap, gi.rect.right - initRect.left);
			const maxH = Math.min(maxSize.rowspan * gi.cellHeight + (maxSize.rowspan - 1) * gi.gap, gi.rect.bottom - initRect.top);
			if (handle === "e" || handle === "se" || handle === "ne") nW = Math.max(minW, Math.min(maxW, initRect.width + dx));
			if (handle === "w" || handle === "sw" || handle === "nw") {
				const maxLS = initRect.left - gi.rect.left;
				const maxWL = Math.min(maxSize.colspan * gi.cellWidth + (maxSize.colspan - 1) * gi.gap, initRect.width + maxLS);
				const wc = Math.max(-initRect.width + minW, Math.min(maxWL - initRect.width, -dx));
				nW = initRect.width + wc;
				nL = initRect.left - wc;
			}
			if (handle === "s" || handle === "se" || handle === "sw") nH = Math.max(minH, Math.min(maxH, initRect.height + dy));
			if (handle === "n" || handle === "ne" || handle === "nw") {
				const maxTS = initRect.top - gi.rect.top;
				const maxHL = Math.min(maxSize.rowspan * gi.cellHeight + (maxSize.rowspan - 1) * gi.gap, initRect.height + maxTS);
				const hc = Math.max(-initRect.height + minH, Math.min(maxHL - initRect.height, -dy));
				nH = initRect.height + hc;
				nT = initRect.top - hc;
			}
			item.style.left = `${nL}px`;
			item.style.top = `${nT}px`;
			item.style.width = `${nW}px`;
			item.style.height = `${nH}px`;
			const cpg = gi.cellWidth + gi.gap, rpg = gi.cellHeight + gi.gap;
			const SNAP = .3;
			let pCS = Math.max(minSize.colspan, Math.min(maxSize.colspan, Math.floor((nW + gi.gap) / cpg + (1 - SNAP))));
			let pRS = Math.max(minSize.rowspan, Math.min(maxSize.rowspan, Math.floor((nH + gi.gap) / rpg + (1 - SNAP))));
			let pCol = startCell.column, pRow = startCell.row;
			if (handle === "w" || handle === "sw" || handle === "nw") pCol = startCell.column + origSize.colspan - pCS;
			if (handle === "n" || handle === "ne" || handle === "nw") pRow = startCell.row + origSize.rowspan - pRS;
			active.curSize = {
				colspan: pCS,
				rowspan: pRS
			};
			active.curCell = {
				column: pCol,
				row: pRow
			};
			if (sizeLabel) sizeLabel.textContent = `${pCS}\u00d7${pRS}`;
			let anchorCell;
			if (handle === "se" || handle === "s" || handle === "e") anchorCell = {
				column: startCell.column,
				row: startCell.row
			};
			else if (handle === "nw" || handle === "n" || handle === "w") anchorCell = {
				column: startCell.column + origSize.colspan - 1,
				row: startCell.row + origSize.rowspan - 1
			};
			else if (handle === "ne") anchorCell = {
				column: startCell.column,
				row: startCell.row + origSize.rowspan - 1
			};
			else anchorCell = {
				column: startCell.column + origSize.colspan - 1,
				row: startCell.row
			};
			core.emit("resize-move", {
				item,
				cell: {
					column: pCol,
					row: pRow
				},
				anchorCell,
				startCell,
				colspan: pCS,
				rowspan: pRS,
				handle,
				source: "pointer"
			});
		};
		const onResizePointerUp = (e) => {
			if (!active || e.pointerId !== active.pointerId) return;
			const { item, pointerId, curSize, curCell, sizeLabel } = active;
			item.setAttribute("data-egg-colspan", String(curSize.colspan));
			item.setAttribute("data-egg-rowspan", String(curSize.rowspan));
			core.emit("resize-end", {
				item,
				cell: curCell,
				colspan: curSize.colspan,
				rowspan: curSize.rowspan,
				source: "pointer"
			});
			resetResizeItem(item, pointerId, sizeLabel);
			active = null;
			core.phase = "selected";
			core.interaction = null;
		};
		const onResizePointerCancel = (e) => {
			if (!active || e.pointerId !== active.pointerId) return;
			core.emit("resize-cancel", {
				item: active.item,
				source: "pointer"
			});
			resetResizeItem(active.item, active.pointerId, active.sizeLabel);
			active = null;
			core.phase = "selected";
			core.interaction = null;
		};
		const onResizeDown = (e) => {
			const item = e.target.closest("[data-egg-item]");
			if (!item) return;
			const handle = detectHandle(e, item);
			if (!handle) return;
			e.stopPropagation();
			e.preventDefault();
			core.select(item);
			const { colspan, rowspan } = getItemSize(item);
			const s = getComputedStyle(item);
			const startCell = {
				column: parseInt(s.gridColumnStart, 10) || 1,
				row: parseInt(s.gridRowStart, 10) || 1
			};
			const initRect = item.getBoundingClientRect();
			let sizeLabel = null;
			if (showSizeLabel) {
				sizeLabel = document.createElement("div");
				sizeLabel.className = "egg-resize-label";
				sizeLabel.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:white;padding:4px 8px;border-radius:4px;font-size:14px;font-weight:600;font-family:system-ui,sans-serif;pointer-events:none;z-index:1000;white-space:nowrap";
				sizeLabel.textContent = `${colspan}\u00d7${rowspan}`;
				item.appendChild(sizeLabel);
			}
			active = {
				item,
				pointerId: e.pointerId,
				handle,
				startCell,
				origSize: {
					colspan,
					rowspan
				},
				curCell: { ...startCell },
				curSize: {
					colspan,
					rowspan
				},
				sizeLabel,
				initRect,
				startX: e.clientX,
				startY: e.clientY
			};
			item.setAttribute("data-egg-resizing", "");
			item.setAttribute("data-egg-handle-active", handle);
			item.removeAttribute("data-egg-handle-hover");
			item.setPointerCapture(e.pointerId);
			item.addEventListener("pointermove", onResizePointerMove);
			item.addEventListener("pointerup", onResizePointerUp);
			item.addEventListener("pointercancel", onResizePointerCancel);
			core.phase = "interacting";
			core.interaction = {
				type: "resize",
				mode: "pointer",
				itemId: getItemId(item),
				element: item,
				columnCount: core.getGridInfo().columns.length
			};
			core.emit("resize-start", {
				item,
				cell: startCell,
				colspan,
				rowspan,
				handle,
				source: "pointer"
			});
			item.style.position = "fixed";
			item.style.left = `${initRect.left}px`;
			item.style.top = `${initRect.top}px`;
			item.style.width = `${initRect.width}px`;
			item.style.height = `${initRect.height}px`;
			item.style.zIndex = "100";
			item.style.viewTransitionName = "resizing";
		};
		const onResizeHover = (e) => {
			if (active) return;
			const item = e.target.closest("[data-egg-item]");
			if (item) {
				const h = detectHandle(e, item);
				if (h !== hoveredHandle || item !== hoveredItem) {
					if (hoveredItem && hoveredItem !== item) {
						hoveredItem.style.cursor = "";
						hoveredItem.removeAttribute("data-egg-handle-hover");
					}
					if (hoveredItem === item && hoveredHandle && !h) item.removeAttribute("data-egg-handle-hover");
					hoveredItem = item;
					hoveredHandle = h;
					item.style.cursor = (h ? CURSOR[h] : "") || "";
					if (h) item.setAttribute("data-egg-handle-hover", h);
					else item.removeAttribute("data-egg-handle-hover");
				}
			} else if (hoveredItem) {
				hoveredItem.style.cursor = "";
				hoveredItem.removeAttribute("data-egg-handle-hover");
				hoveredItem = null;
				hoveredHandle = null;
			}
		};
		const onResizeEsc = (e) => {
			if (e.key === "Escape" && active) onResizePointerCancel(new PointerEvent("pointercancel", { pointerId: active.pointerId }));
		};
		element.addEventListener("pointerdown", onResizeDown, { capture: true });
		element.addEventListener("pointermove", onResizeHover);
		document.addEventListener("keydown", onResizeEsc);
		cleanups.push(() => {
			element.removeEventListener("pointerdown", onResizeDown, { capture: true });
			element.removeEventListener("pointermove", onResizeHover);
			document.removeEventListener("keydown", onResizeEsc);
		});
	}
	if (options.keyboard !== false) {
		let kbMode = false;
		let kbTargetCell = null;
		let pendingVtnRestore = null;
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
		const getDir = (key, code) => KEY_DIR[key] ?? CODE_DIR[code] ?? null;
		const isHolding = () => core.phase === "interacting" && core.interaction?.type === "drag" && core.interaction.mode === "keyboard";
		const getHeldItem = () => isHolding() ? core.interaction.element : null;
		const getAdjacentCell = (cell, dir, amt = 1) => {
			if (dir === "up") return {
				...cell,
				row: Math.max(1, cell.row - amt)
			};
			if (dir === "down") return {
				...cell,
				row: cell.row + amt
			};
			if (dir === "left") return {
				...cell,
				column: Math.max(1, cell.column - amt)
			};
			return {
				...cell,
				column: cell.column + amt
			};
		};
		const findItemInDir = (from, dir, exclude) => {
			const items = Array.from(element.querySelectorAll("[data-egg-item]"));
			let best = null, bestDist = Infinity;
			for (const item of items) {
				if (item === exclude) continue;
				const c = getItemCell(item);
				let inDir = false, dist = 0;
				if (dir === "up") {
					inDir = c.row < from.row;
					dist = from.row - c.row + Math.abs(c.column - from.column) * .1;
				} else if (dir === "down") {
					inDir = c.row > from.row;
					dist = c.row - from.row + Math.abs(c.column - from.column) * .1;
				} else if (dir === "left") {
					inDir = c.column < from.column;
					dist = from.column - c.column + Math.abs(c.row - from.row) * .1;
				} else {
					inDir = c.column > from.column;
					dist = c.column - from.column + Math.abs(c.row - from.row) * .1;
				}
				if (inDir && dist < bestDist) {
					bestDist = dist;
					best = item;
				}
			}
			return best;
		};
		const onKeyDown = (e) => {
			if (e.key === "G" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
				e.preventDefault();
				kbMode = !kbMode;
				if (kbMode) {
					element.setAttribute("data-egg-keyboard-mode", "");
					if (!core.selectedItem) {
						const f = element.querySelector("[data-egg-item]");
						if (f) core.select(f);
					}
				} else element.removeAttribute("data-egg-keyboard-mode");
				return;
			}
			const focused = document.activeElement;
			if (!kbMode && !(focused && element.contains(focused)) && !core.selectedItem) return;
			const sel = core.selectedItem;
			const dir = getDir(e.key, e.code);
			if (e.key === "Escape") {
				e.preventDefault();
				const held = getHeldItem();
				if (held) {
					held.removeAttribute("data-egg-dragging");
					core.emit("drag-cancel", {
						item: held,
						source: "keyboard"
					});
					core.phase = "selected";
					core.interaction = null;
					kbTargetCell = null;
				} else if (sel) core.deselect();
				if (kbMode) {
					kbMode = false;
					element.removeAttribute("data-egg-keyboard-mode");
				}
				return;
			}
			if (e.key === "Enter" || e.key === " ") {
				if (!sel) return;
				e.preventDefault();
				const held = getHeldItem();
				if (held) {
					const tc = kbTargetCell ?? getItemCell(held), sz = getItemSize(held);
					held.removeAttribute("data-egg-dragging");
					core.emit("drag-end", {
						item: held,
						cell: tc,
						colspan: sz.colspan,
						rowspan: sz.rowspan,
						source: "keyboard"
					});
					core.phase = "selected";
					core.interaction = null;
					kbTargetCell = null;
				} else {
					const itemId = getItemId(sel), sz = getItemSize(sel), sc = getItemCell(sel);
					core.phase = "interacting";
					core.interaction = {
						type: "drag",
						mode: "keyboard",
						itemId,
						element: sel,
						columnCount: core.getGridInfo().columns.length
					};
					kbTargetCell = sc;
					sel.setAttribute("data-egg-dragging", "");
					core.emit("drag-start", {
						item: sel,
						cell: sc,
						colspan: sz.colspan,
						rowspan: sz.rowspan,
						source: "keyboard"
					});
				}
				return;
			}
			if (!dir) return;
			e.preventDefault();
			if (e.altKey && !e.ctrlKey && !e.shiftKey && sel) {
				const adj = findItemInDir(getItemCell(sel), dir, sel);
				if (adj) core.select(adj);
				return;
			}
			if (!sel) return;
			const cc = getItemCell(sel), sz = getItemSize(sel), gi = core.getGridInfo();
			if (e.shiftKey && !e.ctrlKey && !e.altKey) {
				let nCS = sz.colspan, nRS = sz.rowspan;
				if (dir === "right") nCS = Math.min(sz.colspan + 1, gi.columns.length - cc.column + 1);
				else if (dir === "left") nCS = Math.max(1, sz.colspan - 1);
				else if (dir === "down") nRS = sz.rowspan + 1;
				else nRS = Math.max(1, sz.rowspan - 1);
				if (nCS === sz.colspan && nRS === sz.rowspan) return;
				if (pendingVtnRestore) {
					clearTimeout(pendingVtnRestore.tid);
					pendingVtnRestore.item.style.removeProperty("view-transition-name");
					pendingVtnRestore = null;
				}
				const handle = dir === "right" || dir === "down" ? "se" : dir === "left" ? "w" : "n";
				core.phase = "interacting";
				core.interaction = {
					type: "resize",
					mode: "keyboard",
					itemId: getItemId(sel),
					element: sel,
					columnCount: gi.columns.length
				};
				sel.style.viewTransitionName = "resizing";
				core.emit("resize-start", {
					item: sel,
					cell: cc,
					colspan: sz.colspan,
					rowspan: sz.rowspan,
					handle
				});
				sel.setAttribute("data-egg-colspan", String(nCS));
				sel.setAttribute("data-egg-rowspan", String(nRS));
				core.emit("resize-end", {
					item: sel,
					cell: cc,
					colspan: nCS,
					rowspan: nRS
				});
				core.phase = "selected";
				core.interaction = null;
				const itemToRestore = sel;
				pendingVtnRestore = {
					item: itemToRestore,
					tid: window.setTimeout(() => {
						itemToRestore.style.removeProperty("view-transition-name");
						if (pendingVtnRestore?.item === itemToRestore) pendingVtnRestore = null;
					}, 250)
				};
				return;
			}
			let amt = 1;
			if (e.ctrlKey || e.metaKey) amt = dir === "up" || dir === "down" ? sz.rowspan : sz.colspan;
			const rawCell = getAdjacentCell(cc, dir, amt);
			const maxCol = Math.max(1, gi.columns.length - sz.colspan + 1);
			const maxRow = Math.max(1, gi.rows.length - sz.rowspan + 1);
			const tc = {
				column: Math.max(1, Math.min(maxCol, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row))
			};
			if (tc.column === cc.column && tc.row === cc.row) return;
			const held = getHeldItem();
			if (held) {
				kbTargetCell = tc;
				core.emit("drag-move", {
					item: held,
					cell: tc,
					x: 0,
					y: 0,
					colspan: sz.colspan,
					rowspan: sz.rowspan,
					source: "keyboard"
				});
			} else {
				core.emit("drag-start", {
					item: sel,
					cell: cc,
					colspan: sz.colspan,
					rowspan: sz.rowspan,
					source: "keyboard"
				});
				core.emit("drag-end", {
					item: sel,
					cell: tc,
					colspan: sz.colspan,
					rowspan: sz.rowspan,
					source: "keyboard"
				});
			}
		};
		document.addEventListener("keydown", onKeyDown);
		cleanups.push(() => {
			document.removeEventListener("keydown", onKeyDown);
			element.removeAttribute("data-egg-keyboard-mode");
		});
	}
	if (options.algorithm !== false) {
		options.algorithm;
		const compact = options.compaction ?? true;
		const layoutModel = options.responsive?.layoutModel ?? options.layoutModel;
		function getColumnCount() {
			const s = getComputedStyle(element);
			return Math.max(1, s.gridTemplateColumns.split(" ").filter(Boolean).length);
		}
		let ix = null;
		let layoutVersion = 0;
		function calcLayout(items, movedId, cell, cols, colspan, rowspan) {
			if (ix?.type === "resize" && colspan != null && rowspan != null) return calculatePushLayout(items.map((i) => i.id === movedId ? {
				...i,
				column: cell.column,
				row: cell.row,
				width: colspan,
				height: rowspan
			} : i), movedId, cell, compact);
			return calculatePushLayout(items, movedId, cell, compact);
		}
		function getItemsWithOriginals(excludeId, originals) {
			return readItemsFromDOM(element).map((item) => {
				const orig = originals.get(item.id);
				if (orig && item.id !== excludeId) return {
					...item,
					column: orig.column,
					row: orig.row
				};
				return item;
			});
		}
		function getResizeItems(originals, resizedId, cell, colspan, rowspan) {
			const items = [];
			for (const [id, o] of originals) if (id === resizedId) items.push({
				id,
				column: cell.column,
				row: cell.row,
				width: colspan,
				height: rowspan
			});
			else items.push({ ...o });
			return items;
		}
		function applyLayout(layout, excludeId, useVT, onApplied) {
			const v = ++layoutVersion;
			if (ix) {
				ix.layout = layout;
				ix.version = v;
			}
			const doApply = () => {
				if (v !== layoutVersion) return;
				core.previewCSS = layoutToCSS(layout, {
					excludeId: excludeId ?? void 0,
					maxColumns: ix?.columnCount
				});
				core.commitStyles();
				const els = element.querySelectorAll("[data-egg-item]");
				for (const el of els) {
					const e = el;
					if (getItemId(e) !== excludeId && e.style.viewTransitionName !== "none") {
						e.style.gridColumn = "";
						e.style.gridRow = "";
					}
				}
				onApplied?.();
			};
			if (useVT && "startViewTransition" in document) {
				if (ix?.type === "drag" && ix.element) ix.element.style.viewTransitionName = "dragging";
				document.startViewTransition(doApply);
			} else doApply();
		}
		function saveAndClear(layout, cols, afterSave) {
			if (!layoutModel || !cols) return;
			const positions = /* @__PURE__ */ new Map();
			for (const item of layout) positions.set(item.id, {
				column: item.column,
				row: item.row
			});
			layoutModel.saveLayout(cols, positions);
			afterSave?.();
			core.previewCSS = "";
			core.commitStyles();
			core.emit("layout-change", {
				items: layout,
				columnCount: cols
			});
		}
		const onStart = (e) => {
			const detail = e.detail;
			const isDrag = e.type === "egg-drag-start";
			const itemId = getItemId(detail.item);
			const items = readItemsFromDOM(element);
			const originals = /* @__PURE__ */ new Map();
			for (const i of items) originals.set(i.id, { ...i });
			ix = {
				type: isDrag ? "drag" : "resize",
				itemId,
				element: detail.item,
				source: detail.source,
				columnCount: getColumnCount(),
				originals,
				pendingCell: null,
				lastResize: null,
				layout: null,
				version: 0
			};
			const els = element.querySelectorAll("[data-egg-item]");
			for (const el of els) {
				const e = el;
				if (e !== detail.item) {
					e.style.gridColumn = "";
					e.style.gridRow = "";
				}
			}
			core.previewCSS = layoutToCSS(items, { maxColumns: ix.columnCount });
			core.commitStyles();
		};
		const onMove = (e) => {
			if (!ix) return;
			const detail = e.detail;
			if (ix.type === "drag") {
				if (core.cameraScrolling) {
					ix.pendingCell = detail.cell;
					return;
				}
				ix.pendingCell = null;
				applyLayout(calcLayout(getItemsWithOriginals(ix.itemId, ix.originals), ix.itemId, detail.cell, ix.columnCount), ix.itemId, true);
			} else {
				const { cell, colspan, rowspan } = detail;
				if (ix.lastResize && ix.lastResize.cell.column === cell.column && ix.lastResize.cell.row === cell.row && ix.lastResize.colspan === colspan && ix.lastResize.rowspan === rowspan) return;
				ix.lastResize = {
					cell: { ...cell },
					colspan,
					rowspan
				};
				applyLayout(calcLayout(getResizeItems(ix.originals, ix.itemId, cell, colspan, rowspan), ix.itemId, cell, ix.columnCount, colspan, rowspan), ix.itemId, true);
			}
		};
		const onEnd = (e) => {
			if (!ix) return;
			const detail = e.detail;
			const savedIx = ix;
			if (savedIx.element.style.viewTransitionName === "dragging") savedIx.element.style.viewTransitionName = "";
			const useVT = savedIx.source !== "pointer";
			let finalLayout;
			if (savedIx.type === "drag") finalLayout = calcLayout(getItemsWithOriginals(savedIx.itemId, savedIx.originals), savedIx.itemId, detail.cell, savedIx.columnCount);
			else finalLayout = calcLayout(getResizeItems(savedIx.originals, savedIx.itemId, detail.cell, detail.colspan, detail.rowspan), savedIx.itemId, detail.cell, savedIx.columnCount, detail.colspan, detail.rowspan);
			const savedCols = savedIx.columnCount;
			const isResize = savedIx.type === "resize";
			const savedItemId = savedIx.itemId;
			applyLayout(finalLayout, null, useVT, () => saveAndClear(finalLayout, savedCols, isResize ? () => layoutModel?.updateItemSize(savedItemId, {
				width: detail.colspan,
				height: detail.rowspan
			}) : void 0));
			ix = null;
		};
		const onCancel = () => {
			if (!ix) return;
			const restoreLayout = Array.from(ix.originals.values());
			const restore = () => applyLayout(restoreLayout, null, false);
			if ("startViewTransition" in document) document.startViewTransition(restore);
			else restore();
			ix = null;
		};
		const onCameraSettled = () => {
			if (!ix || ix.type !== "drag") return;
			let cell = ix.pendingCell;
			if (!cell && ix.element) {
				const r = ix.element.getBoundingClientRect();
				cell = core.getCellFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			}
			if (!cell) return;
			ix.pendingCell = null;
			applyLayout(calcLayout(getItemsWithOriginals(ix.itemId, ix.originals), ix.itemId, cell, ix.columnCount), ix.itemId, true);
		};
		const events = {
			"egg-drag-start": onStart,
			"egg-drag-move": onMove,
			"egg-drag-end": onEnd,
			"egg-drag-cancel": onCancel,
			"egg-resize-start": onStart,
			"egg-resize-move": onMove,
			"egg-resize-end": onEnd,
			"egg-resize-cancel": onCancel,
			"egg-camera-settled": onCameraSettled
		};
		for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
		cleanups.push(() => {
			for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
		});
	}
	if (options.camera !== false) {
		const camOpts = typeof options.camera === "object" ? options.camera : {};
		const edgeSize = camOpts.edgeSize ?? 60;
		const scrollSpeed = camOpts.scrollSpeed ?? 15;
		const settleDelay = camOpts.settleDelay ?? 150;
		let scrollContainer = window;
		let p = element.parentElement;
		while (p) {
			const s = getComputedStyle(p);
			if (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowX === "auto" || s.overflowX === "scroll") {
				scrollContainer = p;
				break;
			}
			p = p.parentElement;
		}
		let isDragging = false, dragSrc = null;
		let lastPX = 0, lastPY = 0;
		let rafId = null, settleId = null;
		let wasScrolling = false;
		function setScrolling(active) {
			if (active) {
				core.cameraScrolling = true;
				if (settleId) {
					clearTimeout(settleId);
					settleId = null;
				}
			} else {
				if (settleId) clearTimeout(settleId);
				settleId = setTimeout(() => {
					core.cameraScrolling = false;
					settleId = null;
					element.dispatchEvent(new CustomEvent("egg-camera-settled", { bubbles: true }));
				}, settleDelay);
			}
		}
		function scrollLoop() {
			if (!isDragging) {
				rafId = null;
				if (wasScrolling) {
					setScrolling(false);
					wasScrolling = false;
				}
				return;
			}
			const vp = scrollContainer === window ? {
				top: 0,
				left: 0,
				width: window.innerWidth,
				height: window.innerHeight
			} : (() => {
				const r = scrollContainer.getBoundingClientRect();
				return {
					top: r.top,
					left: r.left,
					width: r.width,
					height: r.height
				};
			})();
			const rx = lastPX - vp.left, ry = lastPY - vp.top;
			let vx = 0, vy = 0;
			if (rx < edgeSize) vx = -scrollSpeed * (1 - rx / edgeSize);
			else if (rx > vp.width - edgeSize) vx = scrollSpeed * (1 - (vp.width - rx) / edgeSize);
			if (ry < edgeSize) vy = -scrollSpeed * (1 - ry / edgeSize);
			else if (ry > vp.height - edgeSize) vy = scrollSpeed * (1 - (vp.height - ry) / edgeSize);
			if (vx || vy) {
				if (!wasScrolling) setScrolling(true);
				wasScrolling = true;
				if (scrollContainer === window) window.scrollBy(vx, vy);
				else {
					scrollContainer.scrollLeft += vx;
					scrollContainer.scrollTop += vy;
				}
			} else if (wasScrolling) {
				setScrolling(false);
				wasScrolling = false;
			}
			rafId = requestAnimationFrame(scrollLoop);
		}
		const onCamPtrMove = (e) => {
			if (!isDragging) return;
			lastPX = e.clientX;
			lastPY = e.clientY;
			if (rafId === null) rafId = requestAnimationFrame(scrollLoop);
		};
		const stopLoop = () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			setScrolling(false);
		};
		const camEvents = {
			"egg-drag-start": ((e) => {
				isDragging = true;
				dragSrc = e.detail.source;
				if (dragSrc === "pointer") window.addEventListener("pointermove", onCamPtrMove);
			}),
			"egg-drag-move": ((e) => {
				if (e.detail.source === "pointer") {
					lastPX = e.detail.x;
					lastPY = e.detail.y;
				} else requestAnimationFrame(() => e.detail.item.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
					inline: "nearest"
				}));
			}),
			"egg-drag-end": ((e) => {
				const wp = dragSrc === "pointer";
				isDragging = false;
				dragSrc = null;
				stopLoop();
				if (wp) window.removeEventListener("pointermove", onCamPtrMove);
				if (!wp) setTimeout(() => requestAnimationFrame(() => e.detail.item.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
					inline: "nearest"
				})), 100);
			}),
			"egg-drag-cancel": (() => {
				const wp = dragSrc === "pointer";
				isDragging = false;
				dragSrc = null;
				stopLoop();
				if (wp) window.removeEventListener("pointermove", onCamPtrMove);
			}),
			"egg-select": ((e) => {
				if (!isDragging) e.detail.item.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
					inline: "nearest"
				});
			})
		};
		for (const [name, handler] of Object.entries(camEvents)) element.addEventListener(name, handler);
		cleanups.push(() => {
			stopLoop();
			for (const [name, handler] of Object.entries(camEvents)) element.removeEventListener(name, handler);
		});
	}
	if (options.placeholder !== false) {
		const className = (typeof options.placeholder === "object" ? options.placeholder : {}).className ?? "egg-placeholder";
		let ph = null;
		function createPH() {
			if (ph) return;
			ph = document.createElement("div");
			ph.className = className;
			ph.style.pointerEvents = "none";
			ph.style.viewTransitionName = "none";
			element.appendChild(ph);
		}
		function updatePH(c, r, cs, rs) {
			if (!ph) return;
			ph.style.gridColumn = `${c} / span ${cs}`;
			ph.style.gridRow = `${r} / span ${rs}`;
		}
		function removePH() {
			if (ph) {
				ph.remove();
				ph = null;
			}
		}
		const phEvents = {
			"egg-drag-start": ((e) => {
				createPH();
				updatePH(e.detail.cell.column, e.detail.cell.row, e.detail.colspan, e.detail.rowspan);
			}),
			"egg-drag-move": ((e) => {
				updatePH(e.detail.cell.column, e.detail.cell.row, e.detail.colspan, e.detail.rowspan);
			}),
			"egg-drop-preview": ((e) => {
				updatePH(e.detail.cell.column, e.detail.cell.row, e.detail.colspan, e.detail.rowspan);
			}),
			"egg-drag-end": (() => removePH()),
			"egg-drag-cancel": (() => removePH()),
			"egg-resize-start": ((e) => {
				createPH();
				updatePH(e.detail.cell.column, e.detail.cell.row, e.detail.colspan, e.detail.rowspan);
			}),
			"egg-resize-move": ((e) => {
				updatePH(e.detail.cell.column, e.detail.cell.row, e.detail.colspan, e.detail.rowspan);
			}),
			"egg-resize-end": (() => removePH()),
			"egg-resize-cancel": (() => removePH())
		};
		for (const [name, handler] of Object.entries(phEvents)) element.addEventListener(name, handler);
		document.addEventListener("pointerup", () => requestAnimationFrame(() => {
			if (ph && !document.querySelector("[data-egg-dragging]") && !document.querySelector("[data-egg-resizing]")) removePH();
		}));
		cleanups.push(() => {
			removePH();
			for (const [name, handler] of Object.entries(phEvents)) element.removeEventListener(name, handler);
		});
	}
	if (options.accessibility !== false) {
		const live = document.createElement("div");
		live.setAttribute("aria-live", "assertive");
		live.setAttribute("aria-atomic", "true");
		Object.assign(live.style, {
			position: "absolute",
			width: "1px",
			height: "1px",
			padding: "0",
			margin: "-1px",
			overflow: "hidden",
			clip: "rect(0,0,0,0)",
			whiteSpace: "nowrap",
			border: "0"
		});
		element.appendChild(live);
		let lastA11yCell = null, lastA11ySize = null;
		function announce(msg) {
			live.textContent = "";
			requestAnimationFrame(() => {
				live.textContent = msg;
			});
		}
		function label(item) {
			return item.getAttribute("data-egg-label") || item.getAttribute("aria-label") || item.id || "Item";
		}
		function pos(cell) {
			return `row ${cell.row}, column ${cell.column}`;
		}
		function tpl(item, event, vars, fallback) {
			const t = item.getAttribute(`data-egg-announce-${event}`) || element.getAttribute(`data-egg-announce-${event}`);
			return t ? t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : fallback;
		}
		const a11yEvents = {
			"egg-drag-start": ((e) => {
				lastA11yCell = e.detail.cell;
				const l = label(e.detail.item), p = pos(e.detail.cell);
				announce(tpl(e.detail.item, "grab", {
					label: l,
					row: String(e.detail.cell.row),
					column: String(e.detail.cell.column)
				}, `${l} grabbed. Position ${p}. Use arrow keys to move, Enter to drop, Escape to cancel.`));
			}),
			"egg-drag-move": ((e) => {
				const c = e.detail.cell;
				if (lastA11yCell && c.row === lastA11yCell.row && c.column === lastA11yCell.column) return;
				lastA11yCell = c;
				announce(tpl(e.detail.item, "move", {
					label: label(e.detail.item),
					row: String(c.row),
					column: String(c.column)
				}, `Moved to ${pos(c)}.`));
			}),
			"egg-drag-end": ((e) => {
				lastA11yCell = null;
				const l = label(e.detail.item), p = pos(e.detail.cell);
				announce(tpl(e.detail.item, "drop", {
					label: l,
					row: String(e.detail.cell.row),
					column: String(e.detail.cell.column)
				}, `${l} dropped at ${p}.`));
			}),
			"egg-drag-cancel": ((e) => {
				lastA11yCell = null;
				announce(tpl(e.detail.item, "cancel", { label: label(e.detail.item) }, `${label(e.detail.item)} drag cancelled.`));
			}),
			"egg-resize-start": ((e) => {
				lastA11ySize = {
					colspan: e.detail.colspan,
					rowspan: e.detail.rowspan
				};
				const sz = `${e.detail.colspan} columns by ${e.detail.rowspan} rows`;
				announce(tpl(e.detail.item, "resize-start", {
					label: label(e.detail.item),
					colspan: String(e.detail.colspan),
					rowspan: String(e.detail.rowspan)
				}, `${label(e.detail.item)} resize started. Size ${sz}.`));
			}),
			"egg-resize-move": ((e) => {
				if (lastA11ySize && e.detail.colspan === lastA11ySize.colspan && e.detail.rowspan === lastA11ySize.rowspan) return;
				lastA11ySize = {
					colspan: e.detail.colspan,
					rowspan: e.detail.rowspan
				};
				announce(tpl(e.detail.item, "resize-move", {
					label: label(e.detail.item),
					colspan: String(e.detail.colspan),
					rowspan: String(e.detail.rowspan)
				}, `Resized to ${e.detail.colspan} columns by ${e.detail.rowspan} rows.`));
			}),
			"egg-resize-end": ((e) => {
				lastA11ySize = null;
				const sz = `${e.detail.colspan} columns by ${e.detail.rowspan} rows`;
				announce(tpl(e.detail.item, "resize-end", {
					label: label(e.detail.item),
					colspan: String(e.detail.colspan),
					rowspan: String(e.detail.rowspan),
					row: String(e.detail.cell.row),
					column: String(e.detail.cell.column)
				}, `${label(e.detail.item)} resized to ${sz} at ${pos(e.detail.cell)}.`));
			}),
			"egg-resize-cancel": ((e) => {
				lastA11ySize = null;
				announce(tpl(e.detail.item, "resize-cancel", { label: label(e.detail.item) }, `${label(e.detail.item)} resize cancelled.`));
			})
		};
		for (const [name, handler] of Object.entries(a11yEvents)) element.addEventListener(name, handler);
		cleanups.push(() => {
			live.remove();
			for (const [name, handler] of Object.entries(a11yEvents)) element.removeEventListener(name, handler);
		});
	}
	if (options.responsive) {
		const { layoutModel } = options.responsive;
		let cellSize = options.responsive.cellSize;
		let gap = options.responsive.gap;
		function inferMetrics() {
			if (cellSize !== void 0 && gap !== void 0) return;
			const s = getComputedStyle(element);
			if (gap === void 0) gap = parseFloat(s.columnGap) || parseFloat(s.gap) || 16;
			if (cellSize === void 0) {
				const ar = parseFloat(s.gridAutoRows);
				cellSize = ar > 0 ? ar : parseFloat(s.gridTemplateColumns.split(" ")[0] ?? "184") || 184;
			}
		}
		function injectCSS() {
			inferMetrics();
			const gridSelector = element.id ? `#${element.id}` : element.className ? `.${element.className.split(" ")[0]}` : ".grid";
			core.baseCSS = layoutModel.generateAllBreakpointCSS({
				cellSize,
				gap,
				gridSelector
			});
			core.commitStyles();
		}
		if (!core.baseCSS.trim()) injectCSS();
		const unsub = layoutModel.subscribe(() => injectCSS());
		let lastColCount = layoutModel.currentColumnCount;
		const ro = new ResizeObserver(() => {
			const s = getComputedStyle(element);
			const newCount = Math.max(1, s.gridTemplateColumns.split(" ").filter(Boolean).length);
			if (newCount !== lastColCount) {
				const prev = lastColCount;
				lastColCount = newCount;
				layoutModel.setCurrentColumnCount(newCount);
				element.dispatchEvent(new CustomEvent("egg-column-count-change", {
					bubbles: true,
					detail: {
						previousCount: prev,
						currentCount: newCount
					}
				}));
			}
		});
		ro.observe(element);
		cleanups.push(() => {
			ro.disconnect();
			unsub();
		});
	}
	if (!options.responsive && !core.baseCSS) {
		core.baseCSS = layoutToCSS(readItemsFromDOM(element));
		core.commitStyles();
		element.querySelectorAll("[data-egg-item]").forEach((el) => {
			el.style.removeProperty("grid-column");
			el.style.removeProperty("grid-row");
		});
	}
	return core;
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
			algorithm: algorithmAttr === "none" ? false : "push",
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
				if (this.core?.phase === "interacting") return;
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
export { EgGridElement, calculatePushLayout, compactUp, createLayoutModel, getItemCell, getItemId, getItemSize, init, itemsOverlap, layoutToCSS, pushDown, readItemsFromDOM };

//# sourceMappingURL=eg-grid-element.js.map