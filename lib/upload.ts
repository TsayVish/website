import { createClient } from "@/lib/supabase/client";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns an error sentence, or "" if the file can be uploaded. */
export function checkImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) return "Use a PNG, JPG, WebP or GIF image.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is over 5 MB. Choose a smaller one.";
  return "";
}

/** Uploads a character picture to Supabase Storage and returns its public URL. */
export async function uploadCharacterImage(file: File) {
  const problem = checkImage(file);
  if (problem) throw new Error(problem);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You’ve been logged out. Log in again to upload.");
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[file.type];
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("character-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("character-images").getPublicUrl(path).data.publicUrl;
}
