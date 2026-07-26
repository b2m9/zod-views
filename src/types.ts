import type { z } from "zod";

type Writability = "mutable" | "create-only" | "server";
type FieldRole = Writability | `${Writability} hidden`;
type HiddenRole = `${Writability} hidden`;
type CreateRole = "mutable" | "mutable hidden" | "create-only" | "create-only hidden";
type MutableRole = "mutable" | "mutable hidden";

/** Adding a core field stays a compile error until its boundary role is explicit. */
export type FieldsFor<Core extends z.ZodObject<z.ZodRawShape>> = {
  [K in keyof Core["shape"]]: FieldRole;
};

type CreateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as Fields[K] extends CreateRole ? K : never]: Core["shape"][K];
};

type UpdateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as Fields[K] extends MutableRole ? K : never]: z.ZodOptional<
    z.ZodUnion<readonly [z.ZodUndefined, Core["shape"][K]]>
  >;
};

type ReadShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> = {
  [K in keyof Core["shape"] as Fields[K] extends HiddenRole ? never : K]: Core["shape"][K];
};

type StrictObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.strictObject<Shape>>;

type StripObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.object<Shape>>;

export interface ViewsFor<Core extends z.ZodObject<z.ZodRawShape>, Fields extends FieldsFor<Core>> {
  create: StrictObject<CreateShape<Core, Fields>>;
  update: StrictObject<UpdateShape<Core, Fields>>;
  read: StripObject<ReadShape<Core, Fields>>;
}
