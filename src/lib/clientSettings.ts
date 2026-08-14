"use client";

import {
  type SettingsKey,
  type SettingsMap,
  type ProviderKey,
  SETTINGS_FIELDS,
  PROVIDER_OPTIONS,
  encodeSettingsHeader,
  decodeSettingsHeader,
} from "./settingsShared";

export type { SettingsKey, SettingsMap, ProviderKey };
export { SETTINGS_FIELDS, PROVIDER_OPTIONS, encodeSettingsHeader, decodeSettingsHeader };

const STORAGE_KEY = "githubfound-settings:v1";

const isBrowser =
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined";

export function loadSettings(): SettingsMap {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SettingsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSettings(map: SettingsMap): void {
  if (!isBrowser) return;
  const cleaned: SettingsMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string" && v.length > 0) cleaned[k as SettingsKey] = v;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

export function clearSettings(): void {
  if (!isBrowser) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function attachSettingsHeaders(init?: RequestInit): RequestInit {
  const next: RequestInit = init ? { ...init } : {};
  const headers = new Headers((next.headers as HeadersInit) || {});
  const encoded = encodeSettingsHeader(loadSettings());
  if (encoded) headers.set("x-gf-settings", encoded);
  next.headers = headers;
  return next;
}
