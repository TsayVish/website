const ROWS = [
  ["Cost to test", "Animation budgets and years of development", "A generation pipeline and a few weeks of posting"],
  ["Distribution", "Networks, publishers and toy buyers decide", "Algorithmic feeds reach millions directly"],
  ["Strategy", "One expensive bet at a time", "A portfolio, where audiences pick the winners"],
  ["Proof before spend", "Very little until launch day", "Engagement and purchase intent from day one"],
];

export function WhyNow() {
  return (
    <section className="flush-top" aria-labelledby="why-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Why now</span>
          <h2 id="why-title">Hello Kitty took decades. The next one won&rsquo;t.</h2>
          <p className="lede">
            Character IP has always paid off across entertainment, merchandise and licensing. It also used to cost years
            of animation and production before anyone knew if audiences cared. Generative AI makes characters cheap to
            create, and social feeds put them in front of millions without a network deal.
          </p>
        </div>
        <div className="compare" role="table" aria-label="Building character IP then and now">
          <div className="compare-row compare-head" role="row">
            <div className="k" role="columnheader" />
            <div className="then" role="columnheader">The old way</div>
            <div className="now" role="columnheader">The tsayvish way</div>
          </div>
          {ROWS.map(([k, then, now]) => (
            <div className="compare-row" role="row" key={k}>
              <div className="k" role="rowheader">{k}</div>
              <div className="then" role="cell">{then}</div>
              <div className="now" role="cell">{now}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
