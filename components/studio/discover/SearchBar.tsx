/** Big rounded search field. A plain GET form, so it works before any script loads. */
export function SearchBar({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form className="dc-search" action="/studio/search" role="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <label htmlFor="dc-q" className="visually-hidden">Search creators, characters and services</label>
      <input id="dc-q" name="q" type="search" defaultValue={defaultValue} autoFocus={autoFocus} placeholder="Search creators, characters and services" autoComplete="off" />
    </form>
  );
}
