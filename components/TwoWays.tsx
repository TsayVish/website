import { CharacterArt, Critter } from "./art";
import { CAST } from "@/lib/content";

export function TwoWays() {
  return (
    <section aria-labelledby="ways-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Two ways in</span>
          <h2 id="ways-title">Bring a character, or partner on one of ours.</h2>
        </div>
        <div className="ways">
          <article className="way yours">
            <span className="eyebrow">For creators &amp; brands</span>
            <h3>Build your own character</h3>
            <p>
              Start from a sketch, an idea or a character you already have. Design it with our tools, then switch on the
              infrastructure to grow it into a franchise.
            </p>
            <ul>
              <li>Creation tools that keep your character on-model</li>
              <li>Trademark, likeness and legal handled for you</li>
              <li>Storefront, payments and merch ready when you are</li>
            </ul>
            <a className="btn" href="#build">Try the builder</a>
            <div className="mini" aria-hidden="true">
              <CharacterArt name="Your character" kind="Robot" color="var(--butter)" prop="sparkle" />
            </div>
          </article>
          <article className="way ours">
            <span className="eyebrow">For partners &amp; licensees</span>
            <h3>Work with our originals</h3>
            <p>
              We create and run an in-house cast, testing them in public and backing the breakouts. Brands, licensees and
              manufacturers can partner on them.
            </p>
            <ul>
              <li>Characters with audiences you can see</li>
              <li>Brand partnerships and co-branded drops</li>
              <li>Licensing for plush, apparel, books and more</li>
            </ul>
            <a className="btn ghost" href="#cast">Meet our cast</a>
            <div className="mini" aria-hidden="true">
              <Critter {...CAST[0]} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
