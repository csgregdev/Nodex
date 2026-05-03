import crypto from "node:crypto";

export async function fileHash(absolutePath: string): Promise<string> {
  const content = await Bun.file(absolutePath).arrayBuffer();
  return crypto
    .createHash("sha256")
    .update(Buffer.from(content))
    .digest("hex")
    .slice(0, 16);
}
