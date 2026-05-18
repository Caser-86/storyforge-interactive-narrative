import { createHash, createHmac } from "crypto";

function getTokenSalt(): string {
  const salt = process.env.TOKEN_SALT;

  if (
    process.env.NODE_ENV === "production" &&
    (!salt || salt === "change-this-in-production" || salt === "change-this-to-a-random-string-in-production")
  ) {
    throw new Error("TOKEN_SALT must be configured to a random production secret");
  }

  return salt || "narrative-game-default-salt";
}

export async function hashToken(token: string): Promise<string> {
  const salt = getTokenSalt();
  return createHash("sha256").update(token + salt).digest("hex");
}

export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  const hash = await hashToken(token);
  return hash === storedHash;
}

export function signStreamToken(sessionId: string, _ownerToken: string): string {
  const salt = getTokenSalt();
  const exp = Math.floor(Date.now() / 1000) + 120;
  const nonce = createHash("md5").update(`${sessionId}-${exp}-${Math.random()}`).digest("hex").slice(0, 8);
  const payload = `${sessionId}:${exp}:${nonce}`;
  const sig = createHmac("sha256", salt).update(payload).digest("hex").slice(0, 16);
  const tokenRaw = `${payload}:${sig}`;
  return Buffer.from(tokenRaw).toString("base64url");
}

export function verifyStreamToken(token: string, sessionId: string): { valid: boolean; reason?: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return { valid: false, reason: "Invalid token format" };

    const [tokenSessionId, expStr, nonce, sig] = parts;
    const exp = parseInt(expStr, 10);

    if (Date.now() / 1000 > exp) return { valid: false, reason: "Token expired" };
    if (tokenSessionId !== sessionId) return { valid: false, reason: "Session mismatch" };

    const salt = getTokenSalt();
    const payload = `${tokenSessionId}:${exp}:${nonce}`;
    const expectedSig = createHmac("sha256", salt).update(payload).digest("hex").slice(0, 16);

    if (sig !== expectedSig) return { valid: false, reason: "Invalid signature" };

    return { valid: true };
  } catch {
    return { valid: false, reason: "Token decode failed" };
  }
}
