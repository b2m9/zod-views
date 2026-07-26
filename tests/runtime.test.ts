import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineViews } from "../src/index.ts";

const defineViewsFromJs = defineViews as unknown as (
  core: unknown,
  fields: Record<string, unknown>,
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
  test("wrong-type updates retain the native union issue", () => {
    const Core = z.object({ count: z.number().min(1) });
    const Views = defineViews(Core, { count: "mutable" });

    const result = Views.update.safeParse({ count: "wrong" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe("invalid_union");
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
  ])("plain JavaScript $name tables throw with the field name", ({ fields, field }) => {
    const error = captureError(() => defineViewsFromJs(z.object({ title: z.string() }), fields));

    expect(error.constructor).toBe(Error);
    expect(error.message).toContain(field);
  });

  test.each([
    z.object({ title: z.string() }).refine(() => true),
    z.object({ title: z.string() }).pipe(z.object({ title: z.string() })),
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

  test("explicit undefined bypasses the field and remains present", () => {
    const parsed = Views.update.parse({ status: undefined });

    expect(parsed).toEqual({ status: undefined });
    expect(Object.hasOwn(parsed, "status")).toBe(true);
  });

  test("provided valid values use the original field schema", () => {
    expect(Views.update.parse({ title: "kept" })).toEqual({ title: "kept" });
  });

  test("composition remains ordinary Zod", () => {
    expect(Views.update.omit({ title: true }).parse({ status: "live" })).toEqual({
      status: "live",
    });
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
