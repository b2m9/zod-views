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
});

const ProjectCore = z.object({
  id: z.uuid(),
  name: z.string(),
  internalNotes: z.string(),
});

// @ts-expect-error internalNotes must be classified when the core changes.
defineViews(ProjectCore, {
  id: "server",
  name: "mutable",
});

defineViews(EntityCore, {
  id: "server",
  // @ts-expect-error role typos are outside the closed vocabulary.
  titleLength: "mutabel",
  status: "mutable",
  secret: "server hidden",
});
