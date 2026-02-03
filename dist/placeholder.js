// gridiot/engine.ts
var plugins = /* @__PURE__ */ new Map();
function registerPlugin(plugin) {
  plugins.set(plugin.name, plugin);
}

// gridiot/plugins/placeholder.ts
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
export {
  PLACEHOLDER_CSS,
  attachPlaceholder,
  attachPlaceholderStyles
};
//# sourceMappingURL=placeholder.js.map
