/**
 * HTML template for the Datastar + EG Grid demo.
 * Each tab is a separate route (MPA style).
 */
import { layoutToCSS, type ItemRect } from "./algorithm";

export function renderPage(items: ItemRect[], viteOrigin: string, tab: "morph" | "server" | "client"): string {
  const selectorMap: Record<string, string | undefined> = {
    morph: '#grid-morph [data-egg-item="ID"]',
    server: '#grid-server [data-egg-item="ID"]',
    client: undefined,
  };
  const initialCSS = layoutToCSS(items, selectorMap[tab]);

  const itemsHTML = items
    .map((item) => {
      const colorIndex = ((item.id.charCodeAt(item.id.length - 1) - 96) % 6) + 1;
      const label = item.id.replace("item-", "").toUpperCase();
      const sizeLabel =
        item.width > 1 || item.height > 1
          ? ` (${item.width}&times;${item.height})`
          : "";
      return `      <div class="item" data-egg-item="${item.id}" data-color="${colorIndex}">${label}${sizeLabel}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Datastar + EG Grid</title>
  <script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.7/bundles/datastar.js"><\/script>
  <script type="module" src="${viteOrigin}/src/bundles/element.ts"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 24px 32px;
    }

    h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 4px; }
    .subtitle { font-size: 0.8rem; color: #888; margin-bottom: 20px; }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .tab-link {
      padding: 10px 20px;
      color: #888;
      font-size: 0.85rem;
      font-family: inherit;
      text-decoration: none;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-link:hover { color: #ccc; }
    .tab-link.active {
      color: #fff;
      border-bottom-color: #4facfe;
    }

    /* Grid common */
    eg-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      grid-auto-rows: 120px;
      background: rgba(255,255,255,0.04);
      padding: 8px;
      border-radius: 12px;
      max-width: 560px;
    }

    .item {
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 16px;
      color: white;
      cursor: default;
      user-select: none;
      -webkit-user-select: none;
      position: relative;
      view-transition-name: var(--item-id);
      transition: filter 0.15s ease;
    }
    eg-grid[data-pointer-active] .item { cursor: grab; }
    .item[data-egg-dragging] {
      cursor: grabbing;
      transform: scale(1.03);
      filter: drop-shadow(0 16px 32px rgba(0,0,0,0.5));
      z-index: 100;
    }
    .item[data-egg-dropping] { z-index: 100; }
    .item[data-egg-selected] { outline: 2px solid #fbbf24; outline-offset: 2px; }
    .item[data-egg-resizing] { z-index: 100; outline: 2px solid rgba(251, 191, 36, 0.5); outline-offset: 2px; }

    /* Resize handles */
    .item::after {
      content: '';
      position: absolute;
      opacity: 0;
      pointer-events: none;
      border-radius: 3px;
      background: rgba(59, 130, 246, 0.7);
    }
    .item[data-egg-handle-hover="se"]::after { opacity: 1; width: 12px; height: 12px; bottom: 4px; right: 4px; }
    .item[data-egg-handle-hover="sw"]::after { opacity: 1; width: 12px; height: 12px; bottom: 4px; left: 4px; }
    .item[data-egg-handle-hover="ne"]::after { opacity: 1; width: 12px; height: 12px; top: 4px; right: 4px; }
    .item[data-egg-handle-hover="nw"]::after { opacity: 1; width: 12px; height: 12px; top: 4px; left: 4px; }
    .item[data-egg-handle-hover="n"]::after { opacity: 1; height: 3px; top: 4px; left: 16px; right: 16px; }
    .item[data-egg-handle-hover="s"]::after { opacity: 1; height: 3px; bottom: 4px; left: 16px; right: 16px; }
    .item[data-egg-handle-hover="e"]::after { opacity: 1; width: 3px; right: 4px; top: 16px; bottom: 16px; }
    .item[data-egg-handle-hover="w"]::after { opacity: 1; width: 3px; left: 4px; top: 16px; bottom: 16px; }
    .item[data-egg-handle-active]::after { opacity: 1; background: rgba(59, 130, 246, 0.95); box-shadow: 0 0 8px rgba(59, 130, 246, 0.5); }
    .item[data-egg-handle-active="se"]::after { width: 12px; height: 12px; bottom: 4px; right: 4px; top: auto; left: auto; }
    .item[data-egg-handle-active="sw"]::after { width: 12px; height: 12px; bottom: 4px; left: 4px; top: auto; right: auto; }
    .item[data-egg-handle-active="ne"]::after { width: 12px; height: 12px; top: 4px; right: 4px; bottom: auto; left: auto; }
    .item[data-egg-handle-active="nw"]::after { width: 12px; height: 12px; top: 4px; left: 4px; bottom: auto; right: auto; }
    .item[data-egg-handle-active="n"]::after { height: 3px; top: 4px; left: 16px; right: 16px; bottom: auto; width: auto; }
    .item[data-egg-handle-active="s"]::after { height: 3px; bottom: 4px; left: 16px; right: 16px; top: auto; width: auto; }
    .item[data-egg-handle-active="e"]::after { width: 3px; right: 4px; top: 16px; bottom: 16px; left: auto; height: auto; }
    .item[data-egg-handle-active="w"]::after { width: 3px; left: 4px; top: 16px; bottom: 16px; right: auto; height: auto; }

    .drop-placeholder {
      background: rgba(255,255,255,0.06);
      border: 2px dashed rgba(255,255,255,0.25);
      border-radius: 8px;
      pointer-events: none;
      view-transition-name: none;
    }

    .item[data-color="1"] { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .item[data-color="2"] { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .item[data-color="3"] { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    .item[data-color="4"] { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
    .item[data-color="5"] { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
    .item[data-color="6"] { background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); color: #333; }

    ::view-transition-group(*) {
      animation-duration: 200ms;
      animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }
    ::view-transition-old(*) { animation: none; opacity: 0; }
    ::view-transition-new(*) { animation: none; }
    ::view-transition-old(dragging), ::view-transition-new(dragging), ::view-transition-group(dragging) { animation: none; }
    ::view-transition-old(resizing), ::view-transition-new(resizing), ::view-transition-group(resizing) { animation: none; }

    /* Stats bar */
    .stats {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      font-size: 0.75rem;
      color: #666;
    }
    .stats span { color: #4facfe; font-variant-numeric: tabular-nums; }

    /* Controls */
    .controls {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .controls button {
      padding: 6px 14px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      color: #ccc;
      font-size: 0.75rem;
      cursor: pointer;
      font-family: inherit;
    }
    .controls button:hover { background: rgba(255,255,255,0.12); }

    /* Tab description */
    .tab-desc {
      font-size: 0.8rem;
      color: #888;
      margin-bottom: 16px;
      max-width: 560px;
      line-height: 1.5;
    }
    .tab-desc code {
      background: rgba(255,255,255,0.06);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.7rem;
      color: #a0a0a0;
    }
  </style>
</head>
<body
  data-signals='{ "dragItem": "", "col": 0, "row": 0, "colspan": 0, "rowspan": 0, "layout": "", "layoutCSS": "", "saved": false, "savedAt": "" }'
  data-init="@get('/${tab}')"
>

  <h1>Datastar + EG Grid</h1>
  <p class="subtitle">Three server integration patterns. Drag to compare.</p>

  <nav class="tabs">
    <a class="tab-link${tab === "morph" ? " active" : ""}" href="/morph">1. Element Morph</a>
    <a class="tab-link${tab === "server" ? " active" : ""}" href="/server">2. Signal CSS</a>
    <a class="tab-link${tab === "client" ? " active" : ""}" href="/client">3. Client Algorithm</a>
  </nav>

  ${tab === "morph" ? `
  <p class="tab-desc">
    No client algorithm. Every drag/resize POSTs to server (fire-and-forget).
    Server runs push algorithm, broadcasts <code>datastar-patch-elements</code> SSE event
    containing a <code>&lt;style&gt;</code> element. Datastar morphs it into the DOM &rarr; grid repositions.
  </p>

  <style id="morph-layout">${initialCSS}</style>
  <eg-grid id="grid-morph" columns="4" cell-size="120" gap="8"
    algorithm="none" resize-handles="all" placeholder-class="drop-placeholder"
    data-on:egg-drag-move__throttle.16ms="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/drag-move')
    "
    data-on:egg-drag-end="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/drag-end')
    "
    data-on:egg-resize-end="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/resize-end')
    "
  >
${itemsHTML}
  </eg-grid>

  <div class="controls">
    <button data-on:click="@post('/api/reset')">Reset Layout</button>
  </div>
  ` : tab === "server" ? `
  <p class="tab-desc">
    No client algorithm. Every drag/resize POSTs to server (fire-and-forget).
    Server runs push algorithm, broadcasts <code>layoutCSS</code> via SSE.
    <code>data-effect</code> writes CSS to a <code>&lt;style&gt;</code> &rarr; grid repositions.
  </p>

  <div data-effect="$layoutCSS &amp;&amp; (document.startViewTransition ? document.startViewTransition(() => document.getElementById('server-layout').textContent = $layoutCSS) : document.getElementById('server-layout').textContent = $layoutCSS)"></div>
  <style id="server-layout">${initialCSS}</style>
  <eg-grid id="grid-server" columns="4" cell-size="120" gap="8"
    algorithm="none" resize-handles="all" placeholder-class="drop-placeholder"
    data-on:egg-drag-move__throttle.16ms="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/drag-move')
    "
    data-on:egg-drag-end="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/drag-end')
    "
    data-on:egg-resize-end="
      $dragItem = evt.detail.item.dataset.eggItem;
      $col = evt.detail.cell.column; $row = evt.detail.cell.row;
      $colspan = evt.detail.colspan; $rowspan = evt.detail.rowspan;
      @post('/api/resize-end')
    "
  >
${itemsHTML}
  </eg-grid>

  <div class="controls">
    <button data-on:click="@post('/api/reset')">Reset Layout</button>
  </div>
  ` : `
  <p class="tab-desc">
    Client-side push algorithm runs normally. <code>egg-layout-change</code> fires on settled layouts.
    Datastar POSTs layout to server for persistence (fire-and-forget). Refresh shows persisted layout.
  </p>

  <style id="client-layout">${initialCSS}</style>
  <eg-grid id="grid-client" columns="4" cell-size="120" gap="8"
    algorithm="push" resize-handles="all" placeholder-class="drop-placeholder"
    data-on:egg-layout-change="
      $layout = JSON.stringify(evt.detail.items);
      @post('/api/save')
    "
  >
${itemsHTML}
  </eg-grid>

  <div class="stats">
    Saved: <span data-text="$saved ? $savedAt : 'no'">no</span>
  </div>
  <div class="controls">
    <button data-on:click="@post('/api/reset')">Reset Layout</button>
  </div>
  `}
</body>
</html>`;
}
