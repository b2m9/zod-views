import type { z } from "zod";

type Writability = "mutable" | "create-only" | "server";
type FieldRole = Writability | `${Writability} hidden`;
type WritabilityOf<Role> = Role extends `${infer Writable extends Writability} hidden`
  ? Writable
  : Role;

type CoreFields<Core extends z.ZodObject<z.ZodRawShape>> = {
  [K in keyof Core["shape"]]: FieldRole;
};

declare const unbound: unique symbol;
/** Stands in for the row type when no row is bound. */
interface Unbound {
  readonly [unbound]: true;
}

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

/** Only a finite set of string keys can be classified exhaustively. */
type InvalidRow<Row> =
  IsAny<Row> extends true
    ? true
    : [Row] extends [never]
      ? true
      : true extends IsUnion<Row>
        ? true
        : string extends keyof Row
          ? true
          : [Exclude<keyof Row, string>] extends [never]
            ? false
            : true;

/**
 * Adding a core field stays a compile error until its boundary role is explicit.
 * A bound row adds the same requirement for every column without a core field.
 */
export type FieldsFor<Core extends z.ZodObject<z.ZodRawShape>, Row extends object = Unbound> =
  // `Unbound` is invalid by its symbol key, so it shares the core-only branch.
  InvalidRow<Row> extends true
    ? CoreFields<Core>
    : CoreFields<Core> & {
        [K in Exclude<keyof Row, keyof Core["shape"]>]-?: "unmapped";
      };

type WidenedKeys<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = {
  [K in keyof Core["shape"]]: [Fields[K]] extends [never]
    ? K
    : IsUnion<Fields[K]> extends false
      ? never
      : K;
}[keyof Core["shape"]];

type StaleKeys<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = Exclude<
  keyof Fields,
  keyof Core["shape"]
>;

/** Structural constraints otherwise admit stale keys and ambiguous role unions. */
export type ExactRoles<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = [
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

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type MismatchedColumns<Core extends z.ZodObject<z.ZodRawShape>, Row extends object> = {
  [K in keyof Core["shape"] & keyof Row]-?: IsAny<z.output<Core["shape"][K]>> extends true
    ? K
    : IsAny<Row[K]> extends true
      ? K
      : // Comparing picked properties keeps key optionality in the comparison.
        Same<Pick<z.output<Core>, K & keyof z.output<Core>>, Pick<Row, K>> extends true
        ? never
        : K;
}[keyof Core["shape"] & keyof Row];

/** A bound table proves that the core's output is the stored row, column by column. */
export type ExactBoundRoles<
  Core extends z.ZodObject<z.ZodRawShape>,
  Fields extends CoreFields<Core>,
  Row extends object,
> =
  InvalidRow<Row> extends true
    ? {
        "zod-views: bind a finite object row type; any, never, unions, and index signatures cannot be classified": Row;
      }
    : [Exclude<keyof Fields, keyof Core["shape"] | keyof Row>] extends [never]
      ? [WidenedKeys<Core, Fields>] extends [never]
        ? [Exclude<keyof Core["shape"], keyof Row>] extends [never]
          ? [MismatchedColumns<Core, Row>] extends [never]
            ? unknown
            : {
                "zod-views: core field outputs differ from row columns in type or optionality": MismatchedColumns<
                  Core,
                  Row
                >;
              }
          : {
              "zod-views: core fields that are not row columns": Exclude<
                keyof Core["shape"],
                keyof Row
              >;
            }
        : {
            "zod-views: use one literal role per field; declare hoisted tables with `satisfies FieldsFor<typeof Core, Row>` or `as const`": WidenedKeys<
              Core,
              Fields
            >;
          }
      : {
          "zod-views: remove table entries that name no core field or row column": Exclude<
            keyof Fields,
            keyof Core["shape"] | keyof Row
          >;
        };

type Shielded<Field extends z.ZodRawShape[string]> = z.ZodOptional<z.ZodNonOptional<Field>>;

type CreateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = {
  [
    K in keyof Core["shape"] as WritabilityOf<Fields[K]> extends "server" ? never : K
  ]: Core["shape"][K];
};

type UpdateShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = {
  [K in keyof Core["shape"] as WritabilityOf<Fields[K]> extends "mutable" ? K : never]: Shielded<
    Core["shape"][K]
  >;
};

type ReadShape<Core extends z.ZodObject<z.ZodRawShape>, Fields extends CoreFields<Core>> = {
  [
    K in keyof Core["shape"] as Fields[K] extends `${Writability} hidden` ? never : K
  ]: Core["shape"][K];
};

type StrictObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.strictObject<Shape>>;

type StripObject<Shape extends z.ZodRawShape> = ReturnType<typeof z.object<Shape>>;

export interface ViewsFor<
  Core extends z.ZodObject<z.ZodRawShape>,
  Fields extends CoreFields<Core>,
> {
  create: StrictObject<CreateShape<Core, Fields>>;
  update: StrictObject<UpdateShape<Core, Fields>>;
  read: StripObject<ReadShape<Core, Fields>>;
}
