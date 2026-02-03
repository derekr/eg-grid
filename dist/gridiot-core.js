// state-machine.ts
function createInitialState() {
  return {
    phase: "idle",
    selectedItemId: null,
    interaction: null,
    keyboardModeActive: false
  };
}
function reducer(state, action) {
  switch (action.type) {
    case "SELECT": {
      if (state.phase !== "idle" && state.phase !== "selected") {
        return state;
      }
      return {
        ...state,
        phase: "selected",
        selectedItemId: action.itemId
      };
    }
    case "DESELECT": {
      if (state.phase !== "selected") {
        return state;
      }
      return {
        ...state,
        phase: "idle",
        selectedItemId: null
      };
    }
    case "START_INTERACTION": {
      if (state.phase !== "selected") {
        return state;
      }
      const { context } = action;
      return {
        ...state,
        phase: "interacting",
        interaction: {
          ...context,
          // Derive animation strategy from mode
          useFlip: context.mode === "pointer",
          useViewTransition: context.mode === "keyboard"
        }
      };
    }
    case "UPDATE_INTERACTION": {
      if (state.phase !== "interacting" || !state.interaction) {
        return state;
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          targetCell: action.targetCell,
          currentSize: action.currentSize ?? state.interaction.currentSize
        }
      };
    }
    case "COMMIT_INTERACTION": {
      if (state.phase !== "interacting") {
        return state;
      }
      return {
        ...state,
        phase: "committing"
      };
    }
    case "CANCEL_INTERACTION": {
      if (state.phase !== "interacting") {
        return state;
      }
      return {
        ...state,
        phase: "selected",
        interaction: null
      };
    }
    case "FINISH_COMMIT": {
      if (state.phase !== "committing") {
        return state;
      }
      return {
        ...state,
        phase: "selected",
        interaction: null
      };
    }
    case "TOGGLE_KEYBOARD_MODE": {
      return {
        ...state,
        keyboardModeActive: !state.keyboardModeActive
      };
    }
    default:
      return state;
  }
}
function canTransition(state, action) {
  switch (action.type) {
    case "SELECT":
      return state.phase === "idle" || state.phase === "selected";
    case "DESELECT":
      return state.phase === "selected";
    case "START_INTERACTION":
      return state.phase === "selected";
    case "UPDATE_INTERACTION":
      return state.phase === "interacting" && state.interaction !== null;
    case "COMMIT_INTERACTION":
      return state.phase === "interacting";
    case "CANCEL_INTERACTION":
      return state.phase === "interacting";
    case "FINISH_COMMIT":
      return state.phase === "committing";
    case "TOGGLE_KEYBOARD_MODE":
      return true;
    // Always allowed
    default:
      return false;
  }
}
function createStateMachine(initialState) {
  let state = initialState ?? createInitialState();
  const listeners = /* @__PURE__ */ new Set();
  return {
    getState() {
      return state;
    },
    transition(action) {
      const nextState = reducer(state, action);
      if (nextState !== state) {
        state = nextState;
        for (const listener of listeners) {
          listener(state, action);
        }
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    canTransition(action) {
      return canTransition(state, action);
    }
  };
}

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
  const stateMachine = createStateMachine();
  let selectedElement = null;
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
    stateMachine,
    // Selection state (backed by state machine)
    get selectedItem() {
      return selectedElement;
    },
    set selectedItem(item) {
      this.select(item);
    },
    select(item) {
      if (item === selectedElement) return;
      const previousItem = selectedElement;
      if (previousItem) {
        previousItem.removeAttribute("data-gridiot-selected");
      }
      if (item) {
        const itemId = item.id || item.getAttribute("data-gridiot-item") || "";
        stateMachine.transition({ type: "SELECT", itemId, element: item });
        selectedElement = item;
        item.setAttribute("data-gridiot-selected", "");
        this.emit("select", { item });
      } else {
        stateMachine.transition({ type: "DESELECT" });
        selectedElement = null;
        if (previousItem) {
          this.emit("deselect", { item: previousItem });
        }
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
  providers.register("state", () => stateMachine.getState());
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
