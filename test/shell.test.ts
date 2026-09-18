// SPDX-License-Identifier: GPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellExec, readFile, writeFile, listDirectory, removePath } from "../src/platform/shell.js";

test("shell execution returns stdout and exit code", { skip: process.platform !== "linux" }, async () => {
  const result = await shellExec("printf 'vm-shell-test'");
  assert.equal(result.stdout, "vm-shell-test");
  assert.equal(result.exitCode, 0);
});

test("filesystem operations work inside a temporary VM-local directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "computer-mcp-"));
  const file = join(directory, "example.txt");
  try {
    await writeFile(file, "hello");
    assert.equal(await readFile(file), "hello");
    assert.equal((await listDirectory(directory)).some(entry => entry.name === "example.txt"), true);
    await removePath(file);
    assert.equal((await listDirectory(directory)).some(entry => entry.name === "example.txt"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
