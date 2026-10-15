import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),

  } },
  test: { globals: true, environment: "jsdom", include: ["src/components/inbox-create-form.vitest.tsx"] },
};
