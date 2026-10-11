import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/studio/Avatar";
import { ReportButton } from "@/components/studio/social/ReportButton";
import { POST_COLUMNS, fmtDate, type Post } from "@/lib/hub";
import { MEMBER_COLUMNS, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle(),
  ]);
  // Row-level security only returns posts this member may see.
  if (!data) notFound();
  const post = data as Post;
  const { data: author } = await supabase.from("profiles").select(MEMBER_COLUMNS).eq("id", post.owner_id).maybeSingle();
  const a = author as unknown as Member | null;
  const name = a?.full_name || "tsayvish creator";
  const mine = post.owner_id === user?.id;

  return (
    <article className="st-stack post-page">
      <div className="st-crumbs">
        <Link href={`/studio/u/${post.owner_id}`}>{name}</Link><span>/</span><span>Post</span>
      </div>
      <header className="post-head">
        <h1>{post.title}</h1>
        <div className="post-byline">
          <Avatar url={a?.avatar_url} name={name} size={36} />
          <span>
            <Link href={`/studio/u/${post.owner_id}`}><b>{name}</b></Link>
            <small className="st-muted">
              {post.status === "draft" ? "Draft" : fmtDate(post.published_at)} · {post.visibility === "public" ? "Everyone" : "Followers only"}
            </small>
          </span>
          {mine && <Link className="btn ghost st-small" href={`/studio/hub/library/${post.id}`}>Edit</Link>}
        </div>
      </header>
      <div className="post-body">
        {post.body.trim() ? post.body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>) : <p className="st-muted">No text.</p>}
      </div>
      {!mine && (
        <footer className="post-foot">
          <ReportButton targetType="post" targetId={post.id} targetLabel={post.title} label="Report this post" />
        </footer>
      )}
    </article>
  );
}
