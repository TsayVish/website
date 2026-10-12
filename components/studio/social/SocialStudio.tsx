"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PLATFORM_INFO, PLATFORMS, POST_STATUS_TEXT, TARGET_STATUS_TEXT, TIKTOK_PRIVACY_LABEL, platformProblem,
  type Platform, type TikTokPrivacy, type YouTubePrivacy,
} from "@/lib/social/platforms";
import type { PostableMedia, SocialAccount, SocialPost, SocialTarget } from "@/lib/social/types";
import { createClient } from "@/lib/supabase/client";

type TikTokInfo = {
  nickname: string | null; username: string | null; privacyOptions: TikTokPrivacy[];
  commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxSeconds: number | null;
};

const MARK: Record<Platform, string> = { instagram: "IG", facebook: "f", youtube: "▶", tiktok: "♪" };

/** Formats a time in the viewer's own time zone (after mount, so server and browser agree). */
function When({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  }, [iso]);
  return <span>{text ? `${prefix}${text}` : " "}</span>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Something went wrong.");
  return body as T;
}

export function SocialStudio({
  project, canEdit, ready, accounts, posts: initialPosts, targets: initialTargets, library, flash, preselect,
}: {
  project: { id: string; name: string };
  canEdit: boolean;
  ready: Record<Platform, boolean>;
  accounts: SocialAccount[];
  posts: SocialPost[];
  targets: SocialTarget[];
  library: PostableMedia[];
  flash: { connected: string | null; error: string | null };
  preselect: string | null;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [targets, setTargets] = useState(initialTargets);
  useEffect(() => { setPosts(initialPosts); setTargets(initialTargets); }, [initialPosts, initialTargets]);
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const usable = accounts.filter((a) => a.status === "active");

  // Keep posts that are due moving while the page is open (the scheduler does this in the background too).
  useEffect(() => {
    const due = posts.filter((p) => (p.status === "publishing" || p.status === "scheduled") && new Date(p.scheduled_at).getTime() <= Date.now());
    if (!due.length) return;
    let stop = false;
    const t = setTimeout(async () => {
      for (const p of due) {
        try {
          const r = await api<{ post: { id: string; status: string } | null; targets: SocialTarget[] }>(`/api/social/posts/${p.id}`, { method: "POST" });
          if (stop) return;
          if (r.post) setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, status: r.post!.status } : x)));
          setTargets((list) => [...list.filter((x) => x.post_id !== p.id), ...r.targets]);
        } catch { /* try again next round */ }
      }
    }, 8000);
    return () => { stop = true; clearTimeout(t); };
  }, [posts]);

  return (
    <div className="so-wrap">
      {flash.connected && PLATFORMS.includes(flash.connected as Platform) && (
        <p className="so-flash ok" role="status">{PLATFORM_INFO[flash.connected as Platform].label} is connected.</p>
      )}
      {flash.error && <p className="so-flash err" role="alert">{flash.error}</p>}

      <section className="so-sec" aria-labelledby="so-acc">
        <h2 id="so-acc">Accounts</h2>
        <div className="so-accounts">
          {PLATFORMS.map((p) => (
            <AccountCard key={p} platform={p} account={byPlatform.get(p)} ready={ready[p]} canEdit={canEdit} projectId={project.id}
              onChanged={() => router.refresh()} />
          ))}
        </div>
      </section>

      {canEdit && (
        <section className="so-sec" aria-labelledby="so-new">
          <h2 id="so-new">New post</h2>
          {usable.length === 0 ? (
            <div className="st-empty"><b>Connect an account first</b><p>Then pick a picture or video from {project.name}’s library and post it, now or later.</p></div>
          ) : library.length === 0 ? (
            <div className="st-empty"><b>Nothing to post yet</b><p>Make or upload pictures and videos in the AI Studio, then come back to post them.</p></div>
          ) : (
            <Composer projectId={project.id} accounts={usable} library={library} preselect={preselect}
              onPosted={() => router.refresh()} />
          )}
        </section>
      )}

      <section className="so-sec" aria-labelledby="so-posts">
        <h2 id="so-posts">Posts</h2>
        {posts.length === 0 ? (
          <div className="st-empty"><b>No posts yet</b><p>Scheduled and published posts show up here with links to each platform.</p></div>
        ) : (
          <ul className="so-posts">
            {posts.map((p) => (
              <PostRow key={p.id} post={p} targets={targets.filter((t) => t.post_id === p.id)} media={library.find((m) => m.id === p.media_id)}
                canEdit={canEdit} onChanged={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AccountCard({ platform, account, ready, canEdit, projectId, onChanged }: {
  platform: Platform; account?: SocialAccount; ready: boolean; canEdit: boolean; projectId: string; onChanged: () => void;
}) {
  const info = PLATFORM_INFO[platform];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const connectHref = `/api/social/connect/${platform}?project=${projectId}`;

  useEffect(() => {
    if (platform !== "facebook" || !account?.has_choices || !canEdit) return;
    api<{ pages: { id: string; name: string }[] }>(`/api/social/accounts/${account.id}`).then((r) => setPages(r.pages)).catch(() => setPages(null));
  }, [platform, account?.id, account?.has_choices, canEdit]);

  async function disconnect() {
    if (!account || !window.confirm(`Disconnect ${info.label}? Posts waiting to go there will be canceled.`)) return;
    setBusy(true);
    const { error: err } = await createClient().rpc("social_disconnect", { p_account: account.id });
    setBusy(false);
    if (err) setError(err.message); else onChanged();
  }
  async function pickPage(pageId: string) {
    if (!account) return;
    setBusy(true);
    setError("");
    try { await api(`/api/social/accounts/${account.id}`, { method: "POST", body: JSON.stringify({ pageId }) }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <div className={`so-acc so-${platform}${account ? " on" : ""}${account?.status === "reconnect" ? " warn" : ""}`}>
      <div className="so-acc-top">
        <span className="so-mark" aria-hidden="true">{MARK[platform]}</span>
        <div className="so-acc-name">
          <b>{info.label}</b>
          <small>{account ? (account.status === "reconnect" ? "Needs you to sign in again" : "Connected") : info.account}</small>
        </div>
      </div>
      {account ? (
        <div className="so-acc-who">
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : <span className="so-acc-ph" aria-hidden="true">{(account.name || account.handle || "?").slice(0, 1).toUpperCase()}</span>}
          <span>
            <b>{account.name || account.handle}</b>
            {account.handle && account.name && <small>{account.handle}</small>}
          </span>
        </div>
      ) : <p className="ai-hint">{ready ? info.note : "Not switched on yet. An admin needs to add this platform’s app keys (see the README)."}</p>}
      {account?.status === "reconnect" && account.last_error && <p className="ai-hint so-err">{account.last_error}</p>}
      {pages && pages.length > 1 && (
        <label className="so-field">
          <span className="lbl">Page</span>
          <select className="st-input" value={account?.external_id} disabled={busy} onChange={(e) => pickPage(e.target.value)}>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      {canEdit && (
        <div className="so-acc-actions">
          {!account && (ready ? <a className="btn st-small" href={connectHref}>Connect</a> : <button type="button" className="btn st-small" disabled>Connect</button>)}
          {account && account.status === "reconnect" && ready && <a className="btn st-small" href={connectHref}>Reconnect</a>}
          {account && <button type="button" className="btn ghost st-small" disabled={busy} onClick={disconnect}>Disconnect</button>}
        </div>
      )}
    </div>
  );
}

function Composer({ projectId, accounts, library, preselect, onPosted }: {
  projectId: string; accounts: SocialAccount[]; library: PostableMedia[]; preselect: string | null; onPosted: () => void;
}) {
  const [mediaId, setMediaId] = useState(() => library.find((m) => m.id === preselect)?.id ?? library.find((m) => m.kind === "video")?.id ?? library[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [caption, setCaption] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState<YouTubePrivacy>("public");
  const [kids, setKids] = useState(false);
  const [aiLabel, setAiLabel] = useState(true);
  const [tt, setTt] = useState<TikTokInfo | null>(null);
  const [ttError, setTtError] = useState("");
  const [ttPrivacy, setTtPrivacy] = useState<TikTokPrivacy | "">("");
  const [ttAllow, setTtAllow] = useState({ comments: true, duet: true, stitch: true });
  const [brandOwn, setBrandOwn] = useState(false);
  const [brandPaid, setBrandPaid] = useState(false);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const media = library.find((m) => m.id === mediaId);
  const chosen = accounts.filter((a) => picked.includes(a.id));
  const has = (p: Platform) => chosen.some((a) => a.platform === p);
  const tiktokAcct = accounts.find((a) => a.platform === "tiktok");
  const shown = library.filter((m) => filter === "all" || m.kind === filter);
  const problems = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, media ? platformProblem(a.platform, media, caption) : ""])), [accounts, media, caption]);
  const limit = Math.min(...(chosen.length ? chosen : accounts).map((a) => PLATFORM_INFO[a.platform].captionMax));

  // Drop platforms that can't take the chosen file.
  useEffect(() => { setPicked((ids) => ids.filter((id) => !problems[id])); }, [problems]);

  // TikTok asks apps to show the creator's current options before posting.
  useEffect(() => {
    if (!tiktokAcct || !picked.includes(tiktokAcct.id) || tt) return;
    setTtError("");
    api<{ tiktok: TikTokInfo }>(`/api/social/accounts/${tiktokAcct.id}`).then((r) => setTt(r.tiktok)).catch((e) => setTtError(e instanceof Error ? e.message : String(e)));
  }, [tiktokAcct, picked, tt]);

  const tooLongForTikTok = !!(tt?.maxSeconds && media?.duration_ms && media.duration_ms / 1000 > tt.maxSeconds);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    if (!media) return setError("Pick a picture or video.");
    if (!chosen.length) return setError("Choose where to post it.");
    if (has("tiktok") && !ttPrivacy) return setError("Choose who can see it on TikTok.");
    if (has("tiktok") && tooLongForTikTok) return setError(`TikTok allows up to ${tt!.maxSeconds} seconds for this account.`);
    if (has("tiktok") && brandPaid && ttPrivacy === "SELF_ONLY") return setError("Branded content can’t be private on TikTok.");
    if (mode === "later" && (!when || new Date(when).getTime() < Date.now() + 60_000)) return setError("Pick a time at least a minute from now.");
    setBusy(true);
    try {
      await api("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({
          projectId, mediaId: media.id, caption, title, accountIds: chosen.map((a) => a.id),
          scheduledAt: mode === "later" ? new Date(when).toISOString() : null,
          options: {
            aiGenerated: aiLabel,
            youtube: { privacy: ytPrivacy, madeForKids: kids },
            tiktok: { privacy: ttPrivacy || undefined, allowComments: ttAllow.comments, allowDuet: ttAllow.duet, allowStitch: ttAllow.stitch, brandOwn, brandPaid },
          },
        }),
      });
      setDone(mode === "later" ? "Scheduled." : "Posting now. Progress shows below.");
      setCaption("");
      setTitle("");
      setPicked([]);
      setTtPrivacy("");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <form className="panel so-composer" onSubmit={submit} noValidate>
      <div className="so-pick">
        <div className="so-pick-head">
          <span className="lbl">What to post</span>
          <nav className="as-seg" aria-label="Show">
            {(["all", "video", "image"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "all" ? "All" : k === "video" ? "Videos" : "Pictures"}</button>
            ))}
          </nav>
        </div>
        <ul className="so-media" role="listbox" aria-label="Library">
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" role="option" aria-selected={m.id === mediaId} className="so-media-tile" onClick={() => setMediaId(m.id)} title={m.label ?? ""}>
                {!m.url ? <span className="as-shimmer" /> : m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" loading="lazy" />
                ) : <video src={m.url + "#t=0.1"} muted playsInline preload="metadata" />}
                {m.kind === "video" && <span className="as-play" aria-hidden="true">▶</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="so-form">
        <fieldset className="so-targets">
          <legend className="lbl">Post to</legend>
          {accounts.map((a) => {
            const problem = problems[a.id];
            const on = picked.includes(a.id);
            return (
              <label key={a.id} className={`so-target so-${a.platform}${on ? " on" : ""}${problem ? " off" : ""}`} title={problem || undefined}>
                <input type="checkbox" checked={on} disabled={!!problem}
                  onChange={(e) => setPicked((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
                <span className="so-mark" aria-hidden="true">{MARK[a.platform]}</span>
                <span><b>{PLATFORM_INFO[a.platform].label}</b><small>{problem || a.handle || a.name}</small></span>
              </label>
            );
          })}
        </fieldset>

        <label className="so-field">
          <span className="lbl">Caption <small className="so-count">{caption.length}/{limit.toLocaleString("en-US")}</small></span>
          <textarea className="st-input" rows={4} maxLength={5000} value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something in the character’s voice. #hashtags work." />
        </label>

        {has("youtube") && (
          <fieldset className="so-extra">
            <legend>YouTube</legend>
            <label className="so-field"><span className="lbl">Title</span>
              <input className="st-input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the caption’s first line" /></label>
            <div className="so-row">
              <label className="so-field"><span className="lbl">Visibility</span>
                <select className="st-input" value={ytPrivacy} onChange={(e) => setYtPrivacy(e.target.value as YouTubePrivacy)}>
                  <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
                </select></label>
              <label className="so-check"><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} /> Made for kids</label>
            </div>
          </fieldset>
        )}

        {has("tiktok") && (
          <fieldset className="so-extra">
            <legend>TikTok{tt?.nickname ? ` · posting as ${tt.nickname}` : ""}</legend>
            {ttError && <p className="form-error">{ttError}</p>}
            {!tt && !ttError && <p className="ai-hint">Checking your TikTok settings…</p>}
            {tt && (
              <>
                <label className="so-field"><span className="lbl">Who can see this</span>
                  <select className="st-input" value={ttPrivacy} onChange={(e) => { setTtPrivacy(e.target.value as TikTokPrivacy); setError(""); }} required>
                    <option value="" disabled>Choose…</option>
                    {tt.privacyOptions.map((o) => (
                      <option key={o} value={o} disabled={brandPaid && o === "SELF_ONLY"}>{TIKTOK_PRIVACY_LABEL[o] ?? o}</option>
                    ))}
                  </select></label>
                <div className="so-row">
                  <label className="so-check"><input type="checkbox" disabled={tt.commentDisabled} checked={!tt.commentDisabled && ttAllow.comments} onChange={(e) => setTtAllow({ ...ttAllow, comments: e.target.checked })} /> Allow comments</label>
                  <label className="so-check"><input type="checkbox" disabled={tt.duetDisabled} checked={!tt.duetDisabled && ttAllow.duet} onChange={(e) => setTtAllow({ ...ttAllow, duet: e.target.checked })} /> Allow Duet</label>
                  <label className="so-check"><input type="checkbox" disabled={tt.stitchDisabled} checked={!tt.stitchDisabled && ttAllow.stitch} onChange={(e) => setTtAllow({ ...ttAllow, stitch: e.target.checked })} /> Allow Stitch</label>
                </div>
                <div className="so-row">
                  <label className="so-check"><input type="checkbox" checked={brandOwn} onChange={(e) => setBrandOwn(e.target.checked)} /> Promotes your own brand</label>
                  <label className="so-check"><input type="checkbox" checked={brandPaid} onChange={(e) => setBrandPaid(e.target.checked)} /> Paid partnership</label>
                </div>
                {tooLongForTikTok && <p className="form-error">This video is longer than the {tt.maxSeconds} seconds TikTok allows for this account.</p>}
                <p className="ai-hint">
                  {brandPaid ? "By posting, you agree to TikTok’s Branded Content Policy and Music Usage Confirmation." : "By posting, you agree to TikTok’s Music Usage Confirmation."}
                  {" "}It may take a few minutes to appear on your profile.
                </p>
              </>
            )}
          </fieldset>
        )}

        <label className="so-check">
          <input type="checkbox" checked={aiLabel} onChange={(e) => setAiLabel(e.target.checked)} /> Label as AI-generated <small>(on YouTube and TikTok)</small>
        </label>

        <div className="so-when" role="radiogroup" aria-label="When">
          <label className="so-check"><input type="radio" name="so-when" checked={mode === "now"} onChange={() => setMode("now")} /> Post now</label>
          <label className="so-check"><input type="radio" name="so-when" checked={mode === "later"} onChange={() => setMode("later")} /> Schedule</label>
          {mode === "later" && <input className="st-input so-datetime" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time" />}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {done && <p className="form-ok" role="status">{done}</p>}
        <div className="so-go">
          <button type="submit" className="btn" disabled={busy || !chosen.length || !media}>
            {busy ? (mode === "now" ? "Posting…" : "Scheduling…") : mode === "later" ? "Schedule" : chosen.length > 1 ? `Post to ${chosen.length} accounts` : "Post now"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PostRow({ post, targets, media, canEdit, onChanged }: {
  post: SocialPost; targets: SocialTarget[]; media?: PostableMedia; canEdit: boolean; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rpc(fn: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const { error: err } = await createClient().rpc(fn, { p_post: post.id });
    setBusy(false);
    if (err) setError(err.message); else onChanged();
  }
  const finished = !["scheduled", "publishing"].includes(post.status);
  return (
    <li className={`so-post s-${post.status}`}>
      <div className="so-post-thumb">
        {media?.url ? (media.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={media.url} alt="" loading="lazy" />
          : <video src={media.url + "#t=0.1"} muted playsInline preload="metadata" />)
          : <span aria-hidden="true">{post.media_kind === "video" ? "▶" : "▣"}</span>}
      </div>
      <div className="so-post-body">
        <div className="so-post-top">
          <span className={`st-status so-st-${post.status}`}>{POST_STATUS_TEXT[post.status] ?? post.status}</span>
          <small><When iso={post.scheduled_at} prefix={post.status === "scheduled" ? "Goes out " : ""} /></small>
        </div>
        <p className="so-post-cap">{post.title || post.caption || <i>No caption</i>}</p>
        <ul className="so-chips">
          {targets.map((t) => (
            <li key={t.id} className={`so-chip so-${t.platform} t-${t.status}`} title={t.error ?? undefined}>
              <span className="so-mark" aria-hidden="true">{MARK[t.platform]}</span>
              {t.external_url ? <a href={t.external_url} target="_blank" rel="noopener noreferrer">{PLATFORM_INFO[t.platform].label} ↗</a> : <span>{PLATFORM_INFO[t.platform].label}</span>}
              <em>{TARGET_STATUS_TEXT[t.status] ?? t.status}</em>
            </li>
          ))}
        </ul>
        {targets.filter((t) => t.status === "failed" && t.error).map((t) => (
          <p key={t.id} className="so-post-err"><b>{PLATFORM_INFO[t.platform].label}:</b> {t.error}</p>
        ))}
        {error && <p className="form-error">{error}</p>}
      </div>
      {canEdit && (
        <div className="so-post-actions">
          {post.status === "scheduled" && <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => rpc("social_cancel_post", "Cancel this post? Nothing has gone out yet.")}>Cancel</button>}
          {finished && <button type="button" className="as-trash" aria-label="Remove from list" title="Remove from list" disabled={busy}
            onClick={() => rpc("social_delete_post", "Remove this from the list? Anything already published stays on the platforms.")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
          </button>}
        </div>
      )}
    </li>
  );
}
