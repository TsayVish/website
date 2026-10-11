export type Member = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
};

export const MEMBER_COLUMNS = "id, full_name, avatar_url, bio, location, website";

/** Keep only characters that are safe inside a PostgREST filter. */
export const cleanQuery = (q: string | undefined) =>
  (q ?? "").replace(/[^\p{L}\p{N}\s&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
