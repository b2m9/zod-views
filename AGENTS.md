# @b2m9/zod-views — agent guide

`@b2m9/zod-views` derives strict create/update inputs and a stripping read
schema from one plain Zod object and one exhaustive field-role table. The
public contract and guardrails are in `README.md`; the computed types are in
`src/types.ts`; the executable contract is in `tests/`. Read those first.

## Toolchain

ESM-only, Node >=22. The project uses pnpm and Vite+. Run `vp test run` while
iterating. Run `vp check`, `vp test run`, and `vp run check:exports` before
handing off. Type tests run through Vitest's typecheck mode and must remain in
that pass.

## Constraints to preserve

- **The API stays closed.** Export only `defineViews` and `FieldsFor`. Return
  only `create`, `update`, and `read`. Do not add options or conveniences.
- **Classification stays exhaustive.** A new core field must fail compilation
  until it has a role. Runtime checks mirror missing, stale, and invalid table
  entries for JavaScript callers.
- **Roles stay one flat table.** Writability is `mutable`, `create-only`, or
  `server`; appending ` hidden` controls read visibility.
- **The shield stays undefined-first.** Every mutable update field is
  `z.union([z.undefined(), field]).optional()`. Do not replace it with
  `.partial()` or reorder the union.
- **Inference identity is a release gate.** Both `z.input` and `z.output` must
  equal the hand-written counterparts, including transforms and defaults.
  Internal casts must never widen the returned schemas.
- **Boundaries stay fixed.** Create and update are strict. Read strips unknown
  keys. Never inherit the core's catchall mode.
- **Views stay plain.** Return unrefined `ZodObject`s so normal Zod composition
  works on every view.
- **Cores stay plain.** Reject refined, piped, and non-object cores. Callers
  refine the derived view that owns a policy.
- **Definition is pure.** Never mutate the core, its fields, the role table, or
  a sibling view.
- **Prototype-named fields keep their policy.** Shape derivation preserves
  literal `__proto__`; Zod itself omits that key from parsed output, so do not
  promise or override different baseline behavior.
- **Use public Zod APIs only.** Do not inspect private definitions or walk
  wrapper internals.
- **Native errors stay native.** Wrong update types may report
  `invalid_union`; do not rewrite issues or promise Zod's message prose.
- **Peer behavior stays measured.** Test the `4.4.3` floor and the newest
  version matching `zod@^4.4.3`. Canary failures block release.

## Design principles

This package derives a fixed schema family. It is not an authorization layer,
ORM bridge, OpenAPI generator, relation expander, or PATCH persistence helper.

- Prefer ordinary Zod composition over configuration.
- Keep application policy such as non-empty patches outside the package.
- Prefer removing code to adding an export, option, role, or derived view.
- Preserve the difference between absent JSON properties and explicit
  `undefined`.
- Keep runtime code small. The package's weight belongs in its acceptance
  tests and exact public types.

## Comments

- Explain the invariant or failure being guarded, not the next line.
- Comment only at trust boundaries and non-obvious Zod behavior.
- Use terse, full sentences in the present tense.
- Never preserve design history in source comments.
