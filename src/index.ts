// SPDX-License-Identifier: GPL-3.0-only
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { detectEnvironment, screenSize } from "./platform/linux.js";
import { capture } from "./platform/screenshot.js";
import * as mouse from "./platform/mouse.js";
import * as keyboard from "./platform/keyboard.js";
import * as shell from "./platform/shell.js";
import * as selenium from "./platform/selenium.js";

if (process.platform !== "linux") {
  process.exit(1);
}

const number = (min?: number, max?: number) => z.number().finite().min(min ?? -Infinity).max(max ?? Infinity);
const button = z.enum(["left", "right", "middle"]);
const schemas = {
  computer_screenshot: z.object({ display: z.string().optional(), format: z.enum(["png", "jpeg"]).default("png"), quality: number(1, 100).default(85), scale: number(0.1, 2).optional() }),
  computer_move_mouse: z.object({ x: number(0), y: number(0), duration: number(0, 10000).default(0) }),
  computer_click: z.object({ x: number(0), y: number(0), button: button.default("left"), clicks: z.number().int().min(1).max(10).default(1), interval: number(0, 5000).default(100) }),
  computer_mouse_down: z.object({ button: button.default("left") }), computer_mouse_up: z.object({ button: button.default("left") }),
  computer_scroll: z.object({ amount: z.number().int().min(-100).max(100), horizontal: z.number().int().min(-100).max(100).default(0) }),
  computer_type: z.object({ text: z.string().max(100000), interval: number(0, 1000).default(0) }),
  computer_key: z.object({ key: z.string().min(1).max(40) }), computer_hotkey: z.object({ keys: z.array(z.string().min(1).max(40)).min(1).max(10) }),
  computer_clipboard_set: z.object({ text: z.string().max(1000000) }), computer_clipboard_get: z.object({}), computer_screen_size: z.object({}), computer_environment: z.object({}),
  shell_exec: z.object({ command: z.string().min(1).max(100000), cwd: z.string().optional(), timeout: z.number().int().min(100).max(300000).default(30000) }),
  filesystem_read: z.object({ path: z.string().min(1) }), filesystem_write: z.object({ path: z.string().min(1), content: z.string() }), filesystem_list: z.object({ path: z.string().min(1) }), filesystem_remove: z.object({ path: z.string().min(1) }),
  browser_start: z.object({ browser: z.enum(["firefox", "chrome"]).default("firefox"), profilePath: z.string().optional(), headless: z.boolean().default(false), binaryPath: z.string().optional(), minimalProfile: z.boolean().default(true) }), browser_stop: z.object({}), browser_navigate: z.object({ url: z.string().url(), waitMs: z.number().int().min(0).max(120000).default(10000) }), browser_page: z.object({}), browser_find: z.object({ using: z.enum(["css", "xpath", "id", "name", "tag"]), value: z.string().min(1), all: z.boolean().default(false) }), browser_click: z.object({ using: z.enum(["css", "xpath", "id", "name", "tag"]), value: z.string().min(1) }), browser_type: z.object({ using: z.enum(["css", "xpath", "id", "name", "tag"]), value: z.string().min(1), text: z.string(), clear: z.boolean().default(true) }), browser_key: z.object({ key: z.string().min(1).max(40) }), browser_wait: z.object({ using: z.enum(["css", "xpath", "id", "name", "tag"]), value: z.string().min(1), timeout: z.number().int().min(100).max(120000).default(10000) }), browser_execute: z.object({ script: z.string().min(1), args: z.array(z.unknown()).default([]) }), browser_tabs: z.object({}), browser_switch_window: z.object({ handle: z.string().min(1) }), browser_switch_frame: z.object({ using: z.enum(["css", "xpath", "id", "name", "tag"]), value: z.string().min(1) }), browser_default_content: z.object({}), browser_cookies: z.object({}), browser_storage: z.object({ kind: z.enum(["local", "session"]) }), browser_alert: z.object({ action: z.enum(["accept", "dismiss", "text"]), value: z.string().optional() }), browser_screenshot: z.object({}),
};
type ToolName = keyof typeof schemas;
const descriptions: Record<ToolName, string> = {
  computer_screenshot: "Capture the current Linux desktop. Coordinates in the returned image use top-left origin; x increases right and y increases down. Use this for arbitrary GUI applications, native dialogs, and visual interaction; use Selenium tools for ordinary web DOM operations.",
  computer_screen_size: "Return desktop dimensions and detected monitor rectangles. Use the same top-left coordinate system as screenshots.", computer_environment: "Report X11/Wayland detection and available Linux desktop capabilities.",
  computer_move_mouse: "Move the mouse to screenshot coordinates.", computer_click: "Move and click at screenshot coordinates. Supports left, right, and middle buttons and repeated clicks.", computer_mouse_down: "Press and hold a mouse button.", computer_mouse_up: "Release a mouse button.", computer_scroll: "Scroll vertically with amount (positive up, negative down) and horizontally when supported.", computer_type: "Type literal text into the focused GUI application.", computer_key: "Press one key, such as ENTER, ESC, TAB, BACKSPACE, DELETE, HOME, END, PAGEUP, PAGEDOWN, UP, DOWN, LEFT, RIGHT, F1-F12, CTRL, ALT, SHIFT, or SUPER.", computer_hotkey: "Press a key combination such as [CTRL, L] or [CTRL, ALT, T]. Modifiers are always released after the operation, including on failure.", computer_clipboard_get: "Read the X11 desktop clipboard.", computer_clipboard_set: "Replace the X11 desktop clipboard with text.", shell_exec: "Execute a shell command inside the Linux VM. This is intentionally unrestricted within the VM; no host command execution is provided.", filesystem_read: "Read a file inside the Linux VM.", filesystem_write: "Create or replace a file inside the Linux VM.", filesystem_list: "List a directory inside the Linux VM.", filesystem_remove: "Remove a file or directory inside the Linux VM.", browser_start: "Start Selenium WebDriver. Firefox is the default, visible unless headless=true, and minimalProfile=true applies conservative Firefox resource optimizations without disabling JavaScript, cookies, WebAssembly, WebGL, or security.", browser_stop: "Stop the Selenium browser started by this server.", browser_navigate: "Navigate the Selenium browser to a URL and wait briefly for the requested URL.", browser_page: "Return the current Selenium page URL, title, visible body text, and HTML source.", browser_find: "Find elements in the current Selenium page using CSS, XPath, id, name, or tag locators.", browser_click: "Click a Selenium-located element; use generic computer_click for visual/native GUI interaction.", browser_type: "Type into a Selenium-located element; use generic computer_type for visual/native GUI interaction.", browser_key: "Send a key through Selenium WebDriver.", browser_wait: "Wait for a Selenium-located element to exist.", browser_execute: "Execute JavaScript through Selenium in the current page.", browser_tabs: "List Selenium window handles and the current handle.", browser_switch_window: "Switch the Selenium browser to a window handle returned by browser_tabs.", browser_switch_frame: "Switch into a Selenium frame identified by a locator.", browser_default_content: "Return Selenium context to the top-level document.", browser_cookies: "Return cookies from the current Selenium browser profile.", browser_storage: "Return localStorage or sessionStorage from the current Selenium page.", browser_alert: "Accept, dismiss, read, or provide text to a Selenium browser alert.", browser_screenshot: "Capture a screenshot of the Selenium browser viewport as MCP image content."
};
const toolList = Object.keys(schemas).map(name => ({ name, description: descriptions[name as ToolName], inputSchema: zodToJsonSchema(schemas[name as ToolName]) }));
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> { const shape = (schema as z.ZodObject<any>).shape; if (!shape) return { type: "object", properties: {} }; const properties: Record<string, unknown> = {}; const required: string[] = []; for (const [key, value] of Object.entries(shape)) { const v = value as z.ZodTypeAny; const def = (v as any)._def; const inner = def.typeName === "ZodDefault" ? def.innerType : v; const idef = (inner as any)._def; let item: Record<string, unknown> = idef.typeName === "ZodEnum" ? { type: "string", enum: idef.values } : idef.typeName === "ZodNumber" ? { type: "number" } : idef.typeName === "ZodArray" ? { type: "array", items: { type: "string" } } : { type: "string" }; properties[key] = item; if (def.typeName !== "ZodDefault" && !idef.isOptional) required.push(key); } return { type: "object", properties, ...(required.length ? { required } : {}) }; }
function text(message: string, data?: unknown) { return { content: [{ type: "text", text: data === undefined ? message : `${message}\n${JSON.stringify(data, null, 2)}` }] }; }
function parse<T extends ToolName>(name: T, args: unknown): any { return schemas[name].parse(args ?? {}); }

