import path from "node:path";

const sensitiveExactNames = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".yarnrc",
  ".yarnrc.yml",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa"
]);

const sensitiveExtensions = new Set([".key", ".pem", ".p12", ".pfx"]);

export function isSensitiveSourcePath(filePath: string): boolean {
  const normalizedPath = filePath.split(path.sep).join("/");
  const segments = normalizedPath.split("/").filter(Boolean);
  const basename = segments.at(-1)?.toLowerCase() ?? "";

  if (!basename) {
    return false;
  }

  if (sensitiveExactNames.has(basename) || basename.startsWith(".env.")) {
    return true;
  }

  if (sensitiveExtensions.has(path.extname(basename).toLowerCase())) {
    return true;
  }

  return segments.some((segment, index) => {
    const normalizedSegment = segment.toLowerCase();
    return (
      (normalizedSegment === ".aws" && segments[index + 1]?.toLowerCase() === "credentials") ||
      (normalizedSegment === ".ssh" && sensitiveExactNames.has(basename))
    );
  });
}
