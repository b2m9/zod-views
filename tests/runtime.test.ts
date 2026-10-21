import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineViews, storedAs } from "../src/index.ts";

const defineViewsFromJs = defineViews as unknown as (
  core: unknown,
  fields: Record<string, unknown>,
  row?: unknown,
) => unknown;

function captureError(operation: () => unknown): Error {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the operation to throw.");
}

describe("stop-ship runtime gates", () => {
  test("wrong-type updates retain the field's direct issue", () => {
    const Core = z.object({ count: z.number().min(1) });
    const Views = defineViews(Core, { count: "mutable" });

    const result = Views.update.safeParse({ count: "wrong" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe("invalid_type");
      expect(result.error.issues[0]?.path).toEqual(["count"]);
    }
  });

  test("constraint failures retain their direct issue", () => {
    const Core = z.object({ count: z.number().min(1) });
    const Views = defineViews(Core, { count: "mutable" });

    const result = Views.update.safeParse({ count: 0 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe("too_small");
      expect(result.error.issues[0]?.path).toEqual(["count"]);
    }
  });
});

describe("definition-time checks", () => {
  test.each([
    {
      name: "missing",
      fields: {},
      field: "title",
    },
    {
      name: "stale",
      fields: { title: "mutable", removed: "server" },
      field: "removed",
    },
    {
      name: "invalid",
      fields: { title: "sometimes" },
      field: "title",
    },
    {
      name: "invalid non-string",
      fields: { title: Object.create(null) },
      field: "title",
    },
  ])("plain JavaScript $name tables throw with the field name", ({ fields, field }) => {
    const error = captureError(() => defineViewsFromJs(z.object({ title: z.string() }), fields));

    expect(error.constructor).toBe(Error);
    expect(error.message).toContain(field);
  });

  test("invalid role errors include the received value", () => {
    expect(() => defineViewsFromJs(z.object({ title: z.string() }), { title: "mutabel" })).toThrow(
      'invalid role "mutabel"',
    );
  });

  test("inherited Object.prototype values cannot classify a field", () => {
    const error = captureError(() => defineViewsFromJs(z.object({ toString: z.string() }), {}));

    expect(error.message).toContain('"toString" is missing');
  });

  const PlainCore = z.object({ title: z.string() });

  test.each([
    PlainCore.refine(() => true),
    PlainCore.superRefine(() => {}),
    PlainCore.check(() => {}),
    PlainCore.pipe(PlainCore),
    z.string(),
  ])("refined, piped, and non-object cores name the fix", (core) => {
    expect(() => defineViewsFromJs(core, { title: "mutable" })).toThrow(
      /refine the derived views instead/i,
    );
  });
});

describe("role derivation", () => {
  const Core = z.object({
    mutable: z.string(),
    mutableHidden: z.string(),
    createOnly: z.string(),
    createOnlyHidden: z.string(),
    server: z.string(),
    serverHidden: z.string(),
  });

  const Views = defineViews(Core, {
    mutable: "mutable",
    mutableHidden: "mutable hidden",
    createOnly: "create-only",
    createOnlyHidden: "create-only hidden",
    server: "server",
    serverHidden: "server hidden",
  });

  test.each([
    ["mutable", true, true, true],
    ["mutableHidden", true, true, false],
    ["createOnly", true, false, true],
    ["createOnlyHidden", true, false, false],
    ["server", false, false, true],
    ["serverHidden", false, false, false],
  ] as const)("%s has the contracted view membership", (field, create, update, read) => {
    expect(Object.hasOwn(Views.create.shape, field)).toBe(create);
    expect(Object.hasOwn(Views.update.shape, field)).toBe(update);
    expect(Object.hasOwn(Views.read.shape, field)).toBe(read);
  });

  test("computed prototype-named fields retain their membership", () => {
    const PrototypeCore = z.object({
      ["__proto__"]: z.string(),
      normal: z.string(),
    });
    const PrototypeViews = defineViews(PrototypeCore, {
      ["__proto__"]: "mutable",
      normal: "mutable",
    });

    expect(Object.hasOwn(PrototypeViews.create.shape, "__proto__")).toBe(true);
    expect(Object.hasOwn(PrototypeViews.update.shape, "__proto__")).toBe(true);
    expect(Object.hasOwn(PrototypeViews.read.shape, "__proto__")).toBe(true);
  });
});

describe("update shield", () => {
  const DeepDefault = z
    .object({
      nested: z.string().default("nested"),
    })
    .default({ nested: "outer" })
    .pipe(z.object({ nested: z.string() }));

  const Core = z.object({
    status: z.enum(["draft", "live"]).default("draft"),
    settings: DeepDefault,
    title: z.string().min(1),
  });

  const Views = defineViews(Core, {
    status: "mutable",
    settings: "mutable",
    title: "mutable",
  });

  test("absent defaults do not enter a patch", () => {
    expect(Views.update.parse({})).toEqual({});
  });

  test("absent fields never execute their original schema", () => {
    let executions = 0;
    const guarded = z
      .string()
      .default("injected")
      .transform(() => {
        executions += 1;
        throw new Error("field schema executed");
      });
    const GuardedViews = defineViews(z.object({ guarded }), { guarded: "mutable" });

    expect(GuardedViews.update.parse({})).toEqual({});
    expect(executions).toBe(0);
  });

  test("explicit undefined bypasses the field and remains present", () => {
    const parsed = Views.update.parse({ status: undefined });

    expect(parsed).toEqual({ status: undefined });
    expect(Object.hasOwn(parsed, "status")).toBe(true);
  });

  test("provided valid values use the original field schema", () => {
    expect(Views.update.parse({ title: "kept" })).toEqual({ title: "kept" });
  });

  test("provided values that transform to undefined are rejected", () => {
    const Cleared = z.object({ cleared: z.string().transform(() => undefined) });
    const ClearedViews = defineViews(Cleared, { cleared: "mutable" });

    const result = ClearedViews.update.safeParse({ cleared: "value" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe("invalid_type");
      expect(result.error.issues[0]?.path).toEqual(["cleared"]);
    }
  });

  const SchemaCore = z.object({
    title: z.string().min(1).describe("Shown in task lists"),
    status: z.enum(["draft", "live"]).default("draft"),
    titleLength: z.string().transform((value) => value.length),
  });

  const SchemaViews = defineViews(SchemaCore, {
    title: "mutable",
    status: "mutable",
    titleLength: "mutable",
  });

  test.each([
    ["input", SchemaCore, SchemaViews.update],
    // Output JSON Schema cannot represent transforms.
    [
      "output",
      SchemaCore.omit({ titleLength: true }),
      SchemaViews.update.omit({ titleLength: true }),
    ],
  ] as const)("update fields render as their core fields for io %s", (io, core, update) => {
    const coreSchema = z.toJSONSchema(core, { io });
    const updateSchema = z.toJSONSchema(update, { io });
    const keys = Object.keys(core.shape);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(updateSchema.properties?.[key]).toEqual(coreSchema.properties?.[key]);
    }
    expect(updateSchema.required).toBeUndefined();
  });

  test("composition remains ordinary Zod", () => {
    expect(Views.update.omit({ title: true }).parse({ status: "live" })).toEqual({
      status: "live",
    });
  });

  test("views extend and refine like any object", () => {
    const Extended = Views.update.extend({ note: z.string() });
    const NonEmpty = Views.update.refine((patch) =>
      Object.values(patch).some((value) => value !== undefined),
    );

    expect(Extended.parse({ title: "kept", note: "added" })).toEqual({
      title: "kept",
      note: "added",
    });
    expect(NonEmpty.safeParse({}).success).toBe(false);
    expect(NonEmpty.parse({ status: "live" })).toEqual({ status: "live" });
  });

  // The README's recipe for tooling that reads `default` as an applied value.
  const withoutUpdateDefaults = (view: z.ZodObject) =>
    z.toJSONSchema(view, {
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema instanceof z.ZodOptional && zodSchema.unwrap() instanceof z.ZodNonOptional) {
          delete jsonSchema.default;
        }
      },
    });

  test("the default override strips update defaults and keeps create defaults", () => {
    const status = z.enum(["draft", "live"]).default("draft");
    const DefaultViews = defineViews(z.object({ status }), { status: "mutable" });

    expect(withoutUpdateDefaults(DefaultViews.update).properties?.status).toEqual({
      type: "string",
      enum: ["draft", "live"],
    });
    expect(withoutUpdateDefaults(DefaultViews.create).properties?.status).toHaveProperty(
      "default",
      "draft",
    );
  });

  test("registered update fields render as refs whose definitions keep defaults", () => {
    const tier = z.enum(["free", "pro"]).default("free").meta({ id: "ZodViewsTier" });
    const TierViews = defineViews(z.object({ tier }), { tier: "mutable" });

    const schema = withoutUpdateDefaults(TierViews.update);

    expect(schema.properties?.tier).toEqual({ $ref: "#/$defs/ZodViewsTier" });
    expect(schema.$defs?.ZodViewsTier).toHaveProperty("default", "free");
  });
});

