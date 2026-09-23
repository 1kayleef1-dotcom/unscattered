let counter = 0
let seeded: (() => number) | null = null

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Short unique ids. Random by default; deterministic inside `withDeterministicIds`. */
export function newId(prefix: string): string {
  counter += 1
  const rand = (seeded ?? Math.random)().toString(36).slice(2, 7)
  return `${prefix}_${counter.toString(36)}${rand}`
}

/** Run `fn` with reproducible ids (used to build the demo workspace and in tests). */
export async function withDeterministicIds<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const prevCounter = counter
  const prevSeeded = seeded
  counter = 0
  seeded = mulberry32(seed)
  try {
    return await fn()
  } finally {
    // Continue past the seeded range so later random ids can never collide with seeded ones.
    counter = Math.max(prevCounter, counter) + 1000
    seeded = prevSeeded
  }
}

export function resetIds(): void {
  counter = 0
}
