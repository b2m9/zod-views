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
  },
  fmt: {},
});
