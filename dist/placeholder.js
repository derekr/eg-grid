function listenEvents(element, events) {
	for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
	return () => {
		for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
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
export { attachPlaceholder };

//# sourceMappingURL=placeholder.js.map