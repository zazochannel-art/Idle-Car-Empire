import { describe, expect, it, vi } from "vitest";

// A fake Local Notifications plugin made the way Capacitor makes one: it answers any
// method name, and one the phone doesn't have ("then" included) only fails.
const scheduled: { id: number; title: string }[] = [];
const methods: Record<string, (o?: { notifications: { id: number; title: string }[] }) => Promise<unknown>> = {
  checkPermissions: async () => ({ display: "granted" }),
  getPending: async () => ({ notifications: scheduled }),
  cancel: async (o) => {
    for (const x of o!.notifications) scheduled.splice(scheduled.findIndex((y) => y.id === x.id), 1);
  },
  schedule: async (o) => scheduled.push(...o!.notifications),
};
const plugin = new Proxy({}, { get: (_t, name) => methods[String(name)] ?? (() => Promise.reject(new Error(`"LocalNotifications.${String(name)}()" is not implemented`))) });
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugin }));
vi.mock("./platform", () => ({ isNativeApp: () => true }));

const { askNotify, cancelAway, scheduleAway } = await import("./notify");

describe("notifications while the game is closed", () => {
  it("the plugin loads, the notes are scheduled, and coming back takes them back", async () => {
    expect(await askNotify()).toBe(true);
    await scheduleAway([
      { at: Date.now() + 60_000, title: "Built", body: "" },
      { at: Date.now() + 120_000, title: "Offline limit", body: "" },
    ]);
    expect(scheduled.map((x) => [x.id, x.title])).toEqual([
      [1000, "Built"],
      [1001, "Offline limit"],
    ]);
    await cancelAway();
    expect(scheduled).toEqual([]);
  });
});
