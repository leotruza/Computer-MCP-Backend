import { spawn } from "node:child_process";
const child = spawn("node", ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });
let buffer = "";
const response = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("MCP discovery timeout")), 5000);
  child.stdout.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id === 1) { clearTimeout(timeout); resolve(message); }
    }
  });
});
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
const result = await response;
if (!result.result?.tools?.some(t => t.name === "computer_screenshot")) throw new Error("computer_screenshot was not discovered");
console.log(`MCP_DISCOVERY_OK tools=${result.result.tools.length}`);
child.kill("SIGTERM");
