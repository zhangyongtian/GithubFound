import { NextRequest } from "next/server";
import { decodeSettingsHeader, type SettingsMap } from "./settingsShared";

let warnedEnvReadOnly = false;

export function applyReqSettings(request: NextRequest): SettingsMap {
  const header = request.headers?.get("x-gf-settings");
  const map = decodeSettingsHeader(header);
  const keys = Object.keys(map);
  if (keys.length === 0) return map;

  for (const k of keys) {
    const v = map[k as keyof SettingsMap];
    if (typeof v === "string" && v.length > 0) {
      try {
        (process.env as Record<string, string | undefined>)[k] = v;
      } catch {
        if (!warnedEnvReadOnly) {
          warnedEnvReadOnly = true;
          console.warn("[clientSettings] process.env is read-only in this runtime.");
        }
      }
    }
  }
  return map;
}
