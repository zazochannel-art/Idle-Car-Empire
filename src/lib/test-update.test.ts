import { afterEach, describe, expect, it, vi } from "vitest";

// the test app, built as build 80 by the Android workflow
process.env.NEXT_PUBLIC_TEST_BUILD = "80";
let appId = "com.zazochannel.idlecarempire.debug";
vi.mock("@capacitor/app", () => ({ App: { getInfo: async () => ({ id: appId }) } }));
const { newerTestBuild, releaseBuild } = await import("./test-update");

const release = (body: string, ok = true) => vi.fn(async () => ({ ok, json: async () => ({ body }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  appId = "com.zazochannel.idlecarempire.debug";
});

describe("the test app's updates", () => {
  it("reads the build number from the release notes", () => {
    expect(releaseBuild("The latest build…\n\n<!-- test-build: 81 -->\n")).toBe(81);
    expect(releaseBuild("no marker")).toBe(0);
    expect(releaseBuild(undefined)).toBe(0);
  });

  it("offers a newer build, not the same or an older one", async () => {
    vi.stubGlobal("fetch", release("<!-- test-build: 82 -->"));
    expect(await newerTestBuild()).toBe(82);
    vi.stubGlobal("fetch", release("<!-- test-build: 80 -->"));
    expect(await newerTestBuild()).toBeNull();
    vi.stubGlobal("fetch", release("<!-- test-build: 79 -->"));
    expect(await newerTestBuild()).toBeNull();
  });

  it("offline or an error from GitHub: nothing offered", async () => {
    vi.stubGlobal("fetch", release("", false));
    expect(await newerTestBuild()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await newerTestBuild()).toBeNull();
  });

  it("the Google Play app never looks (Play updates it)", async () => {
    appId = "com.zazochannel.idlecarempire";
    const fetch = release("<!-- test-build: 99 -->");
    vi.stubGlobal("fetch", fetch);
    expect(await newerTestBuild()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
