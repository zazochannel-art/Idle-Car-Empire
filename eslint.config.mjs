import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // No import cycles (audit P3). The production core below still has a few that are real mutual
  // recursion (a plant's upgrade starts a construction, a finished construction makes a plant…):
  // they stay listed here until that core is split. A cycle through any other file fails the lint.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/game/engine/{chain,city,construction,live,racing,modifiers,economy}.ts"],
    rules: { "import/no-cycle": ["error", { ignoreExternal: true }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // native app projects: Gradle/Xcode files and the game's build copied into them
    "android/**",
    "ios/**",
  ]),
]);

export default eslintConfig;
