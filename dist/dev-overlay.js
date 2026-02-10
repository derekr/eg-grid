function isDragging(state) {
	return (state.phase === "interacting" || state.phase === "committing") && state.interaction?.type === "drag";
}
function isResizing(state) {
	return (state.phase === "interacting" || state.phase === "committing") && state.interaction?.type === "resize";
}
function getItemCell(item) {
	const style = getComputedStyle(item);
	return {
		column: parseInt(style.gridColumnStart, 10) || 1,
		row: parseInt(style.gridRowStart, 10) || 1
	};
}
var STYLES = `
.egg-dev-overlay {
	position: fixed;
	bottom: 16px;
	right: 16px;
	width: 320px;
	max-height: 400px;
	background: rgba(0, 0, 0, 0.95);
	color: #fff;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 12px;
	border-radius: 8px;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	view-transition-name: dev-overlay;
}

.egg-dev-overlay[hidden] {
	display: none;
}

.egg-dev-tabs {
	display: flex;
	border-bottom: 1px solid #333;
	flex-shrink: 0;
}

.egg-dev-tab {
	flex: 1;
	padding: 8px 12px;
	background: transparent;
	border: none;
	color: #888;
	cursor: pointer;
	font-family: inherit;
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.egg-dev-tab:hover {
	color: #ccc;
}

.egg-dev-tab[data-active="true"] {
	color: #fff;
	background: #222;
}

.egg-dev-content {
	flex: 1;
	overflow-y: auto;
	padding: 12px;
}

.egg-dev-section {
	margin-bottom: 12px;
}

.egg-dev-section:last-child {
	margin-bottom: 0;
}

.egg-dev-section-title {
	color: #888;
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 6px;
}

.egg-dev-grid-info {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 4px;
}

.egg-dev-info-item {
	display: flex;
	justify-content: space-between;
}

.egg-dev-info-label {
	color: #888;
}

.egg-dev-info-value {
	color: #4ade80;
}

.egg-dev-items-list {
	max-height: 120px;
	overflow-y: auto;
}

.egg-dev-item-row {
	display: flex;
	justify-content: space-between;
	padding: 2px 0;
	border-bottom: 1px solid #222;
}

.egg-dev-item-id {
	color: #60a5fa;
}

.egg-dev-item-pos {
	color: #888;
}

.egg-dev-event-log {
	max-height: 150px;
	overflow-y: auto;
}

.egg-dev-event {
	padding: 2px 0;
	border-bottom: 1px solid #222;
	display: flex;
	gap: 8px;
}

.egg-dev-event-time {
	color: #666;
	flex-shrink: 0;
}

.egg-dev-event-type {
	color: #f472b6;
	flex-shrink: 0;
}

.egg-dev-event-detail {
	color: #888;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.egg-dev-config-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 6px 0;
	border-bottom: 1px solid #222;
}

.egg-dev-config-label {
	color: #ccc;
}

.egg-dev-toggle {
	position: relative;
	width: 36px;
	height: 20px;
	background: #444;
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.2s;
}

.egg-dev-toggle[data-checked="true"] {
	background: #4ade80;
}

.egg-dev-toggle::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 16px;
	height: 16px;
	background: #fff;
	border-radius: 50%;
	transition: transform 0.2s;
}

.egg-dev-toggle[data-checked="true"]::after {
	transform: translateX(16px);
}

.egg-dev-select {
	background: #333;
	color: #fff;
	border: 1px solid #444;
	border-radius: 4px;
	padding: 4px 8px;
	font-family: inherit;
	font-size: 12px;
}

.egg-dev-close {
	position: absolute;
	top: 8px;
	right: 8px;
	background: transparent;
	border: none;
	color: #666;
	cursor: pointer;
	font-size: 16px;
	line-height: 1;
	padding: 4px;
}

.egg-dev-close:hover {
	color: #fff;
}

.egg-dev-hint {
	color: #666;
	font-size: 10px;
	text-align: center;
	padding: 8px;
	border-top: 1px solid #222;
}

.egg-dev-action-btn {
	background: #333;
	color: #fff;
	border: 1px solid #444;
	border-radius: 4px;
	padding: 6px 12px;
	font-family: inherit;
	font-size: 12px;
	cursor: pointer;
	transition: background 0.2s;
}

.egg-dev-action-btn:hover {
	background: #444;
}

.egg-dev-action-btn:active {
	background: #555;
}

.egg-dev-status {
	color: #888;
	font-size: 11px;
	margin-top: 4px;
}
`;
function attachDevOverlay(gridElement, options = {}) {
	const { initialTab = "debug", toggleKey = "D", visible = false, core } = options;
	let styleElement = document.getElementById("egg-dev-overlay-styles");
	if (!styleElement) {
		styleElement = document.createElement("style");
		styleElement.id = "egg-dev-overlay-styles";
		styleElement.textContent = STYLES;
		document.head.appendChild(styleElement);
	}
	let currentTab = initialTab;
	let isVisible = visible;
	const eventLog = [];
	const configOptions = [];
	const startTime = performance.now();
	const overlay = document.createElement("div");
	overlay.className = "egg-dev-overlay";
	overlay.hidden = !isVisible;
	function formatTime(time) {
		return `${((time - startTime) / 1e3).toFixed(1)}s`;
	}
	function render() {
		const gridInfo = core?.getGridInfo();
		const items = Array.from(gridElement.querySelectorAll("[data-egg-item]"));
		overlay.innerHTML = `
			<button class="egg-dev-close">&times;</button>
			<div class="egg-dev-tabs">
				<button class="egg-dev-tab" data-tab="debug" data-active="${currentTab === "debug"}">Debug</button>
				<button class="egg-dev-tab" data-tab="config" data-active="${currentTab === "config"}">Config</button>
			</div>
			<div class="egg-dev-content">
				${currentTab === "debug" ? renderDebugTab(gridInfo, items) : renderConfigTab()}
			</div>
			<div class="egg-dev-hint">Shift+${toggleKey} to toggle</div>
		`;
		overlay.querySelector(".egg-dev-close")?.addEventListener("click", hide);
		overlay.querySelectorAll(".egg-dev-tab").forEach((tab) => {
			tab.addEventListener("click", () => {
				currentTab = tab.dataset.tab;
				render();
			});
		});
		overlay.querySelectorAll(".egg-dev-toggle").forEach((toggle) => {
			toggle.addEventListener("click", () => {
				const key = toggle.dataset.key;
				const option = configOptions.find((o) => o.key === key);
				if (option && option.type === "boolean") {
					option.value = !option.value;
					option.onChange(option.value);
					render();
				}
			});
		});
		overlay.querySelectorAll(".egg-dev-select").forEach((select) => {
			select.addEventListener("change", (e) => {
				const key = select.dataset.key;
				const option = configOptions.find((o) => o.key === key);
				if (option && option.type === "select" && option.onChange) {
					option.value = e.target.value;
					option.onChange(option.value);
				}
			});
		});
		overlay.querySelectorAll(".egg-dev-action-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				const key = btn.dataset.key;
				const option = configOptions.find((o) => o.key === key);
				if (option && option.type === "action" && option.onAction) option.onAction();
			});
		});
	}
	function renderDebugTab(gridInfo, items) {
		if (!gridInfo) return "<div class=\"egg-dev-section\">No core available</div>";
		const smState = core?.stateMachine.getState();
		const dragging = smState && isDragging(smState);
		const resizing = smState && isResizing(smState);
		const interaction = smState?.interaction;
		return `
			${core ? `
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">State</div>
				<div class="egg-dev-grid-info">
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">phase</span>
						<span class="egg-dev-info-value">${smState?.phase ?? "unknown"}</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">interaction</span>
						<span class="egg-dev-info-value">${dragging ? "dragging" : resizing ? "resizing" : "none"}${interaction ? ` (${interaction.mode})` : ""}</span>
					</div>
					${interaction ? `
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">item</span>
						<span class="egg-dev-info-value">${interaction.itemId || "?"}</span>
					</div>
					` : ""}
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">selected</span>
						<span class="egg-dev-info-value">${smState?.selectedItemId ?? "none"}</span>
					</div>
				</div>
			</div>
			` : ""}
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Grid Info</div>
				<div class="egg-dev-grid-info">
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Columns</span>
						<span class="egg-dev-info-value">${gridInfo.columns.length}</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Rows</span>
						<span class="egg-dev-info-value">${gridInfo.rows.length}</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Cell W</span>
						<span class="egg-dev-info-value">${Math.round(gridInfo.cellWidth)}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Cell H</span>
						<span class="egg-dev-info-value">${Math.round(gridInfo.cellHeight)}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Gap</span>
						<span class="egg-dev-info-value">${gridInfo.gap}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Items</span>
						<span class="egg-dev-info-value">${items.length}</span>
					</div>
				</div>
			</div>
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Items</div>
				<div class="egg-dev-items-list">
					${items.map((item) => {
			const cell = getItemCell(item);
			const id = item.dataset.eggItem || item.dataset.id || item.id || "?";
			const colspan = item.getAttribute("data-egg-colspan") || "1";
			const rowspan = item.getAttribute("data-egg-rowspan") || "1";
			return `
							<div class="egg-dev-item-row">
								<span class="egg-dev-item-id">${id}</span>
								<span class="egg-dev-item-pos">col ${cell.column}, row ${cell.row} (${colspan}×${rowspan})</span>
							</div>
						`;
		}).join("")}
				</div>
			</div>
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Event Log</div>
				<div class="egg-dev-event-log">
					${eventLog.length === 0 ? "<div style=\"color: #666\">No events yet</div>" : ""}
					${eventLog.slice(-20).reverse().map((entry) => `
						<div class="egg-dev-event">
							<span class="egg-dev-event-time">${formatTime(entry.time)}</span>
							<span class="egg-dev-event-type">${entry.type}</span>
							<span class="egg-dev-event-detail">${entry.detail}</span>
						</div>
					`).join("")}
				</div>
			</div>
		`;
	}
	function renderConfigTab() {
		if (configOptions.length === 0) return `<div style="color: #666; text-align: center; padding: 20px;">No config options registered.<br><br>Use registerOption() to add options.</div>`;
		const toggles = configOptions.filter((o) => o.type === "boolean");
		const selects = configOptions.filter((o) => o.type === "select");
		const actions = configOptions.filter((o) => o.type === "action");
		return `
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Options</div>
				${toggles.map((option) => `
					<div class="egg-dev-config-row">
						<span class="egg-dev-config-label">${option.label}</span>
						<div class="egg-dev-toggle" data-key="${option.key}" data-checked="${option.value}"></div>
					</div>
				`).join("")}
				${selects.map((option) => `
					<div class="egg-dev-config-row">
						<span class="egg-dev-config-label">${option.label}</span>
						<select class="egg-dev-select" data-key="${option.key}">
							${(option.options || []).map((opt) => `<option value="${opt}"${opt === option.value ? " selected" : ""}>${opt}</option>`).join("")}
						</select>
					</div>
				`).join("")}
			</div>
			${actions.length > 0 ? `
				<div class="egg-dev-section">
					<div class="egg-dev-section-title">Actions</div>
					${actions.map((option) => `
						<div class="egg-dev-config-row">
							<span class="egg-dev-config-label">${option.label}</span>
							<button class="egg-dev-action-btn" data-key="${option.key}">Run</button>
						</div>
					`).join("")}
				</div>
			` : ""}
		`;
	}
	function logEvent(type, detail) {
		eventLog.push({
			time: performance.now(),
			type,
			detail
		});
		if (eventLog.length > 100) eventLog.shift();
		if (isVisible && currentTab === "debug") render();
	}
	function show() {
		isVisible = true;
		overlay.hidden = false;
		render();
	}
	function hide() {
		isVisible = false;
		overlay.hidden = true;
	}
	function toggle() {
		if (isVisible) hide();
		else show();
	}
	function registerOption(option) {
		const existing = configOptions.findIndex((o) => o.key === option.key);
		if (existing >= 0) configOptions[existing] = option;
		else configOptions.push(option);
		if (isVisible) render();
	}
	const onDragStart = (e) => {
		const detail = e.detail;
		logEvent("drag-start", `${detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "?"} at (${detail.cell.column}, ${detail.cell.row})`);
	};
	const onDragMove = (e) => {
		const detail = e.detail;
		logEvent("drag-move", `${detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "?"} → (${detail.cell.column}, ${detail.cell.row})`);
	};
	const onDragEnd = (e) => {
		const detail = e.detail;
		logEvent("drag-end", `${detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "?"} at (${detail.cell.column}, ${detail.cell.row})`);
	};
	const onDragCancel = (e) => {
		const detail = e.detail;
		logEvent("drag-cancel", detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "?");
	};
	const onSelect = (e) => {
		const detail = e.detail;
		logEvent("select", detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "?");
	};
	const onDeselect = (e) => {
		const detail = e.detail;
		logEvent("deselect", detail.item?.dataset?.eggItem || detail.item?.dataset?.id || detail.item?.id || "none");
	};
	const onKeyDown = (e) => {
		if (e.key === toggleKey && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
			e.preventDefault();
			toggle();
		}
	};
	gridElement.addEventListener("egg-drag-start", onDragStart);
	gridElement.addEventListener("egg-drag-move", onDragMove);
	gridElement.addEventListener("egg-drag-end", onDragEnd);
	gridElement.addEventListener("egg-drag-cancel", onDragCancel);
	gridElement.addEventListener("egg-select", onSelect);
	gridElement.addEventListener("egg-deselect", onDeselect);
	document.addEventListener("keydown", onKeyDown);
	document.body.appendChild(overlay);
	render();
	function destroy() {
		gridElement.removeEventListener("egg-drag-start", onDragStart);
		gridElement.removeEventListener("egg-drag-move", onDragMove);
		gridElement.removeEventListener("egg-drag-end", onDragEnd);
		gridElement.removeEventListener("egg-drag-cancel", onDragCancel);
		gridElement.removeEventListener("egg-select", onSelect);
		gridElement.removeEventListener("egg-deselect", onDeselect);
		document.removeEventListener("keydown", onKeyDown);
		overlay.remove();
	}
	return {
		toggle,
		show,
		hide,
		registerOption,
		destroy
	};
}
export { attachDevOverlay };

//# sourceMappingURL=dev-overlay.js.map