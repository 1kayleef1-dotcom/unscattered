/**
 * Statistics used by experiments and the learning model. Kept explicit and
 * small so every number the system reports can be traced.
 */

/** Standard normal CDF via the Abramowitz–Stegun 7.1.26 approximation of erf. */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0]
  const p = successes / n
  const denom = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)]
}

/** Two-sided two-proportion z-test. */
export function twoProportionTest(sa: number, na: number, sb: number, nb: number): { z: number; pValue: number } {
  if (na === 0 || nb === 0) return { z: 0, pValue: 1 }
  const pa = sa / na
  const pb = sb / nb
  const pooled = (sa + sb) / (na + nb)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / na + 1 / nb))
  if (se === 0) return { z: 0, pValue: 1 }
  const z = (pb - pa) / se
  return { z, pValue: 2 * (1 - normalCdf(Math.abs(z))) }
}

export interface BetaPosterior {
  alpha: number
  beta: number
}

export function betaPosterior(successes: number, n: number, prior: BetaPosterior = { alpha: 1, beta: 1 }): BetaPosterior {
  return { alpha: prior.alpha + successes, beta: prior.beta + Math.max(0, n - successes) }
}

export function betaMean(p: BetaPosterior): number {
  return p.alpha / (p.alpha + p.beta)
}

export function betaVariance(p: BetaPosterior): number {
  const s = p.alpha + p.beta
  return (p.alpha * p.beta) / (s * s * (s + 1))
}

/** Normal-approximation credible interval for a Beta posterior. */
export function betaInterval(p: BetaPosterior, z = 1.96): [number, number] {
  const m = betaMean(p)
  const sd = Math.sqrt(betaVariance(p))
  return [Math.max(0, m - z * sd), Math.min(1, m + z * sd)]
}

/** P(X_b > X_a) for two Beta posteriors, via normal approximation. */
export function probabilityBBeatsA(a: BetaPosterior, b: BetaPosterior): number {
  const diff = betaMean(b) - betaMean(a)
  const sd = Math.sqrt(betaVariance(a) + betaVariance(b))
  if (sd === 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5
  return normalCdf(diff / sd)
}

/**
 * Sample size per variant for a two-proportion test
 * (two-sided alpha = 0.05, power = 0.8).
 */
export function sampleSizePerVariant(baselineRate: number, relativeMde: number): number {
  const p1 = Math.min(0.99, Math.max(0.0001, baselineRate))
  const p2 = Math.min(0.99, p1 * (1 + relativeMde))
  const zAlpha = 1.96
  const zBeta = 0.8416
  const pBar = (p1 + p2) / 2
  const numerator =
    zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
  const delta = Math.abs(p2 - p1)
  if (delta === 0) return Number.POSITIVE_INFINITY
  return Math.ceil((numerator * numerator) / (delta * delta))
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}

export function signedPct(x: number, digits = 0): string {
  const v = (x * 100).toFixed(digits)
  return `${x >= 0 ? '+' : ''}${v}%`
}
