import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "edge-runtime", include: ["test/googleCalendarAutomation.vitest.ts", "test/siteInbox.vitest.ts", "test/inboxBatch.vitest.ts"] } });


