# Next App Router Fixture

This fixture demonstrates the v1 integration contract for Next.js App Router:

- Meridian-authored client components live under `src/`.
- The Meridian CLI compiles them into `.meridian/generated/`.
- Server components under `app/` import the generated TSX, not the Meridian source class.
- The Meridian module itself carries an explicit `'use client';` directive.
- The fixture uses Next.js 16.2.2 with React 19.2.0.

Expected build flow:

```sh
pnpm build
pnpm --dir fixtures/next-app-router build
```

During the fixture build:

1. `@meridian/cli` is built from the workspace.
2. Meridian source under `src/` is compiled into `.meridian/generated/`.
3. `next build` type-checks and bundles the App Router fixture.

After the Meridian build step, `app/page.tsx` resolves:

- `../.meridian/generated/components/Counter.meridian`

This keeps the server/client boundary explicit and consistent with the v1 RFC.

## Development workflow

The fixture keeps Meridian compilation explicit during development.

Two-terminal workflow:

```sh
pnpm --dir fixtures/next-app-router dev:meridian
pnpm --dir fixtures/next-app-router dev:web
```

Combined workflow:

```sh
pnpm --dir fixtures/next-app-router dev
```

The combined command still preserves the same model:

1. Meridian generates `.meridian/generated/`
2. Meridian watch keeps generated output current
3. `next dev` serves the App Router app against generated TSX

## Runtime validation

The Phase 7 runtime check uses a real browser against `next dev`:

```sh
pnpm test:fixture:next-runtime
```

That validation proves:

- the fixture boots under `next dev`
- the page shell renders from the server
- the generated Meridian client child hydrates without mismatch warnings
- clicking the counter updates client state after hydration
