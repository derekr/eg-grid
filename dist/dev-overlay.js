// gridiot/engine.ts
function parseGridTemplate(template) {
  const values = template.split(" ").filter(Boolean);
  return values.map((v) => parseFloat(v) || 0);
}
function getItemCell(item) {
  const style = getComputedStyle(item);
  return {
    column: parseInt(style.gridColumnStart, 10) || 1,
    row: parseInt(style.gridRowStart, 10) || 1
  };
}
function getGridInfo(element) {
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
}

// gridiot/plugins/dev-overlay.ts
var STYLES = `
.gridiot-dev-overlay {
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

.gridiot-dev-overlay[hidden] {
	display: none;
}

.gridiot-dev-tabs {
	display: flex;
	border-bottom: 1px solid #333;
	flex-shrink: 0;
}

.gridiot-dev-tab {
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

.gridiot-dev-tab:hover {
	color: #ccc;
}

.gridiot-dev-tab[data-active="true"] {
	color: #fff;
	background: #222;
}

.gridiot-dev-content {
	flex: 1;
	overflow-y: auto;
	padding: 12px;
}

.gridiot-dev-section {
	margin-bottom: 12px;
}

.gridiot-dev-section:last-child {
	margin-bottom: 0;
}

.gridiot-dev-section-title {
	color: #888;
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 6px;
}

.gridiot-dev-grid-info {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 4px;
}

.gridiot-dev-info-item {
	display: flex;
	justify-content: space-between;
}

.gridiot-dev-info-label {
	color: #888;
}

.gridiot-dev-info-value {
	color: #4ade80;
}

.gridiot-dev-items-list {
	max-height: 120px;
	overflow-y: auto;
}

.gridiot-dev-item-row {
	display: flex;
	justify-content: space-between;
	padding: 2px 0;
	border-bottom: 1px solid #222;
}

.gridiot-dev-item-id {
	color: #60a5fa;
}

.gridiot-dev-item-pos {
	color: #888;
}

.gridiot-dev-event-log {
	max-height: 150px;
	overflow-y: auto;
}

.gridiot-dev-event {
	padding: 2px 0;
	border-bottom: 1px solid #222;
	display: flex;
	gap: 8px;
}

.gridiot-dev-event-time {
	color: #666;
	flex-shrink: 0;
}

.gridiot-dev-event-type {
	color: #f472b6;
	flex-shrink: 0;
}

.gridiot-dev-event-detail {
	color: #888;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.gridiot-dev-config-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 6px 0;
	border-bottom: 1px solid #222;
}

.gridiot-dev-config-label {
	color: #ccc;
}

.gridiot-dev-toggle {
	position: relative;
	width: 36px;
	height: 20px;
	background: #444;
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.2s;
}

.gridiot-dev-toggle[data-checked="true"] {
	background: #4ade80;
}

.gridiot-dev-toggle::after {
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

.gridiot-dev-toggle[data-checked="true"]::after {
	transform: translateX(16px);
}

.gridiot-dev-select {
	background: #333;
	color: #fff;
	border: 1px solid #444;
	border-radius: 4px;
	padding: 4px 8px;
	font-family: inherit;
	font-size: 12px;
}

.gridiot-dev-close {
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

.gridiot-dev-close:hover {
	color: #fff;
}

.gridiot-dev-hint {
	color: #666;
	font-size: 10px;
	text-align: center;
	padding: 8px;
	border-top: 1px solid #222;
}

.gridiot-dev-action-btn {
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

.gridiot-dev-action-btn:hover {
	background: #444;
}

.gridiot-dev-action-btn:active {
	background: #555;
}

.gridiot-dev-status {
	color: #888;
	font-size: 11px;
	margin-top: 4px;
}
`;
function attachDevOverlay(gridElement, options = {}) {
  const { initialTab = "debug", toggleKey = "D", visible = false, core } = options;
  let styleElement = document.getElementById("gridiot-dev-overlay-styles");
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "gridiot-dev-overlay-styles";
    styleElement.textContent = STYLES;
    document.head.appendChild(styleElement);
  }
  let currentTab = initialTab;
  let isVisible = visible;
  const eventLog = [];
  const configOptions = [];
  const startTime = performance.now();
  const overlay = document.createElement("div");
  overlay.className = "gridiot-dev-overlay";
  overlay.hidden = !isVisible;
  function formatTime(time) {
    const elapsed = ((time - startTime) / 1e3).toFixed(1);
    return `${elapsed}s`;
  }
  function render() {
    const gridInfo = getGridInfo(gridElement);
    const items = Array.from(gridElement.querySelectorAll("[data-gridiot-item]"));
    overlay.innerHTML = `
			<button class="gridiot-dev-close">&times;</button>
			<div class="gridiot-dev-tabs">
				<button class="gridiot-dev-tab" data-tab="debug" data-active="${currentTab === "debug"}">Debug</button>
				<button class="gridiot-dev-tab" data-tab="config" data-active="${currentTab === "config"}">Config</button>
			</div>
			<div class="gridiot-dev-content">
				${currentTab === "debug" ? renderDebugTab(gridInfo, items) : renderConfigTab()}
			</div>
			<div class="gridiot-dev-hint">Shift+${toggleKey} to toggle</div>
		`;
    overlay.querySelector(".gridiot-dev-close")?.addEventListener("click", hide);
    overlay.querySelectorAll(".gridiot-dev-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        currentTab = tab.dataset.tab;
        render();
      });
    });
    overlay.querySelectorAll(".gridiot-dev-toggle").forEach((toggle2) => {
      toggle2.addEventListener("click", () => {
        const key = toggle2.dataset.key;
        const option = configOptions.find((o) => o.key === key);
        if (option && option.type === "boolean") {
          option.value = !option.value;
          option.onChange(option.value);
          render();
        }
      });
    });
    overlay.querySelectorAll(".gridiot-dev-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const key = select.dataset.key;
        const option = configOptions.find((o) => o.key === key);
        if (option && option.type === "select" && option.onChange) {
          option.value = e.target.value;
          option.onChange(option.value);
        }
      });
    });
    overlay.querySelectorAll(".gridiot-dev-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const option = configOptions.find((o) => o.key === key);
        if (option && option.type === "action" && option.onAction) {
          option.onAction();
        }
      });
    });
  }
  function renderDebugTab(gridInfo, items) {
    const dragState = core?.providers.get("drag");
    const layoutState = core?.providers.get("layout");
    return `
			${core ? `
			<div class="gridiot-dev-section">
				<div class="gridiot-dev-section-title">Providers</div>
				<div class="gridiot-dev-grid-info">
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">drag</span>
						<span class="gridiot-dev-info-value">${dragState ? `dragging ${dragState.item.dataset.id || dragState.item.id || "?"}` : "idle"}</span>
					</div>
					${dragState ? `
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">cell</span>
						<span class="gridiot-dev-info-value">(${dragState.cell.column}, ${dragState.cell.row})</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">start</span>
						<span class="gridiot-dev-info-value">(${dragState.startCell.column}, ${dragState.startCell.row})</span>
					</div>
					` : ""}
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">layout</span>
						<span class="gridiot-dev-info-value">${layoutState ? `${layoutState.items.length} items, ${layoutState.columns} cols` : "none"}</span>
					</div>
				</div>
			</div>
			` : ""}
			<div class="gridiot-dev-section">
				<div class="gridiot-dev-section-title">Grid Info</div>
				<div class="gridiot-dev-grid-info">
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Columns</span>
						<span class="gridiot-dev-info-value">${gridInfo.columns.length}</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Rows</span>
						<span class="gridiot-dev-info-value">${gridInfo.rows.length}</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Cell W</span>
						<span class="gridiot-dev-info-value">${Math.round(gridInfo.cellWidth)}px</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Cell H</span>
						<span class="gridiot-dev-info-value">${Math.round(gridInfo.cellHeight)}px</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Gap</span>
						<span class="gridiot-dev-info-value">${gridInfo.gap}px</span>
					</div>
					<div class="gridiot-dev-info-item">
						<span class="gridiot-dev-info-label">Items</span>
						<span class="gridiot-dev-info-value">${items.length}</span>
					</div>
				</div>
			</div>
			<div class="gridiot-dev-section">
				<div class="gridiot-dev-section-title">Items</div>
				<div class="gridiot-dev-items-list">
					${items.map((item) => {
      const cell = getItemCell(item);
      const id = item.dataset.id || item.id || "?";
      const colspan = item.getAttribute("data-gridiot-colspan") || "1";
      const rowspan = item.getAttribute("data-gridiot-rowspan") || "1";
      return `
							<div class="gridiot-dev-item-row">
								<span class="gridiot-dev-item-id">${id}</span>
								<span class="gridiot-dev-item-pos">col ${cell.column}, row ${cell.row} (${colspan}\xD7${rowspan})</span>
							</div>
						`;
    }).join("")}
				</div>
			</div>
			<div class="gridiot-dev-section">
				<div class="gridiot-dev-section-title">Event Log</div>
				<div class="gridiot-dev-event-log">
					${eventLog.length === 0 ? '<div style="color: #666">No events yet</div>' : ""}
					${eventLog.slice(-20).reverse().map((entry) => `
						<div class="gridiot-dev-event">
							<span class="gridiot-dev-event-time">${formatTime(entry.time)}</span>
							<span class="gridiot-dev-event-type">${entry.type}</span>
							<span class="gridiot-dev-event-detail">${entry.detail}</span>
						</div>
					`).join("")}
				</div>
			</div>
		`;
  }
  function renderConfigTab() {
    if (configOptions.length === 0) {
      return `<div style="color: #666; text-align: center; padding: 20px;">No config options registered.<br><br>Use registerOption() to add options.</div>`;
    }
    const toggles = configOptions.filter((o) => o.type === "boolean");
    const actions = configOptions.filter((o) => o.type === "action");
    return `
			<div class="gridiot-dev-section">
				<div class="gridiot-dev-section-title">Options</div>
				${toggles.map((option) => `
					<div class="gridiot-dev-config-row">
						<span class="gridiot-dev-config-label">${option.label}</span>
						<div class="gridiot-dev-toggle" data-key="${option.key}" data-checked="${option.value}"></div>
					</div>
				`).join("")}
			</div>
			${actions.length > 0 ? `
				<div class="gridiot-dev-section">
					<div class="gridiot-dev-section-title">Actions</div>
					${actions.map((option) => `
						<div class="gridiot-dev-config-row">
							<span class="gridiot-dev-config-label">${option.label}</span>
							<button class="gridiot-dev-action-btn" data-key="${option.key}">Run</button>
						</div>
					`).join("")}
				</div>
			` : ""}
		`;
  }
  function logEvent(type, detail) {
    eventLog.push({ time: performance.now(), type, detail });
    if (eventLog.length > 100) {
      eventLog.shift();
    }
    if (isVisible && currentTab === "debug") {
      render();
    }
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
    if (isVisible) {
      hide();
    } else {
      show();
    }
  }
  function registerOption(option) {
    const existing = configOptions.findIndex((o) => o.key === option.key);
    if (existing >= 0) {
      configOptions[existing] = option;
    } else {
      configOptions.push(option);
    }
    if (isVisible) {
      render();
    }
  }
  const onDragStart = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "?";
    logEvent("drag-start", `${id} at (${detail.cell.column}, ${detail.cell.row})`);
  };
  const onDragMove = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "?";
    logEvent("drag-move", `${id} \u2192 (${detail.cell.column}, ${detail.cell.row})`);
  };
  const onDragEnd = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "?";
    logEvent("drag-end", `${id} at (${detail.cell.column}, ${detail.cell.row})`);
  };
  const onDragCancel = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "?";
    logEvent("drag-cancel", id);
  };
  const onSelect = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "?";
    logEvent("select", id);
  };
  const onDeselect = (e) => {
    const detail = e.detail;
    const id = detail.item?.dataset?.id || detail.item?.id || "none";
    logEvent("deselect", id);
  };
  const onKeyDown = (e) => {
    if (e.key === toggleKey && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      toggle();
    }
  };
  gridElement.addEventListener("gridiot:drag-start", onDragStart);
  gridElement.addEventListener("gridiot:drag-move", onDragMove);
  gridElement.addEventListener("gridiot:drag-end", onDragEnd);
  gridElement.addEventListener("gridiot:drag-cancel", onDragCancel);
  gridElement.addEventListener("gridiot:select", onSelect);
  gridElement.addEventListener("gridiot:deselect", onDeselect);
  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);
  render();
  function destroy() {
    gridElement.removeEventListener("gridiot:drag-start", onDragStart);
    gridElement.removeEventListener("gridiot:drag-move", onDragMove);
    gridElement.removeEventListener("gridiot:drag-end", onDragEnd);
    gridElement.removeEventListener("gridiot:drag-cancel", onDragCancel);
    gridElement.removeEventListener("gridiot:select", onSelect);
    gridElement.removeEventListener("gridiot:deselect", onDeselect);
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }
  return { toggle, show, hide, registerOption, destroy };
}
export {
  attachDevOverlay
};
//# sourceMappingURL=dev-overlay.js.map
