# Changesets

Meridian uses Changesets to manage prerelease version bumps for publishable packages.

Create a new changeset before any user-facing release:

```sh
pnpm changeset
```

Then apply version bumps with:

```sh
pnpm version:packages
```
