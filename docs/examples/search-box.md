---
title: Search Box
---

# Search Box

This example builds a search box component that composes multiple Meridian features: `@state` for the input value, `@use` to consume the `UseDebounce` Primitive, `@ref` for the input element, and `@effect` to fetch results when the debounced query changes.

It is a realistic component that demonstrates how `@use` integrates a Primitive end-to-end.

## Prerequisites

This example uses the `UseDebounce<T>` Primitive from the [Debounce example](./debounce.md). Make sure it is compiled and available at `@meridian/primitives/UseDebounce` before using the component below.

## The component source

```tsx
// src/components/SearchBox.tsx
'use client';

import { Component, state, ref, effect, use } from 'meridian';
import { UseDebounce } from '@meridian/primitives/UseDebounce';

interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
}

interface SearchBoxProps {
  placeholder?: string;
  debounceMs?: number;
  minQueryLength?: number;
}

export class SearchBox extends Component<SearchBoxProps> {
  @state query = '';
  @state results: SearchResult[] = [];
  @state loading = false;
  @state error: string | null = null;

  @ref inputEl!: React.RefObject<HTMLInputElement>;

  @use(UseDebounce, () => [this.query, this.props.debounceMs ?? 300])
  debouncedQuery!: string;

  get minLength(): number {
    return this.props.minQueryLength ?? 2;
  }

  get isQueryTooShort(): boolean {
    return this.debouncedQuery.length > 0 && this.debouncedQuery.length < this.minLength;
  }

  get showResults(): boolean {
    return this.results.length > 0 && !this.loading;
  }

  handleQueryChange(e: React.ChangeEvent<HTMLInputElement>): void {
    this.query = e.target.value;
  }

  clearSearch(): void {
    this.query = '';
    this.results = [];
    this.error = null;
    this.inputEl.current?.focus();
  }

  @effect
  async fetchResults(): Promise<void> {
    if (this.debouncedQuery.length < this.minLength) {
      this.results = [];
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(this.debouncedQuery)}`
      );
      if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
      const data = await response.json();
      this.results = data.results;
    } catch (err) {
      this.error = (err as Error).message;
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  render() {
    return (
      <div className="search-box">
        <div className="search-input-row">
          <input
            ref={this.inputEl}
            type="search"
            value={this.query}
            onChange={this.handleQueryChange}
            placeholder={this.props.placeholder ?? 'Search...'}
            aria-label="Search"
            aria-busy={this.loading}
          />
          {this.query && (
            <button
              type="button"
              onClick={this.clearSearch}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {this.loading && <p className="search-status">Searching...</p>}

        {this.isQueryTooShort && (
          <p className="search-hint">
            Enter at least {this.minLength} characters to search.
          </p>
        )}

        {this.error && (
          <p className="search-error" role="alert">{this.error}</p>
        )}

        {this.showResults && (
          <ul className="search-results" role="listbox">
            {this.results.map(result => (
              <li key={result.id} role="option">
                <strong>{result.title}</strong>
                <p>{result.excerpt}</p>
              </li>
            ))}
          </ul>
        )}

        {!this.loading && !this.error && !this.showResults &&
         this.debouncedQuery.length >= this.minLength && (
          <p className="search-empty">No results for "{this.debouncedQuery}".</p>
        )}
      </div>
    );
  }
}
```

## Annotated walkthrough

### State fields

```tsx
@state query = '';            // The raw input value — updates on every keystroke
@state results: SearchResult[] = [];  // Fetched search results
@state loading = false;       // True while the fetch is in flight
@state error: string | null = null;   // Error message if the fetch failed
```

### The @use integration

```tsx
@use(UseDebounce, () => [this.query, this.props.debounceMs ?? 300])
debouncedQuery!: string;
```

This calls `useUseDebounce(query, props.debounceMs ?? 300)` in the generated output. `debouncedQuery` lags behind `query` by the specified delay. The user sees instant input reflection (`query` updates on every keystroke) but the fetch only triggers when the user stops typing.

### Dependency inference for fetchResults

The `@effect fetchResults()` method reads:

- `this.debouncedQuery` → state-like dep from the `@use` field
- `this.minLength` → getter that reads `this.props.minQueryLength`

The compiler flattens `minLength` to its concrete dependency `props.minQueryLength`, and collects `debouncedQuery` from the `@use` field. The inferred dep array is `[debouncedQuery, props.minQueryLength]`.

### The @ref for focus management

```tsx
@ref inputEl!: React.RefObject<HTMLInputElement>;
```

The ref allows `clearSearch()` to call `this.inputEl.current?.focus()` after clearing the query. Refs are not reactive — the focus call does not need to be in an effect.

### Getters for derived booleans

```tsx
get isQueryTooShort(): boolean {
  return this.debouncedQuery.length > 0 && this.debouncedQuery.length < this.minLength;
}
```

Getters become plain `const` expressions in the generated output. There is no `useMemo` here — the React Compiler can add memoization if it determines it is beneficial.

## Generated output

<details>
<summary>View .meridian/generated/components/SearchBox.tsx</summary>

```tsx
// .meridian/generated/components/SearchBox.tsx
// Generated by Meridian compiler — do not edit manually.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUseDebounce } from '@meridian/primitives/UseDebounce';

interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
}

interface SearchBoxProps {
  placeholder?: string;
  debounceMs?: number;
  minQueryLength?: number;
}

export function SearchBox(props: SearchBoxProps) {
  // @use calls first
  const debouncedQuery = useUseDebounce(query, props.debounceMs ?? 300);

  // @state declarations
  const [query, setQuery] = useState(() => '');
  const [results, setResults] = useState<SearchResult[]>(() => []);
  const [loading, setLoading] = useState(() => false);
  const [error, setError] = useState<string | null>(() => null);

  // @ref declarations
  const inputEl = useRef<HTMLInputElement>(null);

  // Derived expressions (getters)
  const minLength = props.minQueryLength ?? 2;
  const isQueryTooShort = debouncedQuery.length > 0 && debouncedQuery.length < minLength;
  const showResults = results.length > 0 && !loading;

  // Local functions (methods)
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setError(null);
    inputEl.current?.focus();
  }

  // Effects
  useEffect(() => {
    (async () => {
      if (debouncedQuery.length < minLength) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(debouncedQuery)}`
        );
        if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
        const data = await response.json();
        setResults(data.results);
      } catch (err) {
        setError((err as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [debouncedQuery, minLength]);

  return (
    <div className="search-box">
      <div className="search-input-row">
        <input
          ref={inputEl}
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder={props.placeholder ?? 'Search...'}
          aria-label="Search"
          aria-busy={loading}
        />
        {query && (
          <button type="button" onClick={clearSearch} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {loading && <p className="search-status">Searching...</p>}

      {isQueryTooShort && (
        <p className="search-hint">
          Enter at least {minLength} characters to search.
        </p>
      )}

      {error && (
        <p className="search-error" role="alert">{error}</p>
      )}

      {showResults && (
        <ul className="search-results" role="listbox">
          {results.map(result => (
            <li key={result.id} role="option">
              <strong>{result.title}</strong>
              <p>{result.excerpt}</p>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && !showResults && debouncedQuery.length >= minLength && (
        <p className="search-empty">No results for "{debouncedQuery}".</p>
      )}
    </div>
  );
}
```

</details>

## Using the component

```tsx
// app/page.tsx (Server Component)
import { SearchBox } from '@meridian/components/SearchBox';

export default function DocsPage() {
  return (
    <main>
      <h1>Documentation Search</h1>
      <SearchBox
        placeholder="Search the docs..."
        debounceMs={400}
        minQueryLength={3}
      />
    </main>
  );
}
```

## Related

- [Debounce Primitive](./debounce.md) — the `UseDebounce<T>` Primitive used in this example
- [Primitives guide](../guide/primitives.md)
- [Effects guide](../guide/effects.md) — async effects and dependency inference
- [`@use` API reference](../api/use.md)
