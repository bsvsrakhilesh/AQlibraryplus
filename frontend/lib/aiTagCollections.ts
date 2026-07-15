export function preserveUniqueByKey<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = keyFor(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
