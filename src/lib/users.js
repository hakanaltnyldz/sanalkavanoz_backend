import { AppError } from "./errors.js";

export const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

// Kullanici adi: 3-20 karakter, kucuk harf, rakam, alt cizgi ve nokta.
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

export function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function assertValidUsername(username) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(
      400,
      "Kullanici adi 3-20 karakter olmali; sadece harf, rakam, nokta ve alt cizgi icerebilir.",
    );
  }

  if (username.startsWith(".") || username.endsWith(".") || username.includes("..")) {
    throw new AppError(400, "Kullanici adi nokta ile baslayip bitemez.");
  }
}
