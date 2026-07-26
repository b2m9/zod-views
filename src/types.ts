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

/** A widened role cannot produce one return type that stays true at runtime. */
export type NarrowRoles<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"]]: [Fields[K]] extends [never]
    ? never
    : IsUnion<Fields[K]> extends false
      ? unknown
      : "Use one literal role; declare hoisted tables with `satisfies FieldsFor<typeof Core>` or `as const`.";
};

type Shielded<Field extends z.ZodRawShape[string]> = z.ZodOptional<
  z.ZodUnion<readonly [z.ZodUndefined, Field]>
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