describe("fixed boundaries", () => {
  test("create rejects typo keys", () => {
    const Core = z.object({ title: z.string() });
    const Views = defineViews(Core, { title: "mutable" });

    const result = Views.create.safeParse({ title: "kept", titel: "typo" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ code: "unrecognized_keys", keys: ["titel"] }),
      );
    }
  });

  test.each(["create", "update"] as const)("%s rejects server fields", (view) => {
    const Core = z.object({ id: z.uuid(), title: z.string() });
    const Views = defineViews(Core, { id: "server", title: "mutable" });

    expect(() =>
      Views[view].parse({
        id: "3f975ea5-df7b-4eb0-8585-ef6bf73de57d",
        title: "kept",
      }),
    ).toThrow();
  });

  test.each([
    ["object", z.object({ title: z.string(), secret: z.string() })],
    ["strictObject", z.strictObject({ title: z.string(), secret: z.string() })],
    ["looseObject", z.looseObject({ title: z.string(), secret: z.string() })],
  ])("read strips hidden fields from %s cores", (_name, core) => {
    const Views = defineViews(core, { title: "mutable", secret: "server hidden" });

    expect(Views.read.parse({ title: "kept", secret: "removed" })).toEqual({
      title: "kept",
    });
  });

  test("read validates visible row fields while stripping", () => {
    const Core = z.object({ count: z.number(), secret: z.string() });
    const Views = defineViews(Core, { count: "server", secret: "server hidden" });

    expect(() => Views.read.parse({ count: "dirty", secret: "removed" })).toThrow();
  });
});

