import Link from "next/link";
import { LANES } from "@/lib/content";

export function Services() {
  return (
    <section id="services" className="services" aria-labelledby="svc-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">What we handle</span>
          <h2 id="svc-title">Everything between &ldquo;that&rsquo;s cute&rdquo; and a checkout page.</h2>
          <p className="lede">
            A character becomes a business through dozens of unglamorous jobs. The same infrastructure runs our cast and
            yours, all under one roof, so nothing falls between the agency, the lawyer and the factory.
          </p>
        </div>
        <div className="lanes">
          {LANES.map((lane) => (
            <div className="lane" key={lane.name}>
              <div className="lane-head" style={{ background: lane.color }}>
                <h3>{lane.name}</h3>
                <span>{lane.items.length} services</span>
              </div>
              {lane.items.map((s) => (
                <div className="svc" key={s.name}>
                  <h4>{s.name}</h4>
                  <p>{s.text}</p>
                  <span className="d">{s.detail}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="one-contract">
          <p>Start with one character. Turn on the rest as it grows.</p>
          <Link className="btn" href="/login?mode=signup">Get started</Link>
        </div>
      </div>
    </section>
  );
}
