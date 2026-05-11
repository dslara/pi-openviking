import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEBUG = process.env.OV_DEBUG !== "false" && process.env.OV_DEBUG !== "0";

const LOG_FILE = process.env.OV_LOG_FILE ?? join(homedir(), ".pi", "agent", "pi-openviking.log");

function format(args: unknown[]): string {
  return args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
}

function write(level: string, args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] [ov] ${format(args)}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore log write failures — don't crash the extension
  }
}

export const logger = {
  debug(...args: unknown[]) {
    if (!DEBUG) return;
    write("DEBUG", args);
  },

  error(...args: unknown[]) {
    write("ERROR", args);
  },
};
