"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SavedCharacter, tint } from "./ProjectArt";
import { colorValue } from "@/lib/content";
import { CHARACTER_LISTING_CATEGORIES, SERVICE_LISTING_CATEGORIES } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";
import type { CharacterInfo, Listing } from "@/lib/types";

export type OwnCharacter = CharacterInfo & { id: string; name: string };

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Create a marketplace listing, or (with `initial`) edit one. */
export function ListingForm({
  characters, sellerName, defaultEmail, initial,
}: {
  characters: OwnCharacter[];
  sellerName: string;
  defaultEmail: string;
  initial?: Listing;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [type, setType] = useState<"character" | "service">(initial?.type ?? (characters.length ? "character" : "service"));
  const [projectId, setProjectId] = useState<string>(initial?.project_id ?? characters[0]?.id ?? "");
  const categories = type === "character" ? CHARACTER_LISTING_CATEGORIES : SERVICE_LISTING_CATEGORIES;
  const [picked, setPicked] = useState<string[]>(
    initial?.categories?.length ? initial.categories : initial?.category ? [initial.category] : [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = characters.find((c) => c.id === projectId);
  // Only keep choices that belong to the current listing type, in the order shown.
  const activeCategories = categories.filter((c) => picked.includes(c));
  const toggleCategory = (c: string) =>
    setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const title = String(d.get("title") ?? "").trim() || (type === "character" ? chosen?.name ?? "" : "");
    const summary = String(d.get("summary") ?? "").trim();
    const description = String(d.get("description") ?? "").trim();
    const price = String(d.get("price") ?? "").trim();
    const email = String(d.get("email") ?? "").trim();

    if (type === "character" && !chosen) return setError("Pick which of your characters to list.");
    if (!title) return setError("Give your listing a title.");
    if (activeCategories.length === 0) return setError(type === "character" ? "Choose at least one thing you’re offering." : "Choose at least one category.");
    if (email && !isEmail(email)) return setError("Enter a valid contact email, or leave it blank.");
    setError("");
    setBusy(true);

    const row = {
      type,
      title,
      summary: summary || null,
      description: description || null,
      category: activeCategories[0],
      categories: activeCategories,
      price: price || null,
      contact_email: email || null,
      seller_name: sellerName || null,
      project_id: type === "character" ? chosen!.id : null,
      character_info:
        type === "character" && chosen
          ? { name: chosen.name, kind: chosen.kind, color: chosen.color, personality: chosen.personality, image_url: chosen.image_url ?? null }
          : {},
    };

    try {
      const supabase = createClient();
      if (editing && initial) {
        const { error: err } = await supabase.from("listings").update(row).eq("id", initial.id);
        if (err) throw new Error(err.message);
        router.push(`/studio/marketplace/${initial.id}`);
      } else {
        const { data, error: err } = await supabase.from("listings").insert(row).select("id").single();
        if (err || !data) throw new Error(err?.message ?? "No listing was returned.");
        router.push(`/studio/marketplace/${(data as { id: string }).id}`);
      }
      router.refresh();
    } catch (err) {
      setError(`Couldn’t save the listing: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <form className="st-form" onSubmit={onSubmit} noValidate>
      <div className="panel">
        {!editing && (
          <div className="field">
            <span className="lbl" id="lblType">What are you listing?</span>
            <div className="chips" role="group" aria-labelledby="lblType">
              <button type="button" className="chip" aria-pressed={type === "character"} onClick={() => setType("character")}>A character</button>
              <button type="button" className="chip" aria-pressed={type === "service"} onClick={() => setType("service")}>A service</button>
            </div>
          </div>
        )}

        {type === "character" && (
          <div className="field">
            <span className="lbl" id="lblChar">Which character?</span>
            {characters.length === 0 ? (
              <p className="st-muted">
                You don’t have any originals yet. <Link href="/studio/new/original">Create one</Link> first, then list it here.
              </p>
            ) : (
              <div className="st-castpick" role="group" aria-labelledby="lblChar">
                {characters.map((c) => (
                  <button key={c.id} type="button" className="st-castopt" aria-pressed={projectId === c.id} onClick={() => setProjectId(c.id)}>
                    <span className="st-castopt-pic" style={{ background: tint(colorValue(c.color)) }}>
                      <SavedCharacter info={c} fallbackName={c.name} />
                    </span>
                    <span className="st-castopt-text"><b>{c.name}</b><small>{c.personality}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <span className="lbl" id="lblCat">
            {type === "character" ? "What are you offering?" : "Categories"} <span className="opt-hint">(choose all that apply)</span>
          </span>
          <div className="chips" role="group" aria-labelledby="lblCat">
            {categories.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={picked.includes(c)} onClick={() => toggleCategory(c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="field">
          <label htmlFor="lf-title">Title</label>
          <input
            className="st-input" id="lf-title" name="title" maxLength={80}
            defaultValue={initial?.title ?? ""}
            placeholder={type === "character" ? chosen?.name ?? "Character name" : "e.g. Plush prototyping, 2-week turnaround"}
          />
        </div>
        <div className="field">
          <label htmlFor="lf-summary">One-line summary <span className="opt-hint">(optional)</span></label>
          <input className="st-input" id="lf-summary" name="summary" maxLength={160} defaultValue={initial?.summary ?? ""} placeholder="Shown on the listing card" />
        </div>
        <div className="field">
          <label htmlFor="lf-desc">Description <span className="opt-hint">(optional)</span></label>
          <textarea className="st-input" id="lf-desc" name="description" rows={6} maxLength={3000} defaultValue={initial?.description ?? ""}
            placeholder={type === "character" ? "Audience, what you’re open to, any limits on use." : "What you do, past work, how you like to work."} />
        </div>
        <div className="st-fields">
          <div className="field">
            <label htmlFor="lf-price">Price <span className="opt-hint">(optional)</span></label>
            <input className="st-input" id="lf-price" name="price" maxLength={60} defaultValue={initial?.price ?? ""} placeholder="From $500 · Rev share · Ask" />
          </div>
          <div className="field">
            <label htmlFor="lf-email">Contact email <span className="opt-hint">(optional)</span></label>
            <input className="st-input" id="lf-email" name="email" type="email" maxLength={120} defaultValue={initial ? initial.contact_email ?? "" : defaultEmail} />
          </div>
        </div>
        <small className="st-help">Your listing and contact email are visible to everyone signed in to tsayvish.</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="launch">
          <button className="btn" type="submit" disabled={busy || (type === "character" && characters.length === 0)}>
            {busy ? "Saving…" : editing ? "Save changes" : "Publish listing"}
          </button>
        </div>
      </div>
    </form>
  );
}
