// esbuild cannot tree-shake property access on the `z` namespace object, so named
// imports keep zod-views from pulling all of Zod into consumer bundles.
import { nonoptional, object, optional, strictObject, ZodObject, type ZodRawShape } from "zod";

import type { ExactBoundRoles, ExactRoles, FieldsFor, ViewsFor } from "./types.ts";

const roles = new Set([
  "mutable",
  "mutable hidden",
  "create-only",
  "create-only hidden",
  "server",
  "server hidden",
]);

declare const stored: unique symbol;
/** Carries a row type into inference; it holds no data. */
interface RowBinding<Row extends object> {
  readonly [stored]: (row: Row) => Row;
}

const binding = Object.freeze(Object.create(null) as object);

/** Binds a table to a stored row type, such as Drizzle's `typeof table.$inferSelect`. */
export function storedAs<Row extends object>(): RowBinding<Row> {
  return binding as RowBinding<Row>;
}

function assertPlainObject(core: unknown): asserts core is ZodObject {
  if (!(core instanceof ZodObject)) {
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
  Core extends ZodObject<ZodRawShape>,
  const Fields extends FieldsFor<Core>,
>(core: Core, fields: Fields & ExactRoles<Core, Fields>): ViewsFor<Core, Fields>;
/** Derives the same views and proves the core's output is the stored row, column by column. */
export function defineViews<
  Row extends object,
  Core extends ZodObject<ZodRawShape>,
  const Fields extends FieldsFor<Core, Row>,
>(
  core: Core,
  // Row is inferred from the marker alone, never from its own diagnostic.
  fields: Fields & NoInfer<ExactBoundRoles<Core, Fields, Row>>,
  row: RowBinding<Row>,
): ViewsFor<Core, Fields>;
export function defineViews(
  core: unknown,
  fields: Readonly<Record<string, unknown>>,
  row?: object,
): unknown {
  // Row keys are erased at runtime, so a binding only licenses `unmapped` entries.
  const bound = row !== undefined;
  if (bound && row !== binding) {
    throw new Error("The third argument must be storedAs<Row>(); defineViews takes no options.");
  }
  assertPlainObject(core);
  const shape = core.shape;

  // Null prototypes keep every legal Zod key as an own property during assignment.
  const create = Object.create(null) as Record<string, ZodRawShape[string]>;
  const update = Object.create(null) as Record<string, ZodRawShape[string]>;
  const read = Object.create(null) as Record<string, ZodRawShape[string]>;

  for (const [key, field] of Object.entries(shape)) {
    if (!Object.hasOwn(fields, key)) {
      throw new Error(`Field "${key}" is missing from the table; classify every core field.`);
    }

    const role = fields[key];
    if (bound && role === "unmapped") {
      throw new Error(
        `Field "${key}" is a core field; "unmapped" is only for row columns without a core field.`,
      );
    }
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
      // `nonoptional` hides the field's optional input, so `optional` returns
      // `undefined` itself before a default, prefault, or transform can observe
      // absence. The result renders as the plain field in JSON Schema.
      update[key] = optional(nonoptional(field));
    } else if (role.startsWith("create-only")) {
      create[key] = field;
    }
  }

  for (const key of Object.keys(fields)) {
    if (!Object.hasOwn(shape, key) && !(bound && fields[key] === "unmapped")) {
      throw new Error(
        bound
          ? `Field "${key}" is not in the core schema; remove it or classify the row column as "unmapped".`
          : `Field "${key}" is not in the core schema; remove it from the table.`,
      );
    }
  }

  // The keyed loop mirrors type filters the compiler cannot follow, so the
  // overloads assert the result. Inference tests pin the correspondence.
  return {
    create: strictObject(create),
    update: strictObject(update),
    read: object(read),
  };
}

export type { FieldsFor } from "./types.ts";
