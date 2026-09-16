import fs from "node:fs/promises";
import path from "node:path";
import type { Payload } from "payload";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const IMAGE_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const mediaIdCache = new Map<string, string | number>();
const LEADING_SLASH = /^\//;
const BACKSLASH = /\\/g;

export async function ensureMedia(
  payload: Payload,
  publicUrl: string,
  alt: string
): Promise<string | number | undefined> {
  if (!publicUrl.startsWith("/")) {
    return undefined;
  }

  const cached = mediaIdCache.get(publicUrl);
  if (cached) {
    return cached;
  }

  const filename = path.basename(publicUrl);
  const existing = await payload.find({
    collection: "media",
    where: { filename: { equals: filename } },
    limit: 1,
  });

  if (existing.docs.length) {
    const id = existing.docs[0].id;
    mediaIdCache.set(publicUrl, id);
    return id;
  }

  const filePath = path.join(process.cwd(), "public", publicUrl.replace(LEADING_SLASH, ""));

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const doc = await payload.create({
      collection: "media",
      data: { alt },
      file: {
        data,
        mimetype: MIME_TYPES[ext] || "application/octet-stream",
        name: filename,
        size: data.length,
      },
    });
    mediaIdCache.set(publicUrl, doc.id);
    return doc.id;
  } catch {
    console.warn(`[seed] Missing image file: ${publicUrl}`);
    return undefined;
  }
}

async function walkImages(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkImages(fullPath)));
      continue;
    }
    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function seedAllPublicImages(payload: Payload) {
  const imagesRoot = path.join(process.cwd(), "public", "images");
  const files = await walkImages(imagesRoot);
  let uploaded = 0;

  for (const filePath of files) {
    const relative = `/${path.relative(path.join(process.cwd(), "public"), filePath).replace(BACKSLASH, "/")}`;
    const id = await ensureMedia(payload, relative, path.basename(filePath));
    if (id) {
      uploaded += 1;
    }
  }

  console.log(`[seed] Uploaded ${uploaded} media file(s) from public/images`);
}
