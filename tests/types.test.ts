import { expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import { defineViews, type FieldsFor } from "../src/index.ts";

const EntityCore = z.object({
  id: z.uuid(),
  titleLength: z.string().transform((value) => value.length),
  status: z.enum(["draft", "live"]).default("draft"),
  secret: z.string(),
});

const Entity = defineViews(EntityCore, {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
});

const HandCreate = EntityCore.pick({
  titleLength: true,
  status: true,
});

const HandUpdate = z.strictObject({
  titleLength: z.union([z.undefined(), EntityCore.shape.titleLength]).optional(),
  status: z.union([z.undefined(), EntityCore.shape.status]).optional(),
});

const HandRead = EntityCore.omit({ secret: true });

const HoistedFields = {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
} satisfies FieldsFor<typeof EntityCore>;

const HoistedEntity = defineViews(EntityCore, HoistedFields);

const ConstFields = {
  id: "server",
  titleLength: "mutable",
  status: "mutable",
  secret: "server hidden",
} as const;

const ConstEntity = defineViews(EntityCore, ConstFields);

test("wrapper inference is identical to hand-written schemas", () => {
  expectTypeOf<z.input<typeof Entity.create>>().toEqualTypeOf<z.input<typeof HandCreate>>();
  expectTypeOf<z.output<typeof Entity.create>>().toEqualTypeOf<z.output<typeof HandCreate>>();

  expectTypeOf<z.input<typeof Entity.update>>().toEqualTypeOf<z.input<typeof HandUpdate>>();
  expectTypeOf<z.output<typeof Entity.update>>().toEqualTypeOf<z.output<typeof HandUpdate>>();

  expectTypeOf<z.input<typeof Entity.read>>().toEqualTypeOf<z.input<typeof HandRead>>();
  expectTypeOf<z.output<typeof Entity.read>>().toEqualTypeOf<z.output<typeof HandRead>>();

  expectTypeOf<z.input<typeof Entity.create>>().toEqualTypeOf<{
    titleLength: string;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.create>>().toEqualTypeOf<{
    titleLength: number;
    status: "draft" | "live";
  }>();
  expectTypeOf<z.input<typeof Entity.update>>().toEqualTypeOf<{
    titleLength?: string | undefined;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.update>>().toEqualTypeOf<{
    titleLength?: number | undefined;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.input<typeof Entity.read>>().toEqualTypeOf<{
    id: string;
    titleLength: string;
    status?: "draft" | "live" | undefined;
  }>();
  expectTypeOf<z.output<typeof Entity.read>>().toEqualTypeOf<{
    id: string;
    titleLength: number;
    status: "draft" | "live";
  }>();
});

test("a hoisted exhaustive table preserves the same views", () => {
  expectTypeOf<typeof HoistedEntity>().toEqualTypeOf<typeof Entity>();
  expectTypeOf<typeof ConstEntity>().toEqualTypeOf<typeof Entity>();
});

export const rejectedTables = () => {
  const AnnotatedFields: FieldsFor<typeof EntityCore> = {
    id: "server",
    titleLength: "mutable",
    status: "mutable",
    secret: "server hidden",
  };

  // @ts-expect-error annotations erase the literal roles needed for exact view inference.
  defineViews(EntityCore, AnnotatedFields);

  const ConditionalFields = {
    id: "server",
    titleLength: "mutable" as "mutable" | "server",
    status: "mutable",
    secret: "server hidden",
  } as const;

  // @ts-expect-error a role union cannot determine one exact runtime view shape.
  defineViews(EntityCore, ConditionalFields);

  class AnnotatedClassFields implements FieldsFor<typeof EntityCore> {
    id: FieldsFor<typeof EntityCore>["id"] = "server";
    titleLength: FieldsFor<typeof EntityCore>["titleLength"] = "mutable";
    status: FieldsFor<typeof EntityCore>["status"] = "mutable";
    secret: FieldsFor<typeof EntityCore>["secret"] = "server hidden";

    helper(): void {}
  }

  // @ts-expect-error non-role members must not bypass widened own roles.
  defineViews(EntityCore, new AnnotatedClassFields());

  const ProjectCore = z.object({
    id: z.uuid(),
    name: z.string(),
    internalNotes: z.string(),
  });

  // @ts-expect-error internalNotes must be classified when the core changes.
  defineViews(ProjectCore, { id: "server", name: "mutable" });

  const TaskCore = z.object({ id: z.uuid(), title: z.string() });

  // @ts-expect-error role typos are outside the closed vocabulary.
  defineViews(TaskCore, { id: "server", title: "mutabel" });
};
