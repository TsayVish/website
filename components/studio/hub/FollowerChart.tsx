/** New followers per day: one series, bars on a shared baseline, hover shows the exact count. */
export function FollowerChart({ days }: { days: { date: string; count: number }[] }) {
  const W = 720, H = 220, padL = 32, padB = 26, padT = 12, padR = 8;
  const max = Math.max(1, ...days.map((d) => d.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const ticks = niceMax <= 4 ? Array.from({ length: niceMax + 1 }, (_, i) => i) : [0, niceMax / 5 * 1, niceMax / 5 * 2, niceMax / 5 * 3, niceMax / 5 * 4, niceMax].map(Math.round);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / days.length;
  const barW = Math.max(2, slot - 2); // 2px gap between bars
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;
  const label = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const every = Math.ceil(days.length / 6);
  return (
    <figure className="hub-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`New followers per day, ${days.length} days. Total ${days.reduce((a, d) => a + d.count, 0)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="hub-grid" />
            <text x={padL - 8} y={y(t) + 4} className="hub-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const h = (d.count / niceMax) * plotH;
          const x = padL + i * slot + 1;
          return (
            <g key={d.date} className="hub-bar-g">
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} className="hub-hit">
                <title>{`${label(d.date)}: ${d.count} new follower${d.count === 1 ? "" : "s"}`}</title>
              </rect>
              {d.count > 0 && <path className="hub-bar" d={`M${x},${y(0)} V${y(0) - h + 4} Q${x},${y(0) - h} ${x + 4},${y(0) - h} H${x + barW - 4} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + 4} V${y(0)} Z`} />}
              {i % every === 0 && <text x={x + barW / 2} y={H - 6} className="hub-axis" textAnchor="middle">{label(d.date)}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="hub-baseline" />
      </svg>
      <details className="hub-table-toggle">
        <summary>View as table</summary>
        <table>
          <thead><tr><th scope="col">Day</th><th scope="col">New followers</th></tr></thead>
          <tbody>{days.filter((d) => d.count > 0).map((d) => <tr key={d.date}><td>{label(d.date)}</td><td>{d.count}</td></tr>)}</tbody>
        </table>
        {days.every((d) => d.count === 0) && <p className="st-help">No new followers in this period.</p>}
      </details>
    </figure>
  );
}
