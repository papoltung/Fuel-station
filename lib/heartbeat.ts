/**
 * Dead-man monitor heartbeat integration (e.g. Healthchecks.io).
 *
 * Security invariant:
 * - Ping URL is treated as a secret and NEVER logged or printed.
 * - Only the signal action (START, SUCCESS, FAIL) and HTTP status are logged.
 * - Network failures to the heartbeat monitor never crash the core backup pipeline.
 */

export type HeartbeatAction = "start" | "success" | "fail";

export interface SendHeartbeatOptions {
  pingUrl?: string;
  message?: string;
  timeoutMs?: number;
}

export async function sendDeadManSignal(
  action: HeartbeatAction,
  optionsOrMessage: SendHeartbeatOptions | string = {}
): Promise<boolean> {
  const options: SendHeartbeatOptions =
    typeof optionsOrMessage === "string" ? { message: optionsOrMessage } : optionsOrMessage;
  const rawUrl = options.pingUrl ?? process.env.BACKUP_HEALTHCHECK_URL;
  if (!rawUrl || rawUrl.trim() === "") {
    return false;
  }

  const timeoutMs = options.timeoutMs ?? 5000;
  const baseUrl = rawUrl.trim().replace(/\/+$/, "");

  let targetUrl = baseUrl;
  if (action === "start") {
    targetUrl = `${baseUrl}/start`;
  } else if (action === "fail") {
    targetUrl = `${baseUrl}/fail`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body = options.message ? options.message.slice(0, 1000) : undefined;
    const res = await fetch(targetUrl, {
      method: body ? "POST" : "GET",
      body,
      headers: body ? { "Content-Type": "text/plain" } : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      console.log(`[heartbeat] Dead-man monitor received signal: ${action.toUpperCase()}`);
      return true;
    } else {
      console.warn(`[heartbeat] Dead-man monitor responded with HTTP ${res.status} for signal: ${action.toUpperCase()}`);
      return false;
    }
  } catch (err: unknown) {
    console.warn(`[heartbeat] Failed to send ${action.toUpperCase()} signal to dead-man monitor: ${(err as Error).message}`);
    return false;
  }
}
