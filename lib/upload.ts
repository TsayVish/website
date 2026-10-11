import { createClient } from "@/lib/supabase/client";

type Bucket = "character-images" | "avatars";

const RULES: Record<Bucket, { types: string[]; maxBytes: number; formats: string; label: string }> = {
  "character-images": { types: ["image/png", "image/jpeg", "image/webp", "image/gif"], maxBytes: 5 * 1024 * 1024, formats: "PNG, JPG, WebP or GIF", label: "PNG, JPG, WebP or GIF, up to 5 MB" },
  avatars: { types: ["image/png", "image/jpeg", "image/webp"], maxBytes: 2 * 1024 * 1024, formats: "PNG, JPG or WebP", label: "PNG, JPG or WebP, up to 2 MB" },
};

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export const uploadRules = (bucket: Bucket) => RULES[bucket];

/** Returns an error sentence, or "" if the file can be uploaded to that bucket. */
export function checkImage(file: File, bucket: Bucket = "character-images") {
  const r = RULES[bucket];
  if (!r.types.includes(file.type)) return `Use a ${r.formats} image.`;
  if (file.size > r.maxBytes) return `That image is over ${r.maxBytes / 1024 / 1024} MB. Choose a smaller one.`;
  return "";
}

/** Uploads an image to Supabase Storage in the person's own folder and returns its public URL. */
export async function uploadImage(bucket: Bucket, file: File) {
  const problem = checkImage(file, bucket);
  if (problem) throw new Error(problem);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You’ve been logged out. Log in again to upload.");
  const path = `${user.id}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export const uploadCharacterImage = (file: File) => uploadImage("character-images", file);
