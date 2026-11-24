import { describe, it, expect, vi } from "vitest";

const nextServer = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => nextServer);

import { runAfterResponse } from "../runAfterResponse";

describe("runAfterResponse", () => {
  it("schedules the work with after() inside a request", async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    runAfterResponse(work);
    expect(work).not.toHaveBeenCalled();
    await nextServer.after.mock.calls[0][0]();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("runs the work in the background outside a request, where after() throws", async () => {
    nextServer.after.mockImplementationOnce(() => {
      throw new Error("outside a request scope");
    });
    const work = vi.fn().mockResolvedValue(undefined);
    runAfterResponse(work);
    await new Promise((r) => setTimeout(r, 0));
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("never lets the work's error escape", async () => {
    const work = vi.fn().mockRejectedValue(new Error("boom"));
    runAfterResponse(work);
    await expect(nextServer.after.mock.calls.at(-1)![0]()).resolves.toBeUndefined();
  });
});
