// SPDX-License-Identifier: GPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { detectEnvironment } from "../src/platform/linux.js";

test("detectEnvironment reports an explicit environment", async () => {
  const info = await detectEnvironment();
  assert.ok(["x11", "wayland", "unknown"].includes(info.environment));
  assert.equal(typeof info.capabilities.screenshot, "boolean");
  assert.equal(typeof info.capabilities.input, "boolean");
});

test("X11 detection is based on DISPLAY and not browser-specific APIs", async () => {
  const info = await detectEnvironment();
  assert.equal(info.display, process.env.DISPLAY ?? null);
  assert.equal(info.waylandDisplay, process.env.WAYLAND_DISPLAY ?? null);
});
