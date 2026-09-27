import { expect, test } from "vite-plus/test";
import { z } from "zod";

// Keeping package code out of canaries makes their failures evidence of Zod movement.
test("undefined-first shielding prevents the guarded schema from executing", () => {
  let executions = 0;
  const guarded = z
    .string()
    .default("injected")
    .transform(() => {
      executions += 1;
      throw new Error("field schema executed");
    });
  const shield = z.union([z.never().optional(), guarded]).optional();
  const update = z.strictObject({ guarded: shield });

  expect(shield.parse(undefined)).toBeUndefined();
  expect(update.parse({})).toEqual({});
  expect(executions).toBe(0);
});

test("an optional never accepts only undefined and renders as an empty-match schema", () => {
  const absent = z.never().optional();

  expect(absent.parse(undefined)).toBeUndefined();
  // A defined value accepted here would skip the field schema in the shield.
  for (const value of [null, false, 0, "", {}]) {
    expect(absent.safeParse(value).success).toBe(false);
  }
  expect(z.toJSONSchema(absent)).toMatchObject({ not: {} });
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
