import crypto from "node:crypto";

/**
 * Băm mật khẩu bằng thuật toán scrypt (DEC-14, FR-97).
 * Định dạng lưu trữ: `<salt_hex>:<hash_hex>`
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Xác thực mật khẩu nhập vào với chuỗi băm đã lưu (chống timing attack).
 */
export function verifyPassword(password: string, combinedHash: string | null | undefined): boolean {
  if (!combinedHash || !combinedHash.includes(":")) return false;
  try {
    const [salt, key] = combinedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
