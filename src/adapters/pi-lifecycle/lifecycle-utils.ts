export function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export function extractLatestUserText(messages: readonly { role: string; content?: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const c = msg.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) {
        return (c as any[])
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ");
      }
    }
  }
  return "";
}
