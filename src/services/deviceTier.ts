// Pure device classification behind the Cesium performance profile (see MapPerformance.ts).
// Split out so the heuristics are testable without a DOM.
//
// The defect this replaces: the old inline rule demoted anything with `cores <= 4` to the
// `low` profile (resolutionScale 0.75, maximumScreenSpaceError 2.0). iOS Safari reports
// navigator.hardwareConcurrency = 4 on iPhones — including current flagships — so every
// iPhone silently rendered at the low-end profile, which is what made satellite imagery look
// pixelated on a high-DPI screen. The surrounding comment already said iOS should "assume
// mid"; the code contradicted it.

export type DeviceTier = 'low' | 'mid' | 'high';

export interface DeviceSignals {
  userAgent: string;
  /** navigator.hardwareConcurrency; 0/undefined when unavailable. */
  cores?: number;
  /** navigator.deviceMemory in GB — Chromium-only, never present on iOS. */
  deviceMemory?: number;
}

const MOBILE_RE = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i;
const IOS_RE = /iPhone|iPad|iPod/i;

/** Apple caps hardwareConcurrency low on iOS, so core count says nothing about capability. */
const reportsUnreliableCoreCount = (userAgent: string): boolean => IOS_RE.test(userAgent);

export function classifyDeviceTier(signals: DeviceSignals): DeviceTier {
  const ua = signals.userAgent || '';
  if (!MOBILE_RE.test(ua)) return 'high';

  const { deviceMemory, cores } = signals;

  // Device Memory is the only signal that is both present and meaningful when it appears.
  if (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4) return 'low';

  // Core count is only trustworthy where the platform reports it honestly — i.e. not iOS.
  if (!reportsUnreliableCoreCount(ua) && typeof cores === 'number' && cores > 0 && cores <= 4) {
    return 'low';
  }

  return 'mid';
}
