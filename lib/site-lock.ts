export const SITE_LOCK_COOKIE_NAME = "starcrossed_site_lock";
const SITE_LOCK_SALT = "starcrossed-site-lock-v1";

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = encodeUtf8(value);
  const digestInput = encoded as unknown as BufferSource;
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getSitePassword(): string | null {
  const password = process.env.SITE_PASSWORD?.trim();
  return password ? password : null;
}

export function isSiteLockEnabled(): boolean {
  return Boolean(getSitePassword());
}

export async function getSiteLockToken(): Promise<string | null> {
  const password = getSitePassword();

  if (!password) {
    return null;
  }

  return await sha256Hex(`${SITE_LOCK_SALT}:${password}`);
}

export function normalizeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  if (candidate.startsWith("/unlock") || candidate.startsWith("/api/unlock")) {
    return "/";
  }

  return candidate;
}
