# @b2m9/zod-views

Derive safe `create`, `update`, and `read` schemas from one Zod object.

The usual PATCH schema can silently reset stored data:

```ts
import { z } from "zod";
const status = z.enum(["draft", "live"]).default("draft");
const TaskCore = z.object({ id: z.uuid(), title: z.string(), status });
const update = TaskCore.omit({ id: true }).partial();
update.parse({ title: "Q3 Report" }); // { title: "Q3 Report", status: "draft" }
```

Merge that parsed patch into an existing task and its omitted status becomes
`draft`. Zod applies defaults inside optional object fields by design. That is
useful for create input, but dangerous at a PATCH boundary.

`defineViews` shields every update field:

```ts
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
  // error: internalNotes is missing
});
```

Hand-written `pick`, `omit`, and `partial` chains can express the same schemas.
They do not require every field to be classified. This package does.

## Install

```sh
pnpm add @b2m9/zod-views zod
```

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
```

Each field gets one role:

| Role                 | Create | Update | Read |
| -------------------- | ------ | ------ | ---- |
| `mutable`            | yes    | yes    | yes  |
| `mutable hidden`     | yes    | yes    | no   |
| `create-only`        | yes    | no     | yes  |
| `create-only hidden` | yes    | no     | no   |
| `server`             | no     | no     | yes  |
| `server hidden`      | no     | no     | no   |

Writability controls create and update. `hidden` controls read.

## API

The public API is `defineViews` and the `FieldsFor` type. The function accepts a
plain core object and its exhaustive table. It returns three ordinary,
unrefined Zod objects.

For a table declared separately, use the package's only exported type:

```ts
import { defineViews, type FieldsFor } from "@b2m9/zod-views";

const fields = { id: "server", title: "mutable" } satisfies FieldsFor<typeof TaskCore>;
const Task = defineViews(TaskCore, fields);
```

## Semantics

| View     | Fields                         | Boundary            |
| -------- | ------------------------------ | ------------------- |
| `create` | mutable and create-only        | strict              |
| `update` | mutable, shielded and optional | strict              |
| `read`   | every non-hidden field         | strips unknown keys |

The update shield is `z.union([z.undefined(), field]).optional()`. An absent
JSON property takes the `undefined` branch before the original field can run.
Defaults, transforms, and pipes cannot inject a value for that absent field.
A provided non-`undefined` value still uses the original schema. Create keeps
defaults. Read validates visible fields while stripping hidden and unknown keys.

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

Use plain Zod for unions, commands, events, search parameters, and one-off
request bodies. They do not need an entity view table.

## Guardrails

Create and update inputs are strict. Unknown keys are rejected so typos surface.
This also means echoing a fetched entity into a write view fails by design.
Send only writable fields.

Hoisted tables need `satisfies FieldsFor<typeof Core>` or `as const`. Otherwise,
their role strings widen to `string`.

Empty updates are valid. Use the `NonEmpty` refinement above if your API rejects
them.

Explicit `undefined` is accepted and preserved as `{ field: undefined }`, as
with a Zod partial. JSON request bodies cannot contain `undefined`. If your
merge distinguishes absence from `undefined`, drop those keys before merging.

Read validates as well as strips. A visible field with invalid stored data
throws instead of returning a sanitized partial row.

A wrong-type update value produces Zod's native `invalid_union` issue.
Constraint failures remain direct issues. Message wording is not promised.

The core must be a plain object without refinements or pipes. Refine the
derived view that owns the policy instead.

Every core field must be classified. The repetition is the audit.

The peer range is `zod@^4.4.3`.

## License

MIT © 2026 Bob Massarczyk
