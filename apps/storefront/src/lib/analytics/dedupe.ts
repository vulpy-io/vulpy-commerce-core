const sessionKeys = new Set<string>();
const persistentKeys = new Set<string>();

export function oncePerSession(key: string): boolean {
  if (sessionKeys.has(key)) {
    return false;
  }
  sessionKeys.add(key);
  return true;
}

export function oncePerKey(key: string): boolean {
  if (persistentKeys.has(key)) {
    return false;
  }
  persistentKeys.add(key);
  return true;
}

export function resetDedupeForTests(): void {
  sessionKeys.clear();
  persistentKeys.clear();
}