test("definition and composition do not mutate the core or sibling views", () => {
  const Core = z.object({ id: z.uuid(), title: z.string() });
  const originalShape = Core.shape;
  const Views = defineViews(Core, { id: "server", title: "mutable" });

  Views.update.omit({ title: true });

  expect(Core.shape).toBe(originalShape);
  expect(Object.keys(Core.shape)).toEqual(["id", "title"]);
  expect(Object.keys(Views.update.shape)).toEqual(["title"]);
  expect(Object.keys(Views.create.shape)).toEqual(["title"]);
});

describe("row binding", () => {
  type PaymentRow = {
    id: string;
    amount: string;
    note: string | null;
    railReference: string | null;
  };

  const PaymentCore = z.object({
    id: z.uuid(),
    amount: z.codec(z.number(), z.string(), {
      decode: (wire) => wire.toFixed(2),
      encode: (stored) => Number(stored),
    }),
    note: z.string().nullable(),
  });

  const roles = { id: "server", amount: "create-only", note: "mutable" } as const;

  const Unbound = defineViews(PaymentCore, roles);
  const Bound = defineViews(
    PaymentCore,
    { ...roles, railReference: "unmapped" },
    storedAs<PaymentRow>(),
  );

  const row: PaymentRow = {
    id: "3f975ea5-df7b-4eb0-8585-ef6bf73de57d",
    amount: "12.50",
    note: null,
    railReference: "sepa-123",
  };

  test("every marker is one frozen object without data", () => {
    const marker = storedAs<PaymentRow>();

    expect(marker).toBe(storedAs<{ other: string }>());
    expect(Object.isFrozen(marker)).toBe(true);
    expect(Object.getPrototypeOf(marker)).toBeNull();
    expect(Reflect.ownKeys(marker)).toEqual([]);
  });

  test.each(["create", "update", "read"] as const)("bound %s matches the unbound view", (view) => {
    expect(Object.keys(Bound[view].shape)).toEqual(Object.keys(Unbound[view].shape));
    expect(z.toJSONSchema(Bound[view], { io: "input" })).toEqual(
      z.toJSONSchema(Unbound[view], { io: "input" }),
    );
  });

  test("unmapped columns stay out of every view", () => {
    expect(Bound.create.safeParse({ amount: 1, note: null, railReference: "x" }).success).toBe(
      false,
    );
    expect(Bound.update.safeParse({ railReference: "x" }).success).toBe(false);
    expect(Bound.read.parse({ ...row, amount: 12.5 })).toEqual({
      id: row.id,
      amount: "12.50",
      note: null,
    });
  });

  test("codec cores write the stored form and read through z.encode", () => {
    expect(Bound.create.parse({ amount: 12.5, note: null })).toEqual({
      amount: "12.50",
      note: null,
    });
    expect(Bound.update.parse({ note: "paid" })).toEqual({ note: "paid" });
    expect(z.encode(Bound.read, row)).toEqual({ id: row.id, amount: 12.5, note: null });
    expect(Bound.read.safeParse(row).success).toBe(false);
  });

  test("a bound one-way transform cannot read through z.encode", () => {
    const Core = z.object({ label: z.string().transform((value) => value.length) });
    const Views = defineViews(Core, { label: "server" }, storedAs<{ label: number }>());

    expect(() => z.encode(Views.read, { label: 3 })).toThrow(z.core.$ZodEncodeError);
  });

  test("unmapped on a core field names the field", () => {
    expect(() =>
      defineViewsFromJs(PaymentCore, { ...roles, note: "unmapped" }, storedAs()),
    ).toThrow('Field "note" is a core field; "unmapped" is only for row columns');
  });

  test("unmapped without a bound row is an invalid role", () => {
    expect(() => defineViewsFromJs(PaymentCore, { ...roles, note: "unmapped" })).toThrow(
      'Field "note" has invalid role "unmapped"',
    );
  });

  test("extra entries without a bound row stay stale", () => {
    expect(() => defineViewsFromJs(PaymentCore, { ...roles, railReference: "unmapped" })).toThrow(
      'Field "railReference" is not in the core schema; remove it from the table.',
    );
  });

  test("a bound row accepts only unmapped on extra entries", () => {
    expect(() =>
      defineViewsFromJs(PaymentCore, { ...roles, railReference: "server" }, storedAs()),
    ).toThrow(
      'Field "railReference" is not in the core schema; remove it or classify the row column as "unmapped".',
    );
  });

  test("a bound row still requires every core field", () => {
    expect(() =>
      defineViewsFromJs(PaymentCore, { id: "server", amount: "create-only" }, storedAs()),
    ).toThrow('Field "note" is missing from the table');
  });

  test("row columns are erased, so JavaScript callers may leave them unclassified", () => {
    const Views = defineViewsFromJs(PaymentCore, roles, storedAs()) as typeof Unbound;

    expect(Object.keys(Views.read.shape)).toEqual(Object.keys(Unbound.read.shape));
  });

  test.each([{}, Object.freeze(Object.create(null)), null, "row", () => {}])(
    "a third argument other than the marker throws (case %#)",
    (marker) => {
      expect(() => defineViewsFromJs(PaymentCore, roles, marker)).toThrow(
        "The third argument must be storedAs<Row>()",
      );
    },
  );

  test("binding does not mutate the table", () => {
    const fields = { ...roles, railReference: "unmapped" } as const;
    const snapshot = { ...fields };

    defineViews(PaymentCore, fields, storedAs<PaymentRow>());

    expect(fields).toEqual(snapshot);
  });
});
