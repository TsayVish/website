import { CastArt } from "./CastArt";
import { CAST } from "@/lib/content";

export function Cast() {
  return (
    <section id="cast" className="flush-top" aria-labelledby="cast-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Our in-house cast</span>
          <h2 id="cast-title">Cute on the outside. Painfully relatable on the inside.</h2>
          <p className="lede">
            Made in our studio and open to partners. Stylized animals skip the uncanny valley: nobody needs a bunny to
            look real, they need it to feel exactly like their Tuesday.
          </p>
        </div>
        <div className="cast">
          {CAST.map((c) => (
            <article className="card" key={c.name}>
              <div className="pic cast-pic">
                <CastArt member={c} />
              </div>
              <div className="meta">
                <span className="species">{c.species}</span>
                <h3>{c.name}</h3>
                <p>{c.line}</p>
                <span className={c.hot ? "status hot" : "status"}>{c.status}</span>
              </div>
            </article>
          ))}
        </div>
        <p className="fine">Early character concepts, shown for illustration.</p>
      </div>
    </section>
  );
}
