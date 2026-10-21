import { expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import { defineViews, storedAs, type FieldsFor } from "../src/index.ts";

const EntityCore = z.object({
  id: z.uuid(),
  titleLength: z.string().transform((value) => value.length),
  status: z.enum(["draft", "live"]).default("draft"),
  secret: z.string(),
});

const Entity = defineViews(EntityCore, {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
});

const HandCreate = EntityCore.pick({
  titleLength: true,
  status: true,
});

const HandUpdate = z.strictObject({
  titleLength: z.optional(z.nonoptional(EntityCore.shape.titleLength)),
  status: z.optional(z.nonoptional(EntityCore.shape.status)),
});

const HandRead = EntityCore.omit({ secret: true });

const HoistedFields = {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
} satisfies FieldsFor<typeof EntityCore>;

const HoistedEntity = defineViews(EntityCore, HoistedFields);

const ConstFields = {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
} as const;

const ConstEntity = defineViews(EntityCore, ConstFields);

test("wrapper inference is identical to hand-written schemas", () => {
  expectTypeOf<z.input<typeof Entity.create>>().toEqualTypeOf<z.input<typeof HandCreate>>();
  expectTypeOf<z.output<typeof Entity.create>>().toEqualTypeOf<z.output<typeof HandCreate>>();

  expectTypeOf<z.input<typeof Entity.update>>().toEqualTypeOf<z.input<typeof HandUpdate>>();
  expectTypeOf<z.output<typeof Entity.update>>().toEqualTypeOf<z.output<typeof HandUpdate>>();

  expectTypeOf<z.input<typeof Entity.read>>().toEqualTypeOf<z.input<typeof HandRead>>();
  expectTypeOf<z.output<typeof Entity.read>>().toEqualTypeOf<z.output<typeof HandRead>>();

  expectTypeOf<z.input<typeof Entity.create>>().toEqualTypeOf<{
    titleLength: string;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.create>>().toEqualTypeOf<{
    titleLength: number;
    status: "draft" | "live";
  }>();
  expectTypeOf<z.input<typeof Entity.update>>().toEqualTypeOf<{
    titleLength?: string | undefined;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.update>>().toEqualTypeOf<{
    titleLength?: number | undefined;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.input<typeof Entity.read>>().toEqualTypeOf<{
    id: string;
    titleLength: string;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.read>>().toEqualTypeOf<{
    id: string;
    titleLength: number;
    status: "draft" | "live";
  }>();
});

const WrappedCore = z.object({
  note: z.string().optional(),
  archivedBy: z.string().nullable().default(null),
  priority: z.number().prefault(0),
  dueAt: z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (date) => date.toISOString(),
  }),
});

const Wrapped = defineViews(WrappedCore, {
  note: "mutable",
  archivedBy: "mutable",
  priority: "mutable",
  dueAt: "mutable",
});

const HandWrappedUpdate = z.strictObject({
  note: z.optional(z.nonoptional(WrappedCore.shape.note)),
  archivedBy: z.optional(z.nonoptional(WrappedCore.shape.archivedBy)),
  priority: z.optional(z.nonoptional(WrappedCore.shape.priority)),
  dueAt: z.optional(z.nonoptional(WrappedCore.shape.dueAt)),
});

test("shielded wrapper fields infer like the hand-written shield", () => {
  expectTypeOf<z.input<typeof Wrapped.update>>().toEqualTypeOf<z.input<typeof HandWrappedUpdate>>();
  expectTypeOf<z.output<typeof Wrapped.update>>().toEqualTypeOf<
    z.output<typeof HandWrappedUpdate>
  >();

  expectTypeOf<z.input<typeof Wrapped.update>>().toEqualTypeOf<{
    note?: string | undefined;
    archivedBy?: string | null | undefined;
    priority?: number | undefined;
    dueAt?: string | undefined;
  }>();
  expectTypeOf<z.output<typeof Wrapped.update>>().toEqualTypeOf<{
    note?: string | undefined;
    archivedBy?: string | null | undefined;
    priority?: number | undefined;
    dueAt?: Date | undefined;
  }>();
});

test("a hoisted exhaustive table preserves the same views", () => {
  expectTypeOf<typeof HoistedEntity>().toEqualTypeOf<typeof Entity>();
  expectTypeOf<typeof ConstEntity>().toEqualTypeOf<typeof Entity>();
});

export const rejectedTables = () => {
  const AnnotatedFields: FieldsFor<typeof EntityCore> = {
    id: "server",
    titleLength: "mutable",
    status: "mutable",
    secret: "server hidden",
  };

  // @ts-expect-error annotations erase the literal roles needed for exact view inference.
  defineViews(EntityCore, AnnotatedFields);

  const WidenedFields = {
    id: "server",
    titleLength: "mutable",
    status: "mutable",
    secret: "server hidden",
  };

  // @ts-expect-error hoisted role strings need satisfies or as const.
  defineViews(EntityCore, WidenedFields);

  const ConditionalFields = {
    id: "server",
    titleLength: "mutable" as "mutable" | "server",
    status: "mutable",
    secret: "server hidden",
  } as const;

  // @ts-expect-error a role union cannot determine one exact runtime view shape.
  defineViews(EntityCore, ConditionalFields);

  const NeverFields = {
    id: "server",
    titleLength: "mutable" as never,
    status: "mutable",
    secret: "server hidden",
  } as const;

  // @ts-expect-error never cannot name a runtime field role.
  defineViews(EntityCore, NeverFields);

  class AnnotatedClassFields implements FieldsFor<typeof EntityCore> {
    id: FieldsFor<typeof EntityCore>["id"] = "server";
    titleLength: FieldsFor<typeof EntityCore>["titleLength"] = "mutable";
    status: FieldsFor<typeof EntityCore>["status"] = "mutable";
    secret: FieldsFor<typeof EntityCore>["secret"] = "server hidden";

    helper(): void {}
  }

  // @ts-expect-error non-role members must not bypass widened own roles.
  defineViews(EntityCore, new AnnotatedClassFields());

  const ProjectCore = z.object({
    id: z.uuid(),
    name: z.string(),
    internalNotes: z.string(),
  });

  // @ts-expect-error internalNotes must be classified when the core changes.
  defineViews(ProjectCore, { id: "server", name: "mutable" });

  const TaskCore = z.object({ id: z.uuid(), title: z.string() });

  // @ts-expect-error role typos are outside the closed vocabulary.
  defineViews(TaskCore, { id: "server", title: "mutabel" });

  // @ts-expect-error a renamed core field leaves a stale inline entry behind.
  defineViews(TaskCore, { id: "server", title: "mutable", subtitle: "mutable" });

  const StaleFields = {
    id: "server",
    title: "mutable",
    subtitle: "mutable",
  } as const;

  // @ts-expect-error a stale entry survives as const and must fail at the call.
  defineViews(TaskCore, StaleFields);
};

// Shaped like Drizzle's `$inferSelect`: every column present, nullable columns
// as `T | null`, numeric as `string`, and untyped json as `unknown`.
type PaymentRow = {
  id: string;
  amount: string;
  createdAt: Date;
  note: string | null;
  meta: unknown;
  railReference: string | null;
};

const PaymentCore = z.object({
  id: z.uuid(),
  amount: z.codec(z.number(), z.string(), {
    decode: (wire) => wire.toFixed(2),
    encode: (stored) => Number(stored),
  }),
  createdAt: z.date().default(() => new Date()),
  note: z.string().nullable(),
  meta: z.unknown(),
});

const paymentRoles = {
  id: "server",
  amount: "create-only",
  createdAt: "server",
  note: "mutable",
  meta: "server hidden",
} as const;

const Payment = defineViews(PaymentCore, paymentRoles);

const BoundPayment = defineViews(
  PaymentCore,
  {
    id: "server",
    amount: "create-only",
    createdAt: "server",
    note: "mutable",
    meta: "server hidden",
    railReference: "unmapped",
  },
  storedAs<PaymentRow>(),
);

const HoistedPaymentFields = {
  ...paymentRoles,
  railReference: "unmapped",
} satisfies FieldsFor<typeof PaymentCore, PaymentRow>;

const HoistedBoundPayment = defineViews(PaymentCore, HoistedPaymentFields, storedAs<PaymentRow>());

test("a bound table derives the same views as the unbound table", () => {
  expectTypeOf<typeof BoundPayment>().toEqualTypeOf<typeof Payment>();
  expectTypeOf<typeof HoistedBoundPayment>().toEqualTypeOf<typeof Payment>();

  expectTypeOf<z.output<typeof BoundPayment.create>>().toEqualTypeOf<{
    amount: string;
    note: string | null;
  }>();
  expectTypeOf<z.output<typeof BoundPayment.read>>().toEqualTypeOf<{
    id: string;
    amount: string;
    createdAt: Date;
    note: string | null;
  }>();
});

test("a bound table without row-only columns needs no unmapped entries", () => {
  const Bound = defineViews(
    PaymentCore,
    paymentRoles,
    storedAs<Omit<PaymentRow, "railReference">>(),
  );

  expectTypeOf<typeof Bound>().toEqualTypeOf<typeof Payment>();
});

test("finite template keys, optional columns, and readonly columns bind", () => {
  const Audited = defineViews(
    PaymentCore,
    {
      ...paymentRoles,
      railReference: "unmapped",
      audit_created: "unmapped",
      audit_updated: "unmapped",
    },
    storedAs<PaymentRow & Record<`audit_${"created" | "updated"}`, string>>(),
  );
  const ReadonlyBound = defineViews(
    PaymentCore,
    { ...paymentRoles, railReference: "unmapped" },
    storedAs<Readonly<PaymentRow>>(),
  );

  const NoteCore = z.object({ note: z.string().optional() });
  const ExactNoteCore = z.object({ note: z.string().exactOptional() });
  const OptionalNote = defineViews(
    NoteCore,
    { note: "mutable" },
    storedAs<{ note?: string | undefined }>(),
  );
  const ExactNote = defineViews(ExactNoteCore, { note: "mutable" }, storedAs<{ note?: string }>());

  expectTypeOf<typeof Audited>().toEqualTypeOf<typeof Payment>();
  expectTypeOf<typeof ReadonlyBound>().toEqualTypeOf<typeof Payment>();
  expectTypeOf<typeof OptionalNote>().toEqualTypeOf(defineViews(NoteCore, { note: "mutable" }));
  expectTypeOf<typeof ExactNote>().toEqualTypeOf(defineViews(ExactNoteCore, { note: "mutable" }));
});

export const rejectedBindings = () => {
  const roles = { ...paymentRoles, railReference: "unmapped" } as const;

  // @ts-expect-error any cannot be classified.
  defineViews(PaymentCore, paymentRoles, storedAs<any>());

  // @ts-expect-error never cannot be classified.
  defineViews(PaymentCore, paymentRoles, storedAs<never>());

  // @ts-expect-error a union row has no single key set.
  defineViews(PaymentCore, roles, storedAs<PaymentRow | { id: string }>());

  // @ts-expect-error a subtype union is still a union.
  defineViews(PaymentCore, roles, storedAs<PaymentRow | (PaymentRow & { extra: string })>());

  // @ts-expect-error a string index signature has no finite key set.
  defineViews(PaymentCore, paymentRoles, storedAs<Record<string, unknown>>());

  // @ts-expect-error a number index signature has no finite key set.
  defineViews(PaymentCore, roles, storedAs<PaymentRow & { [index: number]: string }>());

  // @ts-expect-error a template pattern index signature has no finite key set.
  defineViews(PaymentCore, roles, storedAs<PaymentRow & { [K in `audit_${string}`]: string }>());

  // @ts-expect-error a numeric-string pattern index signature has no finite key set.
  defineViews(PaymentCore, roles, storedAs<PaymentRow & Record<`${number}`, string>>());

  defineViews(
    PaymentCore,
    // @ts-expect-error each key of a finite template union is a column to classify.
    { ...roles, audit_created: "unmapped" },
    storedAs<PaymentRow & Record<`audit_${"created" | "updated"}`, string>>(),
  );

  // @ts-expect-error symbol keys cannot be table entries.
  defineViews(PaymentCore, roles, storedAs<PaymentRow & { [Symbol.iterator]: string }>());

  // @ts-expect-error note is a core field that is not a row column.
  defineViews(PaymentCore, roles, storedAs<Omit<PaymentRow, "note">>());

  // @ts-expect-error railReference is a row column without a role.
  defineViews(PaymentCore, paymentRoles, storedAs<PaymentRow>());

  // @ts-expect-error an optional row column still needs a role.
  defineViews(PaymentCore, roles, storedAs<PaymentRow & { audit?: string }>());

  // @ts-expect-error stale names neither a core field nor a row column.
  defineViews(PaymentCore, { ...roles, stale: "unmapped" }, storedAs<PaymentRow>());

  // @ts-expect-error unmapped is not a core field role.
  defineViews(PaymentCore, { ...roles, note: "unmapped" }, storedAs<PaymentRow>());

  // @ts-expect-error a row-only column takes no view role.
  defineViews(PaymentCore, { ...roles, railReference: "server" }, storedAs<PaymentRow>());

  // @ts-expect-error unmapped has no hidden variant.
  defineViews(PaymentCore, { ...roles, railReference: "unmapped hidden" }, storedAs<PaymentRow>());

  // @ts-expect-error unmapped needs a bound row.
  defineViews(PaymentCore, roles);

  const AnnotatedRoles: FieldsFor<typeof PaymentCore, PaymentRow> = roles;

  // @ts-expect-error annotations erase the literal roles needed for exact view inference.
  defineViews(PaymentCore, AnnotatedRoles, storedAs<PaymentRow>());

  defineViews(
    PaymentCore,
    // @ts-expect-error a role union cannot determine one exact runtime view shape.
    { ...roles, note: "mutable" as "mutable" | "server" },
    storedAs<PaymentRow>(),
  );

  // @ts-expect-error an optional output may omit a key that every row has.
  defineViews(PaymentCore.extend({ note: z.string().optional() }), roles, storedAs<PaymentRow>());

  defineViews(
    PaymentCore.extend({ note: z.string().exactOptional() }),
    // @ts-expect-error an exact optional output may omit a key that every row has.
    roles,
    storedAs<PaymentRow>(),
  );

  defineViews(
    z.object({ label: z.string().exactOptional() }),
    // @ts-expect-error an exact optional output may omit a required column.
    { label: "mutable" },
    storedAs<{ label: string }>(),
  );

  defineViews(
    z.object({ label: z.string().optional() }),
    // @ts-expect-error an optional output may omit a required column that admits undefined.
    { label: "mutable" },
    storedAs<{ label: string | undefined }>(),
  );

  // @ts-expect-error a non-null output disagrees with a nullable column.
  defineViews(PaymentCore.extend({ note: z.string() }), roles, storedAs<PaymentRow>());

  // @ts-expect-error a numeric output disagrees with a numeric column stored as a string.
  defineViews(PaymentCore.extend({ amount: z.number() }), roles, storedAs<PaymentRow>());

  // @ts-expect-error z.json() is narrower than an unknown column.
  defineViews(PaymentCore.extend({ meta: z.json() }), roles, storedAs<PaymentRow>());

  // @ts-expect-error an any output proves nothing about the column.
  defineViews(PaymentCore.extend({ meta: z.any() }), roles, storedAs<PaymentRow>());

  defineViews(
    PaymentCore,
    // @ts-expect-error an any column proves nothing about the output.
    roles,
    storedAs<Omit<PaymentRow, "meta"> & { meta: any }>(),
  );

  const StateCore = z.object({ state: z.enum(["open", "settled"]) });

  // @ts-expect-error an enum output is narrower than a text column.
  defineViews(StateCore, { state: "server" }, storedAs<{ state: string }>());

  defineViews(StateCore, { state: "server" }, storedAs<{ state: "open" | "settled" }>());
};
