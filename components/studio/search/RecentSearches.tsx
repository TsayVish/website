"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearRecent, readRecent, rememberSearch } from "./SearchComposer";

/** Your last few searches (kept in this browser only). */
export function RecentSearches() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => setList(readRecent()), []);
  if (!list.length) return null;
  return (
    <section className="sx-block" aria-labelledby="sx-recent">
      <div className="sx-block-head">
        <h2 id="sx-recent">Recent</h2>
        <button type="button" className="rp-link" onClick={() => { clearRecent(); setList([]); }}>Clear</button>
      </div>
      <ul className="sx-list">
        {list.map((q) => (
          <li key={q}>
            <Link className="sx-suggest" href={`/studio/search?q=${encodeURIComponent(q)}`} onClick={() => rememberSearch(q)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
              <span>{q}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
