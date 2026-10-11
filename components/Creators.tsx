import Link from "next/link";

const PILLARS = [
  { title: "Develop", text: "Design, write and produce with tools that keep your character on-model." },
  { title: "Protect", text: "File trademarks, lock likeness and sign deals with templates that hold up." },
  { title: "Manage", text: "Run media budgets, posting calendars and your community in one place." },
  { title: "Monetize", text: "Open a shop, take payments, make merch and split royalties." },
];

export function Creators() {
  return (
    <section id="platform" className="flush-top" aria-labelledby="plat-title">
      <div className="wrap">
        <div className="platform">
          <div className="copy">
            <span className="eyebrow">For creators</span>
            <h2 id="plat-title">The studio behind our cast is yours to use.</h2>
            <p className="lede">
              Everything we use to run our own characters is open to creators and brands: the tools, legal cover,
              storefronts and payments to build a character franchise of your own.
            </p>
            <Link className="btn" href="/login?mode=signup">Create your account</Link>
          </div>
          <div className="pillars">
            {PILLARS.map((p) => (
              <div className="pillar" key={p.title}>
                <b>{p.title}</b>
                <span>{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
