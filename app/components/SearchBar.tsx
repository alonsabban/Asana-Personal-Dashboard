"use client";

import { useAsana } from "@/app/components/AsanaProvider";

export default function SearchBar() {
  const { query, setQuery, data } = useAsana();

  // Only open tasks are searchable, so that is the number to advertise.
  const total = data ? data.counts.open : 0;

  return (
    <div className="searchbar">
      <span className="search-icon" aria-hidden>
        ⌕
      </span>
      <input
        className="search-input"
        type="text"
        placeholder={`Search ${total || ""} tasks by name, project, subject…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button className="search-clear" onClick={() => setQuery("")} title="Clear">
          ×
        </button>
      )}
    </div>
  );
}
