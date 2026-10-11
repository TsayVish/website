const FACTS = [
  { title: "Shareable", text: "Personalities built around feelings people send to their group chat.", color: "var(--pink)" },
  { title: "Collectible", text: "Designed from day one to work as plush, blind boxes and apparel.", color: "var(--butter)" },
  { title: "Ownable", text: "Every character is original IP, filed and protected before it scales.", color: "var(--sky)" },
];

export function Audience() {
  return (
    <section aria-labelledby="aud-title">
      <div className="wrap aud">
        <div className="copy">
          <span className="eyebrow">Who it&rsquo;s for</span>
          <h2 id="aud-title">Cute is a serious business.</h2>
          <p>
            Labubu and Jellycat proved that adults will line up for cute, collectible things without an elaborate
            backstory. We think characters with real personalities go further. They become entertainment people share,
            and an identity people wear.
          </p>
          <p>
            Our first audience is Gen Z and millennial women, who already treat the characters they love as a way to say
            something about themselves.
          </p>
        </div>
        <div className="facts">
          {FACTS.map((f) => (
            <div className="fact" key={f.title}>
              <span className="dot" style={{ background: f.color }} />
              <div>
                <b>{f.title}</b>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
