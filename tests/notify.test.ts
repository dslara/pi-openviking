import { describe, test, expect } from "vitest";
import { notifyOnce } from "../src/shared/notify";

describe("notifyOnce", () => {
  test("notifies when ctx hasUI and ui.notify", () => {
    const notified: Array<{ msg: string; level: string }> = [];
    const ctx = {
      hasUI: true,
      ui: {
        notify: (msg: string, level: "info" | "warning" | "error") => {
          notified.push({ msg, level });
        },
      },
    };

    notifyOnce(ctx, "test error", "error");
    expect(notified).toEqual([{ msg: "test error", level: "error" }]);
  });

  test("notifies only once per context object", () => {
    const notified: string[] = [];
    const ctx = {
      hasUI: true,
      ui: {
        notify: (msg: string) => {
          notified.push(msg);
        },
      },
    };

    notifyOnce(ctx, "first", "error");
    notifyOnce(ctx, "second", "error");
    notifyOnce(ctx, "third", "error");

    expect(notified).toEqual(["first"]);
  });

  test("notifies different context objects independently", () => {
    const notified: string[] = [];
    const makeCtx = () => ({
      hasUI: true,
      ui: { notify: (msg: string) => { notified.push(msg); } },
    });

    const ctx1 = makeCtx();
    const ctx2 = makeCtx();

    notifyOnce(ctx1, "for ctx1", "error");
    notifyOnce(ctx2, "for ctx2", "error");

    expect(notified).toEqual(["for ctx1", "for ctx2"]);
  });

  test("skips when ctx is null", () => {
    notifyOnce(null, "should not throw", "error");
  });

  test("skips when ctx is undefined", () => {
    notifyOnce(undefined, "should not throw", "error");
  });

  test("skips when ctx is a string", () => {
    notifyOnce("not an object", "should not throw", "error");
  });

  test("skips when hasUI is false", () => {
    const notified: string[] = [];
    const ctx = {
      hasUI: false,
      ui: { notify: (msg: string) => { notified.push(msg); } },
    };

    notifyOnce(ctx, "should not notify", "error");
    expect(notified).toEqual([]);
  });

  test("skips when ui is undefined", () => {
    const ctx = { hasUI: true };
    notifyOnce(ctx, "should not throw", "error");
  });

  test("skips when ui.notify is undefined", () => {
    const ctx = { hasUI: true, ui: {} };
    notifyOnce(ctx, "should not throw", "error");
  });

  test("defaults level to error", () => {
    const notified: Array<{ msg: string; level: string }> = [];
    const ctx = {
      hasUI: true,
      ui: { notify: (msg: string, level: "info" | "warning" | "error") => { notified.push({ msg, level }); } },
    };

    notifyOnce(ctx, "test");
    expect(notified[0].level).toBe("error");
  });
});
