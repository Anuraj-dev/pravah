import type { ParsedArgs } from "./types";

/**
 * `--opt=value` is split into `opt` + `value` so it behaves the same as
 * `--opt value`. Without this, `--format=waybar` is read as a bare boolean flag
 * named `format=waybar` and the command reports an unknown option.
 */
export function normalizeEqualsOptions(
  options: Record<string, string | boolean>
): Record<string, string | boolean> {
  const normalized: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(options)) {
    const separator = key.indexOf("=");
    if (separator <= 0) {
      normalized[key] = value;
      continue;
    }
    // The `=value` half wins, including when it is empty, so `--opt=` is an
    // explicit empty value rather than a flag.
    normalized[key.slice(0, separator)] = key.slice(separator + 1);
  }
  return normalized;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  let endOfOptions = false;

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (endOfOptions || !part.startsWith("--")) {
      positionals.push(part);
      continue;
    }
    if (part === "--") {
      endOfOptions = true;
      continue;
    }

    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positionals, options: normalizeEqualsOptions(options) };
}

export function readOption(
  options: Record<string, string | boolean>,
  key: string
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(
  options: Record<string, string | boolean>,
  key: string
): boolean {
  return options[key] === true;
}
