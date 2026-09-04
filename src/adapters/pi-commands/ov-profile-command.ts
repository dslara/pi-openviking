import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ProfileManager } from "../../domain/profile/ProfileManager";
import type { ProfileBehavior } from "../../domain/common/profile-config";

export function createOvProfileCommand(
  profileManager: ProfileManager,
  autoDetectRules: Record<string, string>,
  detectOverride?: (cwd: string, rules: Record<string, string>) => string | null,
) {
  const detectFn = detectOverride ?? undefined; // injected for testing

  return {
    description:
      "Manage OpenViking profiles. Usage: /ov-profile {show|list|apply <name>|detect}",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["show", "list", "detect"];
      const profiles = profileManager.list();
      const all = [
        ...subcommands,
        ...profiles.flatMap(p => [`apply ${p}`]),
      ];
      const filtered = all.filter(o => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map(v => ({ value: v, label: v })) : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[0];

      switch (subcommand) {
        case "show": {
          const active = profileManager.getActive();
          const behavior = profileManager.resolve(active);
          const lines = formatProfileDetail(active, behavior);
          ctx.ui.notify(lines.join("\n"), "info");
          return;
        }

        case "list": {
          const profiles = profileManager.list();
          const active = profileManager.getActive();
          const lines = profiles.map(p =>
            p === active ? `  ▶ ${p} (active)` : `    ${p}`,
          );
          ctx.ui.notify(lines.join("\n"), "info");
          return;
        }

        case "apply": {
          const name = parts[1];
          if (!name) {
            ctx.ui.notify("Usage: /ov-profile apply <name>", "warning");
            return;
          }
          try {
            profileManager.apply(name);
            ctx.ui.notify(`Applied profile: ${name}`, "info");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(msg, "warning");
          }
          return;
        }

        case "detect": {
          try {
            const { autoDetectProfile } = await import(
              "../../domain/profile/auto-detect"
            );
            const detected = detectFn
              ? detectFn(ctx.cwd, autoDetectRules)
              : autoDetectProfile(ctx.cwd, autoDetectRules);
            if (detected) {
              profileManager.apply(detected);
              ctx.ui.notify(`Detected profile: ${detected}`, "info");
            } else {
              ctx.ui.notify(
                `No match. Current: ${profileManager.getActive()}`,
                "info",
              );
            }
          } catch {
            ctx.ui.notify("Auto-detect not available", "warning");
          }
          return;
        }

        default:
          ctx.ui.notify(
            "Usage: /ov-profile {show|list|apply <name>|detect}",
            "warning",
          );
      }
    },
  };
}

function formatProfileDetail(
  name: string,
  behavior: ProfileBehavior,
): string[] {
  const lines: string[] = [];
  lines.push(`Profile: ${name}`);
  if (behavior.topN !== undefined) lines.push(`  topN: ${behavior.topN}`);
  if (behavior.scoreThreshold !== undefined)
    lines.push(`  threshold: ${behavior.scoreThreshold}`);
  if (behavior.searchMode !== undefined)
    lines.push(`  searchMode: ${behavior.searchMode}`);
  if (behavior.expandGraph !== undefined)
    lines.push(`  expandGraph: ${behavior.expandGraph}`);
  if (behavior.autoRecall !== undefined)
    lines.push(`  autoRecall: ${behavior.autoRecall}`);
  if (behavior.targetUri !== undefined)
    lines.push(`  targetUri: ${behavior.targetUri}`);
  return lines;
}
