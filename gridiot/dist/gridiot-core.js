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
export {
  getItemCell,
  getPlugin,
  init,
  registerPlugin,
  setItemCell
};
//# sourceMappingURL=gridiot-core.js.map
