const BLOCKED = ["admin", "시발", "씨발", "fuck", "shit"];

export function isNicknameAllowed(nickname: string) {
  const n = nickname.trim().toLowerCase();
  if (n.length < 2 || n.length > 16) return false;
  if (!/^[\p{L}\p{N}_]+$/u.test(nickname.trim())) return false;
  return !BLOCKED.some((w) => n.includes(w));
}
