# Next App Router Fixture

This fixture demonstrates the v1 integration contract for Next.js App Router:

- Meridian-authored client components live under `src/`.
- The Meridian CLI compiles them into `.meridian/generated/`.
- Server components under `app/` import the generated TSX, not the Meridian source class.
- The Meridian module itself carries an explicit `'use client';` directive.

Expected build flow:

```sh
pnpm build
node ../../packages/cli/dist/index.js build --cwd .
```

After the Meridian build step, `app/page.tsx` resolves:

- `../.meridian/generated/components/Counter.meridian`

This keeps the server/client boundary explicit and consistent with the v1 RFC.
