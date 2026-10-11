const STEPS = [
  { title: "Create", text: "Design a character with a personality, a voice and a running joke. Start from scratch or bring your own." },
  { title: "Post", text: "Publish daily across social platforms, testing formats, tones and audiences side by side." },
  { title: "Listen", text: "Read the signals that separate a viral clip from a character people want to keep.",
    signals: ["Organic engagement", "Repeat viewers", "Fan participation", "Purchase intent"] },
  { title: "Franchise", text: "Switch on the infrastructure for breakouts: brand partnerships, merchandise, storefronts, events and standalone consumer brands." },
];

export function Engine() {
  return (
    <section id="engine" className="flush-top" aria-labelledby="engine-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">The engine</span>
          <h2 id="engine-title">Ours or yours, the audience decides what scales.</h2>
          <p className="lede">The same engine runs our in-house cast and every character built on tsayvish.</p>
        </div>
        <div className="engine">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <span className="num">Step {i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              {s.signals && (
                <ul className="signals">
                  {s.signals.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
