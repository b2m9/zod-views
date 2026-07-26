import { z } from "zod";

import type { ExactRoles, FieldsFor, ViewsFor } from "./types.ts";

const roles = new Set([
  "mutable",
  "mutable hidden",
  "create-only",
  "create-only hidden",
  "server",
  "server hidden",
]);

function assertPlainObject(core: unknown): asserts core is z.ZodObject {
  if (!(core instanceof z.ZodObject)) {
    throw new Error("Core must be a plain Zod object; refine the derived views instead.");
  }

  // Public composition detects object refinements without coupling to Zod internals.
  try {
    core.pick({});
  } catch {
    throw new Error("Core must not contain refinements; refine the derived views instead.");
  }
}

function describeRole(role: unknown): string {
  switch (typeof role) {
    case "string":
      return JSON.stringify(role);
    case "undefined":
      return "undefined";
    case "boolean":
      return role ? "true" : "false";
    case "number":
    case "bigint":
    case "symbol":
      return role.toString();
    case "function":
      return "<function>";
    case "object":
      return role === null ? "null" : "<object>";
  }
}

/** Derives fixed write and read boundaries from one exhaustive field policy. */
export function defineViews<
  Core extends z.ZodObject<z.ZodRawShape>,
  const Fields extends FieldsFor<Core>,
>(core: Core, fields: Fields & ExactRoles<Core, Fields>): ViewsFor<Core, Fields> {
  assertPlainObject(core);
  const shape = core.shape;

  // Null prototypes keep every legal Zod key as an own property during assignment.
  const create = Object.create(null) as Record<string, z.ZodRawShape[string]>;
  const update = Object.create(null) as Record<string, z.ZodRawShape[string]>;
  const read = Object.create(null) as Record<string, z.ZodRawShape[string]>;

  for (const [key, field] of Object.entries(shape)) {
    if (!Object.hasOwn(fields, key)) {
      throw new Error(`Field "${key}" is missing from the table; classify every core field.`);
    }

    const role = fields[key];
    if (typeof role !== "string" || !roles.has(role)) {
      throw new Error(
        `Field "${key}" has invalid role ${describeRole(role)}; use "mutable", "create-only", or "server", optionally followed by " hidden".`,
      );
    }

    if (!role.endsWith(" hidden")) {
      read[key] = field;
    }
    if (role.startsWith("mutable")) {
      create[key] = field;
      // Undefined must win before a default or transform can observe absence.
      update[key] = z.union([z.undefined(), field]).optional();
    } else if (role.startsWith("create-only")) {
      create[key] = field;
    }
  }

  for (const key of Object.keys(fields)) {
    if (!Object.hasOwn(shape, key)) {
      throw new Error(`Field "${key}" is not in the core schema; remove it from the table.`);
    }
  }

  // The keyed loop mirrors type filters the compiler cannot follow.
  // Inference tests pin the asserted correspondence.
  return {
    create: z.strictObject(create),
    update: z.strictObject(update),
    read: z.object(read),
  } as unknown as ViewsFor<Core, Fields>;
}

export type { FieldsFor } from "./types.ts";
