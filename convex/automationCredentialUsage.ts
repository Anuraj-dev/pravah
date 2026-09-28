export const CREDENTIAL_USAGE_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function credentialNeedsUsageWrite(lastUsedAt: number | undefined, now: number) {
  return lastUsedAt === undefined || now - lastUsedAt >= CREDENTIAL_USAGE_WRITE_INTERVAL_MS;
}
