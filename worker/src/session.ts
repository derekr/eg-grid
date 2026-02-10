/**
 * GridSession Durable Object — per-tab layout persistence via SQLite.
 * Holds long-lived SSE stream writers and broadcasts layout updates.
 */
import { DurableObject } from "cloudflare:workers";
import {
  calculateLayout,
  layoutToCSS,
  type ItemRect,
  type GridCell,
} from "./algorithm";

import { patchSignals, patchElements } from "./sse";

/** Scoped selectors give higher specificity than the web component's base layer */
const SERVER_SELECTOR = '#grid-server [data-egg-item="ID"]';
const MORPH_SELECTOR = '#grid-morph [data-egg-item="ID"]';

// Default 8-item layout matching web-component.html
const DEFAULT_ITEMS: ItemRect[] = [
  { id: "item-a", column: 1, row: 1, width: 2, height: 1 },
  { id: "item-b", column: 3, row: 1, width: 1, height: 1 },
  { id: "item-c", column: 4, row: 1, width: 1, height: 1 },
  { id: "item-d", column: 1, row: 2, width: 1, height: 2 },
  { id: "item-e", column: 2, row: 2, width: 2, height: 1 },
  { id: "item-f", column: 4, row: 2, width: 1, height: 1 },
  { id: "item-g", column: 2, row: 3, width: 1, height: 1 },
  { id: "item-h", column: 3, row: 3, width: 2, height: 1 },
];

const encoder = new TextEncoder();

type Tab = "morph" | "server" | "client";

interface StreamWriter {
  writer: WritableStreamDefaultWriter;
  tab: Tab;
}

export class GridSession extends DurableObject {
  private sql: SqlStorage;
  private streams = new Set<StreamWriter>();

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        col INTEGER NOT NULL,
        row INTEGER NOT NULL,
        width INTEGER NOT NULL DEFAULT 1,
        height INTEGER NOT NULL DEFAULT 1
      )
    `);
  }

  /**
   * fetch() handler for the SSE stream endpoint.
   * The worker calls stub.fetch() to open a long-lived SSE connection.
   * The DO holds the writable side and pushes events on layout changes.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const tab = (url.searchParams.get("tab") || "morph") as Tab;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const stream: StreamWriter = { writer, tab };
    this.streams.add(stream);

    // Clean up when the client disconnects
    writer.closed
      .then(() => this.streams.delete(stream))
      .catch(() => this.streams.delete(stream));

    // Send current layout as the first event (format depends on tab)
    const event = this.formatLayoutEvent(this.getLayout(), tab);
    if (event) writer.write(encoder.encode(event)).catch(() => {});

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  /** Format a layout SSE event for the given tab type. */
  private formatLayoutEvent(layout: ItemRect[], tab: Tab): string | null {
    switch (tab) {
      case "morph":
        return patchElements(
          `<style id="morph-layout">${layoutToCSS(layout, MORPH_SELECTOR)}</style>`,
          { selector: "#morph-layout", mode: "outer", useViewTransition: true },
        );
      case "server":
        return patchSignals({ layoutCSS: layoutToCSS(layout, SERVER_SELECTOR) });
      case "client":
        return null; // client tab manages layout locally
    }
  }

  /** Broadcast an SSE event to all connected streams. */
  private broadcast(event: string): void {
    const data = encoder.encode(event);
    for (const stream of this.streams) {
      stream.writer.write(data).catch(() => this.streams.delete(stream));
    }
  }

  /** Broadcast current layout to all connected clients (each gets its own format). */
  private broadcastLayout(layout: ItemRect[]): void {
    for (const stream of this.streams) {
      const event = this.formatLayoutEvent(layout, stream.tab);
      if (event) {
        stream.writer.write(encoder.encode(event)).catch(() => this.streams.delete(stream));
      }
    }
  }

  private seed(): void {
    for (const item of DEFAULT_ITEMS) {
      this.sql.exec(
        `INSERT OR REPLACE INTO items (id, col, row, width, height) VALUES (?, ?, ?, ?, ?)`,
        item.id,
        item.column,
        item.row,
        item.width,
        item.height,
      );
    }
  }

  getLayout(): ItemRect[] {
    const rows = this.sql.exec("SELECT id, col, row, width, height FROM items").toArray();
    if (rows.length === 0) {
      this.seed();
      return [...DEFAULT_ITEMS];
    }
    return rows.map((r) => ({
      id: r.id as string,
      column: r.col as number,
      row: r.row as number,
      width: r.width as number,
      height: r.height as number,
    }));
  }

  applyMove(itemId: string, targetCol: number, targetRow: number, persist: boolean): void {
    const items = this.getLayout();
    const target: GridCell = { column: targetCol, row: targetRow };
    const layout = calculateLayout(items, itemId, target);
    if (persist) this.persistLayout(layout);
    this.broadcastLayout(layout);
  }

  applyResize(
    itemId: string,
    col: number,
    row: number,
    width: number,
    height: number,
    persist: boolean,
  ): void {
    const items = this.getLayout();
    const resized = items.find((i) => i.id === itemId);
    if (resized) {
      resized.column = col;
      resized.row = row;
      resized.width = width;
      resized.height = height;
    }
    const target: GridCell = { column: col, row: row };
    const layout = calculateLayout(items, itemId, target);
    const item = layout.find((i) => i.id === itemId);
    if (item) {
      item.width = width;
      item.height = height;
    }
    if (persist) this.persistLayout(layout);
    this.broadcastLayout(layout);
  }

  saveLayout(items: ItemRect[]): void {
    this.persistLayout(items);
    this.broadcast(patchSignals({ saved: true, savedAt: new Date().toLocaleTimeString() }));
  }

  reset(): void {
    this.sql.exec("DELETE FROM items");
    this.seed();
    this.broadcastLayout([...DEFAULT_ITEMS]);
  }

  private persistLayout(items: ItemRect[]): void {
    for (const item of items) {
      this.sql.exec(
        `INSERT OR REPLACE INTO items (id, col, row, width, height) VALUES (?, ?, ?, ?, ?)`,
        item.id,
        item.column,
        item.row,
        item.width,
        item.height,
      );
    }
  }
}
