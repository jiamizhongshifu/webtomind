import { useState } from 'react';
import { Search } from 'lucide-react';

// The draft belongs to the input, not the 48-card library. The parent only
// receives a query when submitted; key this component by the URL query so
// browser back/forward restores the draft without a second render effect.
export function PromptLibrarySearch({
  isZh,
  query,
  onSearch
}: {
  isZh: boolean;
  query: string;
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  return (
    <form
      className="prompt-browser-search-form"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim());
      }}
    >
      <label className="sr-only" htmlFor="prompt-browser-search">
        {isZh ? '搜索提示词案例' : 'Search prompt cases'}
      </label>
      <input
        id="prompt-browser-search"
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder={
          isZh ? '搜索案例、模型、提示词' : 'Search cases, models, prompts'
        }
      />
      <button type="submit">
        <Search size={15} aria-hidden="true" />
        <span>{isZh ? '搜索' : 'Search'}</span>
      </button>
    </form>
  );
}
