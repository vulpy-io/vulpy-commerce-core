import fs from "node:fs";

export function upsertEnvVar(filePath: string, key: string, value: string): void {
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}${content ? "\n" : ""}${line}\n`;

  fs.writeFileSync(filePath, next);
}
