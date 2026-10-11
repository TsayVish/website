import Link from "next/link";
import { Critter } from "./art";
import { CAST, LANES } from "@/lib/content";

export function Hero() {
  const services = LANES.flatMap((l) => l.items.map((i) => i.name));
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <span className="eyebrow">AI-native character studio + platform</span>
        <h1 id="hero-title">
          Characters people <em>fall for.</em> Ours, and yours.
        </h1>
        <p className="lede">
          tsayvish runs its own cast of original characters, and gives anyone the tools to create a character and spin
          up everything it needs to scale: legal, likeness, storefront, payments, merch, media and fans.
        </p>
        <div className="hero-ctas">
          <Link className="btn" href="/login?mode=signup">Create your character</Link>
          <a className="btn ghost" href="#cast">Meet our cast</a>
        </div>
      </div>

      <div className="wrap stage">
        <div className="lineup" aria-label="Our first characters">
          {CAST.map((c) => (
            <figure key={c.name}>
              <Critter {...c} />
              <figcaption className="tag">{c.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...services, ...services].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
