export function safeNextPath(nextPath: string | null | undefined): string {
  if (
    !nextPath ||
    !nextPath.startsWith("/") ||
    nextPath.startsWith("//") ||
    nextPath.includes("\\") ||
    Array.from(nextPath).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    new URL(nextPath, "https://opswatch.invalid").pathname.startsWith("//")
  ) {
    return "/overview";
  }
  return nextPath;
}
