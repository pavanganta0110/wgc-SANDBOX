import crypto from "crypto";

const KEY_LENGTH = 64;

/**
 * scrypt-based password hashing (Node's built-in crypto — no extra
 * dependency needed). Stored format: "salt:hash", both hex.
 */
export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      const storedBuf = Buffer.from(hashHex, "hex");
      if (storedBuf.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(storedBuf, derivedKey));
    });
  });
}
