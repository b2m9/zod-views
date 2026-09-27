# @b2m9/zod-views

Derive strict `create` and `update` inputs and a stripping `read` schema from
one Zod object and one exhaustive field-role table.

The usual PATCH schema can silently reset stored data:

```ts
import { z } from "zod";
const status = z.enum(["draft", "live"]).default("draft");
const TaskCore = z.object({ id: z.uuid(), title: z.string(), status });
const update = TaskCore.omit({ id: true }).partial();
update.parse({ title: "Q3 Report" }); // { title: "Q3 Report", status: "draft" }
```

The client sent a title. It got back a status. Merge that parsed patch into an
existing task and its omitted status becomes `draft`. Zod applies defaults
inside optional object fields by design. That is useful for create input, but
dangerous at a PATCH boundary.

`defineViews` gives every mutable update field an undefined-first shield:

```ts
import { defineViews } from "@b2m9/zod-views";

const Task = defineViews(TaskCore, {
  id: "server",
  title: "mutable",
  status: "mutable",
});

Task.update.parse({ title: "Q3 Report" }); // { title: "Q3 Report" }
Task.create.parse({ title: "New" }); // { title: "New", status: "draft" }
```

The table also prevents schema drift. Add a core field and TypeScript requires
you to classify it before the build passes:

```ts
const ProjectCore = z.object({
  id: z.uuid(),
  name: z.string(),
  internalNotes: z.string(),
});

defineViews(ProjectCore, {
  id: "server",
  name: "mutable",
  // error: Property 'internalNotes' is missing
});
```

You can build the same schemas by hand. This package makes two safety decisions
mandatory: every field is classified, and an omitted update field cannot run
its default.

## Install

```sh
pnpm add @b2m9/zod-views "zod@^4.4.3"
```

Supported environment: ESM, Node 22+, and `zod@^4.4.3`. Zod is the only peer
dependency.

## Usage

```ts
import { defineViews } from "@b2m9/zod-views";
import { z } from "zod";

const UserCore = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  email: z.email(),
  password: z.string(),
  displayName: z.string(),
  roleId: z.uuid(),
});

const User = defineViews(UserCore, {
  id: "server",
  orgId: "server hidden",
  email: "create-only",
  password: "create-only hidden",
  displayName: "mutable",
  roleId: "mutable",
});

type UserUpdate = z.infer<typeof User.update>;
// { displayName?: string | undefined; roleId?: string | undefined }
```

Each role combines writability with an optional visibility modifier:

| Role          | Create | Update | Read |
| ------------- | ------ | ------ | ---- |
| `mutable`     | yes    | yes    | yes  |
| `create-only` | yes    | no     | yes  |
| `server`      | no     | no     | yes  |

Append ` hidden` to any role to remove the field from `read`. Visibility never
changes writability.

## API

The public API is `defineViews` and the `FieldsFor` type. The function accepts a
plain core object and its exhaustive table. It returns three ordinary,
unrefined Zod objects.

For a table declared separately, use the package's only exported type:

```ts
import { defineViews, type FieldsFor } from "@b2m9/zod-views";

const fields = {
  id: "server",
  title: "mutable",
  status: "mutable",
} satisfies FieldsFor<typeof TaskCore>;
const Task = defineViews(TaskCore, fields);
```

Prefer `satisfies FieldsFor<typeof TaskCore>` for a hoisted table. An annotation
such as `: FieldsFor<typeof TaskCore>` widens every value to the full role
union. `defineViews` rejects that form because one widened role cannot determine
one exact view type. `as const` also preserves literal roles, but does not
validate the table until the call.

## Semantics

| View     | Fields                         | Boundary            |
| -------- | ------------------------------ | ------------------- |
| `create` | mutable and create-only        | strict              |
| `update` | mutable, shielded and optional | strict              |
| `read`   | every non-hidden field         | strips unknown keys |

The update shield is `z.union([z.never().optional(), field]).optional()`. An absent
JSON property never reaches the original field schema, so defaults, transforms,
and pipes cannot inject a value. A provided non-`undefined` value still
validates through the original schema.

The views add nothing that JSON Schema cannot represent. `z.toJSONSchema`
converts a view whenever it converts the core with the same options, such as
`io: "input"` for transforms. In `update`, each field renders as
`anyOf: [{ not: {} }, field]`. The first branch matches nothing, so the field's
own schema decides. The field branch keeps its own annotations, including
`default`, although `update` never applies one.

Create retains the original field schemas, including defaults. Read validates
visible fields while stripping hidden and unknown keys.

## Everything else is your own Zod

The views support normal Zod composition:

```ts
const RoleSchema = z.object({ id: z.uuid(), name: z.string() });
const UserExpanded = User.read.omit({ roleId: true }).extend({ role: RoleSchema });
const SignupInput = User.create.extend({ password: z.string().min(12) });
const NonEmpty = User.update.refine((patch) =>
  Object.values(patch).some((value) => value !== undefined),
);
```

## Use plain Zod instead

Use plain Zod when the thing is not one entity exposed three ways. Unions,
commands, events, search parameters, and one-off request bodies do not need an
entity view table.

## Guardrails

Create and update inputs are strict. Unknown keys are rejected so typos surface.
This also means echoing a fetched entity into a write view fails by design.
Send only writable fields.

Empty updates are valid. Use the `NonEmpty` refinement above if your API rejects
them.

Explicit `undefined` short-circuits the field schema and remains present as
`{ field: undefined }`. For a defaulted field this differs from `.partial()`,
which materializes the default. JSON request bodies cannot contain `undefined`.
If your merge distinguishes absence from `undefined`, drop those keys before
merging.

Read validates as well as strips. A visible field with invalid stored data
throws instead of returning a sanitized partial row.

A wrong-type update value produces Zod's native `invalid_union` issue.
Constraint failures remain direct issues. Message wording is not promised.

The core must be a plain object without refinements or pipes. Refine the
derived view that owns the policy instead.

Classify every field. The repetition is the audit; there is no opt-out. Missing,
stale, and invalid entries also throw at definition time for JavaScript callers.

## License

MIT © 2026 Bob Massarczyk
