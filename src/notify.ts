export interface NotifyContext {
  hasUI?: boolean;
  ui?: { notify?: (msg: string, level: "info" | "warning" | "error") => void };
}

const notified = new WeakMap<object, boolean>();

export function notifyOnce(ctx: unknown, message: string, level: "info" | "warning" | "error" = "error"): void {
  const ctxObj = typeof ctx === "object" && ctx !== null ? ctx : null;
  if (!ctxObj || notified.get(ctxObj)) return;

  const ext = ctxObj as unknown as NotifyContext;
  if (!ext.hasUI || !ext.ui?.notify) return;

  notified.set(ctxObj, true);
  ext.ui.notify(message, level);
}
