/**
 * Datastar + EG Grid integration worker.
 *
 * Architecture (CQRS):
 *   GET  /           → HTML page
 *   GET  /api/stream → Long-lived SSE connection (reads)
 *   POST /api/*      → Fire-and-forget commands (writes)
 *
 * The Durable Object bridges POST commands to SSE streams:
 * POST → DO processes → DO broadcasts via stored stream writers → SSE clients
 */
import { renderPage } from "./page";
import { type ItemRect } from "./algorithm";
import { GridSession } from "./session";

export { GridSession };

interface Env {
  GRID_SESSION: DurableObjectNamespace<GridSession>;
}

const VITE_ORIGIN = "http://localhost:5176";
const COOKIE_NAME = "egg-session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/morph" || url.pathname === "/server" || url.pathname === "/client")) {
      const wantsSSE = request.headers.get("Accept")?.includes("text/event-stream");
      return wantsSSE ? handleStream(request, env, url.pathname) : handlePage(request, env, url.pathname);
    }

    if (url.pathname.startsWith("/api/") && request.method === "POST") {
      return handleCommand(request, env, url.pathname);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// --- Page ---

async function handlePage(request: Request, env: Env, pathname: string): Promise<Response> {
  let sessionId = getSessionId(request);
  const isNew = !sessionId;
  if (!sessionId) sessionId = crypto.randomUUID();

  // Redirect / to /morph
  if (pathname === "/") {
    return Response.redirect(new URL("/morph", request.url).toString(), 302);
  }

  const session = getSession(env, sessionId);
  const items = await session.getLayout();
  const tab = pathname === "/client" ? "client" : pathname === "/server" ? "server" : "morph";
  const html = renderPage(items, VITE_ORIGIN, tab);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
  });
  if (isNew) {
    headers.set(
      "Set-Cookie",
      `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    );
  }
  return new Response(html, { headers });
}

// --- SSE stream (long-lived read connection) ---

async function handleStream(request: Request, env: Env, pathname: string): Promise<Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return new Response("No session", { status: 401 });
  }

  const tab = pathname.replace("/", "") || "morph";
  const id = env.GRID_SESSION.idFromName(sessionId);
  const stub = env.GRID_SESSION.get(id);
  return stub.fetch(new Request(`http://do/stream?tab=${tab}`));
}

// --- POST commands (fire-and-forget writes) ---

async function handleCommand(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  try {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return new Response("No session", { status: 401 });
    }

    let signals: Record<string, unknown>;
    try {
      signals = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const session = getSession(env, sessionId);
    const dragItem = String(signals.dragItem || "");
    const col = Number(signals.col) || 1;
    const row = Number(signals.row) || 1;
    const colspan = Number(signals.colspan) || 1;
    const rowspan = Number(signals.rowspan) || 1;

    switch (pathname) {
      case "/api/drag-move":
        await session.applyMove(dragItem, col, row, false);
        break;
      case "/api/drag-end":
        await session.applyMove(dragItem, col, row, true);
        break;
      case "/api/resize-move":
        await session.applyResize(dragItem, col, row, colspan, rowspan, false);
        break;
      case "/api/resize-end":
        await session.applyResize(dragItem, col, row, colspan, rowspan, true);
        break;
      case "/api/save": {
        const rawLayout = signals.layout;
        let items: ItemRect[];
        try {
          items =
            typeof rawLayout === "string"
              ? JSON.parse(rawLayout)
              : (rawLayout as ItemRect[]);
        } catch {
          return new Response("Invalid layout", { status: 400 });
        }
        await session.saveLayout(items);
        break;
      }
      case "/api/reset":
        await session.reset();
        break;
      default:
        return new Response("Not Found", { status: 404 });
    }

    // Fire-and-forget: updates are pushed through SSE stream
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(`[API] Error:`, err);
    return new Response("Server error", { status: 500 });
  }
}

// --- Helpers ---

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function getSession(env: Env, sessionId: string): DurableObjectStub<GridSession> {
  const id = env.GRID_SESSION.idFromName(sessionId);
  return env.GRID_SESSION.get(id);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
