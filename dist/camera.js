// gridiot/engine.ts
var plugins = /* @__PURE__ */ new Map();
function registerPlugin(plugin) {
  plugins.set(plugin.name, plugin);
}

// gridiot/plugins/camera.ts
function findScrollParent(element) {
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (overflowY === "auto" || overflowY === "scroll" || overflowX === "auto" || overflowX === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}
function getViewportRect(container) {
  if (container === window) {
    return {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }
  const rect = container.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}
function attachCamera(gridElement, options = {}) {
  const {
    mode: initialMode = "contain",
    scrollContainer: customContainer,
    edgeSize = 60,
    scrollSpeed = 15,
    scrollBehavior = "smooth",
    scrollMargin = 20,
    scrollOnSelect = true,
    autoScrollOnDrag = true,
    settleDelay = 150,
    core
  } = options;
  let mode = initialMode;
  let scrollContainer = customContainer ?? findScrollParent(gridElement);
  let animationFrameId = null;
  let isDragging = false;
  let sawPointerMove = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let isScrolling = false;
  let settleTimeoutId = null;
  if (core) {
    core.providers.register("camera", () => ({
      isScrolling,
      mode
    }));
  }
  function setScrolling(active) {
    if (active) {
      isScrolling = true;
      if (settleTimeoutId) {
        clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
      }
    } else {
      if (settleTimeoutId) clearTimeout(settleTimeoutId);
      settleTimeoutId = setTimeout(() => {
        isScrolling = false;
        settleTimeoutId = null;
        gridElement.dispatchEvent(
          new CustomEvent("gridiot:camera-settled", { bubbles: true })
        );
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
      if (scrollContainer === window) {
        window.scrollTo({ top: targetScrollTop, left: targetScrollLeft, behavior });
      } else {
        scrollContainer.scrollTo({
          top: targetScrollTop,
          left: targetScrollLeft,
          behavior
        });
      }
    } else {
      item.scrollIntoView({
        behavior,
        block: "nearest",
        inline: "nearest"
      });
    }
  }
  function getEdgeScrollVelocity(pointerX, pointerY) {
    const viewport = getViewportRect(scrollContainer);
    let velocityX = 0;
    let velocityY = 0;
    const relativeX = pointerX - viewport.left;
    const relativeY = pointerY - viewport.top;
    if (relativeX < edgeSize) {
      velocityX = -scrollSpeed * (1 - relativeX / edgeSize);
    } else if (relativeX > viewport.width - edgeSize) {
      velocityX = scrollSpeed * (1 - (viewport.width - relativeX) / edgeSize);
    }
    if (relativeY < edgeSize) {
      velocityY = -scrollSpeed * (1 - relativeY / edgeSize);
    } else if (relativeY > viewport.height - edgeSize) {
      velocityY = scrollSpeed * (1 - (viewport.height - relativeY) / edgeSize);
    }
    return { x: velocityX, y: velocityY };
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
    const isNearEdge = velocity.x !== 0 || velocity.y !== 0;
    if (isNearEdge) {
      if (!wasScrollingLastFrame) {
        setScrolling(true);
      }
      wasScrollingLastFrame = true;
      if (scrollContainer === window) {
        window.scrollBy(velocity.x, velocity.y);
      } else {
        scrollContainer.scrollLeft += velocity.x;
        scrollContainer.scrollTop += velocity.y;
      }
    } else {
      if (wasScrollingLastFrame) {
        setScrolling(false);
        wasScrollingLastFrame = false;
      }
    }
    animationFrameId = requestAnimationFrame(scrollLoop);
  }
  function startScrollLoop() {
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(scrollLoop);
    }
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
    sawPointerMove = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    startScrollLoop();
  }
  function onDragStart(e) {
    isDragging = true;
    sawPointerMove = false;
    window.addEventListener("pointermove", onPointerMove);
  }
  function onDragMove(e) {
    if (mode === "off") return;
    if (e.detail.x !== 0 || e.detail.y !== 0) {
      lastPointerX = e.detail.x;
      lastPointerY = e.detail.y;
    } else {
      requestAnimationFrame(() => {
        scrollTo(e.detail.item, "smooth");
      });
    }
  }
  function onDragEnd(e) {
    const wasPointerDrag = sawPointerMove;
    isDragging = false;
    sawPointerMove = false;
    stopScrollLoop();
    window.removeEventListener("pointermove", onPointerMove);
    if (!wasPointerDrag && scrollOnSelect) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          scrollTo(e.detail.item, "smooth");
        });
      }, 100);
    }
  }
  function onDragCancel(e) {
    isDragging = false;
    stopScrollLoop();
    window.removeEventListener("pointermove", onPointerMove);
  }
  function onSelect(e) {
    if (!scrollOnSelect || mode === "off") return;
    if (isDragging) return;
    scrollTo(e.detail.item);
  }
  gridElement.addEventListener(
    "gridiot:drag-start",
    onDragStart
  );
  gridElement.addEventListener(
    "gridiot:drag-move",
    onDragMove
  );
  gridElement.addEventListener("gridiot:drag-end", onDragEnd);
  gridElement.addEventListener(
    "gridiot:drag-cancel",
    onDragCancel
  );
  gridElement.addEventListener("gridiot:select", onSelect);
  function destroy() {
    stopScrollLoop();
    gridElement.removeEventListener(
      "gridiot:drag-start",
      onDragStart
    );
    gridElement.removeEventListener(
      "gridiot:drag-move",
      onDragMove
    );
    gridElement.removeEventListener(
      "gridiot:drag-end",
      onDragEnd
    );
    gridElement.removeEventListener(
      "gridiot:drag-cancel",
      onDragCancel
    );
    gridElement.removeEventListener(
      "gridiot:select",
      onSelect
    );
  }
  return {
    setMode(newMode) {
      mode = newMode;
      if (mode === "off") {
        stopScrollLoop();
      }
    },
    getMode() {
      return mode;
    },
    scrollTo,
    stop: stopScrollLoop,
    destroy
  };
}
registerPlugin({
  name: "camera",
  init(core, options) {
    const instance = attachCamera(core.element, {
      ...options,
      core: options?.core ?? core
    });
    return () => instance.destroy();
  }
});
export {
  attachCamera
};
//# sourceMappingURL=camera.js.map
