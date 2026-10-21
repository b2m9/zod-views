import { expect, test } from "vite-plus/test";
import { z } from "zod";

// Keeping package code out of canaries makes their failures evidence of Zod movement.
test("optional nonoptional shielding prevents the guarded schema from executing", () => {
  let executions = 0;
  const guarded = z
    .string()
    .default("injected")
    .transform(() => {
      executions += 1;
      throw new Error("field schema executed");
    });
  const update = z.strictObject({ guarded: z.optional(z.nonoptional(guarded)) });

  expect(update.parse({})).toEqual({});
  expect(executions).toBe(0);

  const parsed = update.parse({ guarded: undefined });
  expect(Object.hasOwn(parsed, "guarded")).toBe(true);
  expect(executions).toBe(0);
});

test("nonoptional passes provided values through and rejects an undefined result", () => {
  expect(z.nonoptional(z.string().default("injected")).parse("x")).toBe("x");

  const result = z.nonoptional(z.string().transform(() => undefined)).safeParse("x");
  expect(result.success).toBe(false);
  expect(result.error?.issues[0]?.code).toBe("invalid_type");
});

test("optional nonoptional renders as the plain field in JSON Schema", () => {
  const shape = { k: z.optional(z.nonoptional(z.string().min(1))) };

  expect(z.toJSONSchema(z.object(shape), { io: "input" }).properties?.k).toEqual({
    type: "string",
    minLength: 1,
  });
});

test("strict and strip object constructors retain their boundary semantics", () => {
  const shape = { title: z.string() };
  const input = { title: "kept", unknown: "extra" };

  expect(() => z.strictObject(shape).parse(input)).toThrow();
  expect(z.object(shape).parse(input)).toEqual({ title: "kept" });
});

test("object composition distinguishes plain and refined objects", () => {
  const plain = z.object({ title: z.string() });
  const refined = plain.refine(() => true);

  expect(() => plain.pick({})).not.toThrow();
  expect(() => refined.pick({})).toThrow();
});
