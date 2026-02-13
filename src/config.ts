import * as p from "@clack/prompts";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".slopcannon");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// --- Schema-driven config ---
// To add a new config field:
// 1. Add its entry to SCHEMA (type, default, prompt label, options if select)
// That's it. Config type, loadConfig, saveConfig, and runConfig all derive from SCHEMA.

interface BooleanField {
  type: "boolean";
  default: boolean;
  label: string;
}

interface SelectField {
  type: "select";
  default: string;
  label: string;
  options: { value: string; label: string }[];
}

type FieldDef = BooleanField | SelectField;

const SCHEMA = {
  activationStyle: {
    type: "select" as const,
    default: "cannon",
    label: "Activation style",
    options: [
      { value: "cannon", label: "Cannon fire" },
      { value: "typewriter", label: "Typewriter" },
      { value: "off", label: "Off" },
    ],
  },
} satisfies Record<string, FieldDef>;

// Config type is derived from the schema
export type Config = {
  [K in keyof typeof SCHEMA]: (typeof SCHEMA)[K]["default"];
};

const KEYS = Object.keys(SCHEMA) as (keyof typeof SCHEMA)[];

function validateField<K extends keyof typeof SCHEMA>(
  key: K,
  value: unknown
): Config[K] {
  const def = SCHEMA[key];
  if (def.type === "boolean" && typeof value === "boolean") {
    return value as Config[K];
  }
  if (def.type === "select" && typeof value === "string") {
    if (def.options.some((o) => o.value === value)) {
      return value as Config[K];
    }
  }
  return def.default as Config[K];
}

export function loadConfig(): Config {
  let raw: Record<string, unknown> = {};
  try {
    raw = require(CONFIG_FILE);
  } catch {}

  const config = {} as Config;
  for (const key of KEYS) {
    config[key] = validateField(key, raw[key]);
  }
  return config;
}

async function saveConfig(config: Config): Promise<void> {
  const { mkdirSync } = await import("fs");
  mkdirSync(CONFIG_DIR, { recursive: true });
  const clean = {} as Record<string, unknown>;
  for (const key of KEYS) {
    clean[key] = config[key];
  }
  await Bun.write(CONFIG_FILE, JSON.stringify(clean, null, 2) + "\n");
}

export async function runConfig(): Promise<void> {
  const config = loadConfig();

  p.intro("slopcannon config");

  for (const key of KEYS) {
    const def = SCHEMA[key];
    if (def.type === "boolean") {
      const val = await p.confirm({
        message: def.label,
        initialValue: config[key] as boolean,
      });
      if (p.isCancel(val)) {
        p.outro("Cancelled.");
        return;
      }
      (config as any)[key] = val;
    } else if (def.type === "select") {
      const val = await p.select({
        message: def.label,
        options: def.options,
        initialValue: config[key] as string,
      });
      if (p.isCancel(val)) {
        p.outro("Cancelled.");
        return;
      }
      (config as any)[key] = val;
    }
  }

  await saveConfig(config);
  p.outro("Config saved to ~/.slopcannon/config.json");
}
