import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  test: {
    include: ["tests/{runtime,canary}.test.ts"],
    typecheck: {
      enabled: true,
      include: ["tests/types.test.ts"],
      tsconfig: "./tsconfig.test.json",
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        // esbuild cannot tree-shake the `z` namespace object.
        files: ["src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "zod",
                  importNames: ["z", "default"],
                  message: "Import Zod APIs by name so consumer bundles can tree-shake Zod.",
                  allowTypeImports: true,
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {},
});
