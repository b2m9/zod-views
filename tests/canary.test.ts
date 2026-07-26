import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineViews } from "../src/index.ts";

test("undefined-first shielding prevents the second branch from executing", () => {
  let executions = 0;
  const guarded = z
    .string()
    .default("injected")
    .transform(() => {
      executions += 1;
      throw new Error("field schema executed");
    });
  const shield = z.union([z.undefined(), guarded]);
  const Core = z.object({ guarded });
  const Views = defineViews(Core, { guarded: "mutable" });

  expect(shield.parse(undefined)).toBeUndefined();
  expect(Views.update.parse({})).toEqual({});
  expect(executions).toBe(0);
});

test.each([
  ["create", "strict"],
  ["update", "strict"],
  ["read", "strip"],
] as const)("%s retains its fixed boundary construction", (view, boundary) => {
  const Core = z.looseObject({
    title: z.string(),
    secret: z.string(),
  });
  const Views = defineViews(Core, {
    title: "mutable",
    secret: "server hidden",
  });
  const input = { title: "kept", unknown: "extra" };

  if (boundary === "strict") {
    expect(() => Views[view].parse(input)).toThrow();
  } else {
    expect(Views[view].parse(input)).toEqual({ title: "kept" });
  }
});
