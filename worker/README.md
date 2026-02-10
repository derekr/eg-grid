# Datastar + EG Grid Worker

Cloudflare Worker demo showing three server integration patterns for drag-and-drop grid layout. Uses Durable Objects with SQLite for per-session persistence and SSE for real-time updates.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      BROWSER (Tab)                            │
│                                                               │
│  ┌───────────────┐    ┌──────────┐    ┌────────────────────┐  │
│  │  <eg-grid>    │───>│ Datastar │───>│  SSE EventSource   │  │
│  │  web component│<── │ reactive │<───│  (long-lived GET)  │  │
│  └───────────────┘    └──────────┘    └────────────────────┘  │
│         │                │                     ^              │
│         │ egg-drag-move  │ @post (fire+forget) │ SSE events   │
│         │ egg-drag-end   │ returns 204         │              │
│         │ egg-resize-end │                     │              │
│         v                v                     │              │
└─────────────────────┬─────────────────────┬────┘
                      │  POST /api/*        │  GET /{tab}
                      │  (writes)           │  Accept: text/event-stream
                      │                     │  (reads)
══════════════════════╪═════════════════════╪══════════════════
         CLOUDFLARE   │                     │
                      v                     │
              ┌──────────────┐              │
              │    Worker    │<─────────────┘
              │   (router)   │
              └──────┬───────┘
                     │ stub.fetch() / RPC
                     v
              ┌───────────────────────────────────┐
              │     GridSession Durable Object    │
              │                                   │
              │  ┌───────────┐  ┌──────────────┐  │
              │  │  SQLite   │  │ SSE Writers  │  │
              │  │  (items)  │  │ Set<{writer, │  │
              │  │           │  │       tab}>  │  │
              │  └───────────┘  └──────────────┘  │
              └───────────────────────────────────┘
```

## CQRS: Reads and Writes are Separate Paths

### Reads (SSE — long-lived)

```
  Browser                    Worker                  Durable Object
    │                          │                          │
    │  GET /morph              │                          │
    │  Accept: text/event-     │                          │
    │    stream                │                          │
    │─────────────────────────>│                          │
    │                          │  stub.fetch(             │
    │                          │    /stream?tab=morph)    │
    │                          │─────────────────────────>│
    │                          │                          │
    │                          │   TransformStream pair   │
    │                          │   writer stored in Set   │
    │                          │   readable returned as   │
    │                          │     Response body        │
    │                          │<─────────────────────────│
    │  HTTP 200                │                          │
    │  Content-Type:           │                          │
    │    text/event-stream     │                          │
    │<─────────────────────────│                          │
    │                          │                          │
    │  event: datastar-patch-  │     (initial layout      │
    │    elements              │      from SQLite)        │
    │  data: ...               │                          │
    │< ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                          │                          │
    │   connection stays open, events pushed on changes   │
```

The same route serves both HTML pages and SSE connections, differentiated by the `Accept: text/event-stream` header. Datastar's `data-init="@get('/morph')"` establishes the SSE connection automatically.

### Writes (POST — fire-and-forget)

```
  Browser                    Worker                  Durable Object
    │                          │                          │
    │  POST /api/drag-end      │                          │
    │  { dragItem: "item-b",   │                          │
    │    col: 2, row: 3 }      │                          │
    │─────────────────────────>│                          │
    │                          │  session.applyMove(      │
    │                          │    "item-b", 2, 3, true) │
    │                          │─────────────────────────>│
    │                          │                          │
    │                          │    1. Read layout from   │
    │  204 No Content          │       SQLite             │
    │<─────────────────────────│    2. Run push algorithm │
    │                          │    3. Persist to SQLite  │
    │  (browser done,          │    4. broadcastLayout()  │
    │   doesn't wait)          │       to ALL SSE writers │
    │                          │                          │
    │  event: datastar-patch-  │                          │
    │    elements              │                          │
    │  data: <style>...</style>│                          │
    │< ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                          │                          │
    │  Datastar morphs <style> │                          │
    │  into DOM -> grid        │                          │
    │  repositions via CSS     │                          │
```

POST returns 204 immediately (fire-and-forget). The browser doesn't wait for the layout result. The DO processes the move, then pushes the result through the already-open SSE connection. This decouples the write acknowledgment from the read update.

## Persistence (SQLite in Durable Object)

```
GridSession DO
┌─────────────────────────────────────────────┐
│                                             │
│  SQLite: items table                        │
│  ┌────────┬─────┬─────┬───────┬──────────┐  │
│  │ id     │ col │ row │ width │ height   │  │
│  ├────────┼─────┼─────┼───────┼──────────┤  │
│  │ item-a │  1  │  1  │   2   │    1     │  │
│  │ item-b │  3  │  1  │   1   │    1     │  │
│  │ item-c │  4  │  1  │   1   │    1     │  │
│  │  ...   │     │     │       │          │  │
│  └────────┴─────┴─────┴───────┴──────────┘  │
│                                             │
│  Persistence rules:                         │
│                                             │
│  drag-move  -> algorithm + broadcast (NO persist)
│  drag-end   -> algorithm + broadcast + persist
│  resize-end -> algorithm + broadcast + persist
│  reset      -> DELETE ALL + re-seed + broadcast
│  save       -> bulk persist (client tab)    │
│                                             │
└─────────────────────────────────────────────┘
```

On page load or refresh, the worker reads layout from SQLite, renders HTML with that layout baked in, and the SSE connection sends the layout as its first event. The grid picks up where you left off.

## Three Tabs: Same Backend, Different Transports

```
Tab 1: MORPH                Tab 2: SIGNALS              Tab 3: CLIENT
(patchElements)             (patchSignals)              (client algorithm)

Server -> SSE event:        Server -> SSE event:        Client runs push
  datastar-patch-elements     datastar-patch-signals      algorithm locally
  <style id="morph-layout">  { layoutCSS: "..." }
  #grid-morph [item] {                                  egg-layout-change
    grid-column: ...        data-effect writes            event fires ->
  }                         $layoutCSS into               Datastar @post
  </style>                  <style id="server-layout">    to /api/save

Datastar morphs the        Datastar updates signal,    Server just persists,
<style> element into DOM    JS writes CSS to DOM        doesn't run algorithm

  ┌─────────┐                 ┌─────────┐                ┌─────────┐
  │ Server  │ layout          │ Server  │ layout          │ Client  │ layout
  │ computes│ ────────>       │ computes│ ────────>       │ computes│ ────────>
  │ + sends │ CSS as HTML     │ + sends │ CSS as signal   │ + sends │ JSON to
  │ CSS     │                 │ CSS     │                 │ result  │ server
  └─────────┘                 └─────────┘                 └─────────┘
```

## Session Isolation + Cross-Tab Sync

```
Browser A (cookie: abc-123)
  ├── Tab 1: /morph  ──┐
  ├── Tab 2: /server ──┼──> GridSession DO (abc-123)
  └── Tab 3: /client ──┘    Own SQLite DB + SSE writer per tab
                             Drag in any tab -> all tabs update

Browser B (cookie: xyz-789)
  └── Tab 1: /morph  ──────> GridSession DO (xyz-789)
                             Completely isolated layout
```

A session cookie (`egg-session`) is set on first page load via `Set-Cookie` with a `crypto.randomUUID()`. All subsequent requests (SSE connections, POSTs) include the cookie, routing to the same Durable Object.

**Cross-tab broadcasting:** Each SSE connection registers a writer tagged with its tab type (`morph`, `server`, or `client`). When any tab triggers a layout change (drag, resize, reset), the DO runs the algorithm once and broadcasts to ALL writers in the session — each getting its own event format:

```
Tab 1 (morph)  <── datastar-patch-elements (<style> morph)
Tab 2 (server) <── datastar-patch-signals  ({ layoutCSS })
Tab 3 (client) <── (no event, client manages own layout)
```

Different browsers or incognito windows get different cookies, creating separate DOs with fully isolated persistence.

## Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/morph` | GET | HTML page (or SSE if `Accept: text/event-stream`) |
| `/server` | GET | HTML page (or SSE) |
| `/client` | GET | HTML page (or SSE) |
| `/api/drag-move` | POST | Run algorithm, broadcast (no persist) |
| `/api/drag-end` | POST | Run algorithm, broadcast + persist |
| `/api/resize-end` | POST | Run algorithm, broadcast + persist |
| `/api/save` | POST | Persist layout from client algorithm |
| `/api/reset` | POST | Reset to default layout |

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Router, session cookie, CQRS dispatch |
| `src/session.ts` | GridSession Durable Object (SQLite + SSE) |
| `src/algorithm.ts` | Pure push-down layout algorithm |
| `src/page.ts` | HTML template (3 tabs, Datastar bindings) |
| `src/sse.ts` | Datastar SSE event formatters |

## Development

```bash
# Start Vite dev server (serves eg-grid bundle)
cd .. && pnpx vite .

# Start worker (in another terminal)
cd worker && pnpm dev
```

## Deploy

```bash
cd worker && npx wrangler deploy
```
