import { describe, expect, it, jest } from "@jest/globals";
import type { MobileApiClient } from "@/api/client";
import { cachedStages, rememberStages } from "./stages-cache";
import { stagesFixture } from "./stages-fixture.test-helper";
describe("Stage cache ownership", () => {
  it("never exposes another user or client, or replaces newer confirmed data with an older receipt", () => {
    const client = {
        read: jest.fn(),
        request: jest.fn(),
      } as unknown as MobileApiClient,
      otherClient = { ...client };
    const list = stagesFixture();
    rememberStages(client, "owner", list);
    expect(cachedStages(client, "owner")).toEqual(list);
    expect(cachedStages(client, "other")).toBeNull();
    expect(cachedStages(otherClient, "owner")).toBeNull();
    rememberStages(client, "owner", { ...list, listVersion: 99 });
    rememberStages(client, "owner", list);
    expect(cachedStages(client, "owner")?.listVersion).toBe(99);
    rememberStages(client, "other", { ...list, listVersion: 1 });
    expect(cachedStages(client, "owner")).toBeNull();
    expect(cachedStages(client, "other")?.listVersion).toBe(1);
  });
});