const server = new Server({ name: "computer-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const name = request.params.name as ToolName;
  try {
    if (!(name in schemas)) return { isError: true, ...text(`Unknown tool: ${name}`) };
    switch (name) {
      case "computer_screenshot": { const a = parse(name, request.params.arguments); const shot = await capture(a.format, a.quality, a.scale); return { content: [{ type: "image", data: shot.data.toString("base64"), mimeType: shot.mimeType }, { type: "text", text: JSON.stringify({ width: shot.width, height: shot.height, format: a.format }) }] }; }
      case "computer_screen_size": return text("Desktop dimensions", await screenSize());
      case "computer_environment": return text("Desktop environment", await detectEnvironment());
      case "computer_move_mouse": { const a = parse(name, request.params.arguments); await mouse.move(a.x, a.y, a.duration); return text("Mouse moved."); }
      case "computer_click": { const a = parse(name, request.params.arguments); await mouse.click(a.x, a.y, a.button, a.clicks, a.interval); return text("Mouse click completed."); }
      case "computer_mouse_down": { await mouse.down(parse(name, request.params.arguments).button); return text("Mouse button pressed."); }
      case "computer_mouse_up": { await mouse.up(parse(name, request.params.arguments).button); return text("Mouse button released."); }
      case "computer_scroll": { const a = parse(name, request.params.arguments); await mouse.scroll(a.amount, a.horizontal); return text("Scroll completed."); }
      case "computer_type": { const a = parse(name, request.params.arguments); await keyboard.typeText(a.text, a.interval); return text("Text typed."); }
      case "computer_key": { await keyboard.press(parse(name, request.params.arguments).key); return text("Key pressed."); }
      case "computer_hotkey": { await keyboard.hotkey(parse(name, request.params.arguments).keys); return text("Hotkey completed; modifiers released."); }
      case "computer_clipboard_get": return text("Clipboard contents", await keyboard.clipboardGet());
      case "computer_clipboard_set": { await keyboard.clipboardSet(parse(name, request.params.arguments).text); return text("Clipboard updated."); }
      case "shell_exec": { const a = parse(name, request.params.arguments); const result = await shell.shellExec(a.command, a.cwd, a.timeout); return text("Shell command result", result); }
      case "filesystem_read": return text("File contents", await shell.readFile(parse(name, request.params.arguments).path));
      case "filesystem_write": { const a = parse(name, request.params.arguments); await shell.writeFile(a.path, a.content); return text("File written."); }
      case "filesystem_list": return text("Directory entries", await shell.listDirectory(parse(name, request.params.arguments).path));
      case "filesystem_remove": { await shell.removePath(parse(name, request.params.arguments).path); return text("Path removed."); }
      case "browser_start": { const a = parse(name, request.params.arguments); return text("Selenium browser started", await selenium.start(a)); }
      case "browser_stop": { await selenium.stop(); return text("Selenium browser stopped."); }
      case "browser_navigate": { const a = parse(name, request.params.arguments); return text("Selenium navigation complete", await selenium.navigate(a.url, a.waitMs)); }
      case "browser_page": return text("Selenium page", await selenium.page());
      case "browser_find": { const a = parse(name, request.params.arguments); return text("Selenium elements", await selenium.find(a.using, a.value, a.all)); }
      case "browser_click": { const a = parse(name, request.params.arguments); await selenium.click(a.using, a.value); return text("Selenium element clicked."); }
      case "browser_type": { const a = parse(name, request.params.arguments); await selenium.type(a.using, a.value, a.text, a.clear); return text("Selenium text entered."); }
      case "browser_key": { await selenium.press(parse(name, request.params.arguments).key); return text("Selenium key sent."); }
      case "browser_wait": { const a = parse(name, request.params.arguments); await selenium.waitFor(a.using, a.value, a.timeout); return text("Selenium element appeared."); }
      case "browser_execute": { const a = parse(name, request.params.arguments); return text("Selenium script result", await selenium.execute(a.script, a.args)); }
      case "browser_tabs": return text("Selenium windows", await selenium.tabs());
      case "browser_switch_window": { await selenium.switchWindow(parse(name, request.params.arguments).handle); return text("Selenium window switched."); }
      case "browser_switch_frame": { const a = parse(name, request.params.arguments); await selenium.switchFrame(a.using, a.value); return text("Selenium frame selected."); }
      case "browser_default_content": { await selenium.defaultContent(); return text("Selenium returned to top-level document."); }
      case "browser_cookies": return text("Selenium cookies", await selenium.cookies());
      case "browser_storage": return text("Selenium storage", await selenium.storage(parse(name, request.params.arguments).kind));
      case "browser_alert": { const a = parse(name, request.params.arguments); return text("Selenium alert result", await selenium.alert(a.action, a.value)); }
      case "browser_screenshot": return { content: [{ type: "image", data: await selenium.screenshot(), mimeType: "image/png" }] };
    }
  } catch (error) { return { isError: true, ...text(error instanceof Error ? error.message : String(error)) }; }
});

const transport = new StdioServerTransport();
const cleanup = async () => { try { await server.close(); } finally { process.exit(0); } };
process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
process.on("uncaughtException", error => { console.error("Uncaught exception:", error); void cleanup(); });
process.on("unhandledRejection", error => { console.error("Unhandled promise rejection:", error); void cleanup(); });
await server.connect(transport);
