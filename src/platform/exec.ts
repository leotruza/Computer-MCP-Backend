// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from "node:child_process";

export class PlatformError extends Error {
  constructor(message: string, public readonly details: Record<string, unknown> = {}) { super(message); this.name = "PlatformError"; }
}

export async function run(command: string, args: string[], options: { input?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const out: Buffer[] = []; const err: Buffer[] = []; const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeout ?? 15000);
    child.stdout!.on("data", (chunk: Buffer) => out.push(chunk)); child.stderr!.on("data", (chunk: Buffer) => err.push(chunk));
    if (options.input !== undefined && child.stdin) { child.stdin.end(options.input); }
    child.on("error", error => { clearTimeout(timeout); reject(new PlatformError(`Unable to start Linux command: ${command}`, { command, args, cause: String(error) })); });
    child.on("close", code => { clearTimeout(timeout); const stdout = Buffer.concat(out).toString("utf8"); const stderr = Buffer.concat(err).toString("utf8"); if (code !== 0) reject(new PlatformError(`Linux command failed: ${command}`, { command, args, code, stderr, stdout })); else resolve({ stdout, stderr }); });
  });
}
export async function hasCommand(command: string): Promise<boolean> { try { await run("sh", ["-c", `command -v ${command}`], { timeout: 3000 }); return true; } catch { return false; } }
