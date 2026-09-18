// SPDX-License-Identifier: GPL-3.0-only
import { requireX11 } from "./linux.js";
import { run } from "./exec.js";
const key = (value: string) => value.trim().toLowerCase().replace(/^key\./, "").replace("pageup", "Prior").replace("pagedown", "Next").replace("backspace", "BackSpace").replace("delete", "Delete").replace("esc", "Escape").replace("enter", "Return").replace("space", "space").replace("super", "Super");
export async function typeText(text: string, interval = 0): Promise<void> { await requireX11("text typing"); await run("xdotool", ["type", "--clearmodifiers", "--delay", String(Math.max(0, Math.round(interval))), "--", text]); }
export async function press(value: string): Promise<void> { await requireX11("key press"); await run("xdotool", ["key", "--clearmodifiers", key(value)]); }
export async function hotkey(keys: string[]): Promise<void> { await requireX11("hotkey input"); if (!keys.length) throw new Error("A hotkey requires at least one key."); const modifiers = keys.slice(0, -1).map(key); const finalKey = key(keys[keys.length - 1]); const pressed: string[] = []; try { for (const modifier of modifiers) { await run("xdotool", ["keydown", modifier]); pressed.push(modifier); } await run("xdotool", ["key", finalKey]); } finally { for (const modifier of pressed.reverse()) { try { await run("xdotool", ["keyup", modifier]); } catch { /* best effort cleanup */ } } } }
export async function clipboardGet(): Promise<string> { await requireX11("clipboard read"); return (await run("xclip", ["-selection", "clipboard", "-o"])).stdout; }
export async function clipboardSet(text: string): Promise<void> { await requireX11("clipboard write"); await run("xclip", ["-selection", "clipboard"], { input: text }); }
