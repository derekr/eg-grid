/**
 * Datastar SSE event formatters.
 *
 * These produce SSE event strings that get pushed through the long-lived
 * stream connection. Datastar parses them on the client.
 *
 * Reference: https://data-star.dev/reference/sse_events
 */

/** Format a datastar-patch-signals SSE event. */
export function patchSignals(
  signals: Record<string, unknown>,
  opts?: { onlyIfMissing?: boolean },
): string {
  const lines = [`event: datastar-patch-signals`];
  if (opts?.onlyIfMissing) lines.push(`data: onlyIfMissing true`);
  lines.push(`data: signals ${JSON.stringify(signals)}`);
  return lines.join("\n") + "\n\n";
}

/** Format a datastar-patch-elements SSE event. */
export function patchElements(
  html: string,
  opts?: {
    selector?: string;
    mode?: "outer" | "inner" | "replace" | "prepend" | "append" | "before" | "after" | "remove";
    useViewTransition?: boolean;
  },
): string {
  const lines = [`event: datastar-patch-elements`];
  if (opts?.selector) lines.push(`data: selector ${opts.selector}`);
  if (opts?.mode) lines.push(`data: mode ${opts.mode}`);
  if (opts?.useViewTransition) lines.push(`data: useViewTransition true`);
  const oneLine = html.replace(/\n\s*/g, "");
  lines.push(`data: elements ${oneLine}`);
  return lines.join("\n") + "\n\n";
}
