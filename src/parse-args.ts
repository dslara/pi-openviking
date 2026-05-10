export interface ParsedArgs {
  flags: Record<string, string | undefined>;
  positional: string[];
}

export function parseArgs(raw: string, booleanFlags?: Set<string>): ParsedArgs {
  const flags: Record<string, string | undefined> = {};
  const positional: string[] = [];
  const tokens = raw.trim().split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const isBoolean = booleanFlags?.has(name) ?? false;
      const next = tokens[i + 1];
      if (!isBoolean && next && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = undefined;
      }
    } else {
      positional.push(token);
    }
  }

  return { flags, positional };
}
