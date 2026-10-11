"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Post } from "@/lib/hub";

/** Write, save as draft, publish, unpublish or delete a post. */
export function PostEditor({ initial, projects }: { initial?: Post; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [visibility, setVisibility] = useState<Post["visibility"]>(initial?.visibility ?? "public");
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [busy, setBusy] = useState<"" | "draft" | "publish" | "delete">("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const isPublished = initial?.status === "published";

  async function save(status: Post["status"]) {
    if (!title.trim()) {
      setError("Give your post a title.");
      document.getElementById("pe-title")?.focus();
      return;
    }
    setError("");
    setBusy(status === "draft" ? "draft" : "publish");
    const supabase = createClient();
    const row = { title: title.trim(), body, visibility, status, project_id: projectId || null };
    const { error: err } = initial
      ? await supabase.from("posts").update(row).eq("id", initial.id)
      : await supabase.from("posts").insert(row);
    if (err) {
      setBusy("");
      return setError(`Couldn’t save: ${err.message}`);
    }
    router.push(status === "draft" ? "/studio/hub/library?tab=drafts" : "/studio/hub/library");
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    setBusy("delete");
    const { error: err } = await createClient().from("posts").delete().eq("id", initial.id);
    if (err) {
      setBusy("");
      return setError(`Couldn’t delete: ${err.message}`);
    }
    router.push("/studio/hub/library");
    router.refresh();
  }

  return (
    <div className="pe">
      <div className="panel pe-main">
        <label htmlFor="pe-title" className="visually-hidden">Title</label>
        <input id="pe-title" className="pe-title" placeholder="Title" maxLength={140} value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} />
        <label htmlFor="pe-body" className="visually-hidden">Post</label>
        <textarea id="pe-body" className="pe-body" placeholder="Write your post…" maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
        <small className="st-help">{body.length.toLocaleString()} / 20,000</small>
      </div>

      <aside className="panel pe-side">
        <div className="field">
          <span className="lbl" id="pe-vis">Who can see this</span>
          <div className="chips" role="radiogroup" aria-labelledby="pe-vis">
            <button type="button" role="radio" aria-checked={visibility === "public"} aria-pressed={visibility === "public"} className="chip" onClick={() => setVisibility("public")}>Everyone</button>
            <button type="button" role="radio" aria-checked={visibility === "followers"} aria-pressed={visibility === "followers"} className="chip" onClick={() => setVisibility("followers")}>Followers only</button>
          </div>
        </div>
        {projects.length > 0 && (
          <div className="field">
            <label htmlFor="pe-project">About a project <span className="opt-hint">(optional)</span></label>
            <select id="pe-project" className="st-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pe-actions">
          <button type="button" className="btn" disabled={busy !== ""} onClick={() => save("published")}>
            {busy === "publish" ? "Publishing…" : isPublished ? "Update post" : "Publish"}
          </button>
          <button type="button" className="btn ghost" disabled={busy !== ""} onClick={() => save("draft")}>
            {busy === "draft" ? "Saving…" : isPublished ? "Unpublish to drafts" : "Save draft"}
          </button>
          {isPublished && initial && <Link className="st-help" href={`/studio/posts/${initial.id}`}>View post</Link>}
        </div>
        {initial && (
          <div className="st-danger">
            {!asking ? (
              <button type="button" className="st-linkdanger" onClick={() => setAsking(true)}>Delete post</button>
            ) : (
              <div className="st-confirm" role="group" aria-label="Confirm delete">
                <span>This can’t be undone.</span>
                <button type="button" className="btn st-small st-btn-danger" onClick={remove} disabled={busy !== ""}>{busy === "delete" ? "Deleting…" : "Yes, delete it"}</button>
                <button type="button" className="btn ghost st-small" onClick={() => setAsking(false)}>Keep it</button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
