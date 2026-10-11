import { notFound } from "next/navigation";

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/** Server-side gate for /studio/admin pages. Non-staff get a plain 404. */
export async function requireStaff(supabase: Supa) {
  const { data } = await supabase.rpc("is_staff");
  if (data !== true) notFound();
}

export type StaffMember = { user_id: string; full_name: string | null; email: string; role: "admin" | "agent" };

export const ageLabel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
};

export const isOverdue = (due: string | null) => Boolean(due && due < new Date().toISOString().slice(0, 10));
