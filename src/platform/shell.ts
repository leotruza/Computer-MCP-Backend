// SPDX-License-Identifier: GPL-3.0-only
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

export async function shellExec(command: string, cwd?: string, timeout = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (process.platform !== "linux") throw new Error(`shell_exec requires a Linux VM. Detected platform: ${process.platform}. This project does not provide a Windows shell or implicit WSL fallback.`);
  return await new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", command], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Shell command timed out after ${timeout} ms: ${command}`)); }, timeout);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk)); child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject); child.on("close", code => { clearTimeout(timer); resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode: code ?? -1 }); });
  });
}
export async function readFile(path: string): Promise<string> { return fs.readFile(path, "utf8"); }
export async function writeFile(path: string, content: string): Promise<void> { await fs.writeFile(path, content, "utf8"); }
export async function listDirectory(path: string): Promise<Array<{ name: string; type: string; size: number }>> { const entries = await fs.readdir(path, { withFileTypes: true }); return Promise.all(entries.map(async entry => { const stat = await fs.lstat(`${path}/${entry.name}`); return { name: entry.name, type: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file", size: stat.size }; })); }
export async function removePath(path: string): Promise<void> { await fs.rm(path, { recursive: true, force: false }); }
