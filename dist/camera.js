function listenEvents(element, events) {
	for (const [name, handler] of Object.entries(events)) element.addEventListener(name, handler);
	return () => {
		for (const [name, handler] of Object.entries(events)) element.removeEventListener(name, handler);
	};
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
export { attachCamera };

//# sourceMappingURL=camera.js.map