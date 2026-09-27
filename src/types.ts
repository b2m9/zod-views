import type { z } from "zod";

type Writability = "mutable" | "create-only" | "server";
type FieldRole = Writability | `${Writability} hidden`;
type WritabilityOf<Role> = Role extends `${infer Writable extends Writability} hidden`
  ? Writable
  : Role;

/** Adding a core field stays a compile error until its boundary role is explicit. */
export type FieldsFor<Core extends z.ZodObject<z.ZodRawShape>> = {
  [K in keyof Core["shape"]]: FieldRole;
};

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type WidenedKeys<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"]]: [Fields[K]] extends [never]
    ? K
    : IsUnion<Fields[K]> extends false
      ? never
      : K;
}[keyof Core["shape"]];

type StaleKeys<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = Exclude<
  keyof Fields,
  keyof Core["shape"]
>;

/** Structural constraints otherwise admit stale keys and ambiguous role unions. */
export type ExactRoles<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = [
  StaleKeys<Core, Fields>,
] extends [never]
  ? [WidenedKeys<Core, Fields>] extends [never]
    ? unknown
    : {
        "zod-views: use one literal role per field; declare hoisted tables with `satisfies FieldsFor<typeof Core>` or `as const`": WidenedKeys<
          Core,
          Fields
        >;
      }
  : {
      "zod-views: remove table entries that name no core field": StaleKeys<Core, Fields>;
    };

type Shielded<Field extends z.ZodRawShape[string]> = z.ZodOptional<
  z.ZodUnion<readonly [z.ZodOptional<z.ZodNever>, Field]>
>;

type CreateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as WritabilityOf<Fields[K]> extends "server"
    ? never
    : K]: Core["shape"][K];
};

type UpdateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as WritabilityOf<Fields[K]> extends "mutable" ? K : never]: Shielded<
    Core["shape"][K]
  >;
};

type ReadShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as Fields[K] extends `${Writability} hidden`
    ? never
    : K]: Core["shape"][K];
};

type StrictObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.strictObject<Shape>>;

type StripObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.object<Shape>>;

export interface ViewsFor<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> {
  create: StrictObject<CreateShape<Core, Fields>>;
  update: StrictObject<UpdateShape<Core, Fields>>;
  read: StripObject<ReadShape<Core, Fields>>;
}
