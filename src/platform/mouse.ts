// SPDX-License-Identifier: GPL-3.0-only
import { requireX11 } from "./linux.js";
import { run } from "./exec.js";
export type MouseButton = "left" | "right" | "middle";
const buttonCode: Record<MouseButton, string> = { left: "1", middle: "2", right: "3" };
const pause = (ms: number) => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
export async function move(x: number, y: number, duration = 0): Promise<void> { await requireX11("mouse movement"); await run("xdotool", ["mousemove", "--sync", "--duration", String(Math.round(duration)), String(x), String(y)]); }
export async function click(x: number, y: number, button: MouseButton, clicks = 1, interval = 100): Promise<void> { await move(x, y); for (let i=0;i<clicks;i++) { await run("xdotool", ["click", "--repeat", "1", buttonCode[button]]); if (i < clicks - 1) await pause(interval); } }
export async function down(button: MouseButton): Promise<void> { await requireX11("mouse button press"); await run("xdotool", ["mousedown", buttonCode[button]]); }
export async function up(button: MouseButton): Promise<void> { await requireX11("mouse button release"); await run("xdotool", ["mouseup", buttonCode[button]]); }
export async function scroll(amount: number, horizontal = 0): Promise<void> { await requireX11("scrolling"); if (horizontal) await run("xdotool", ["click", horizontal > 0 ? "6" : "7"] .filter(Boolean)); if (amount) await run("xdotool", ["click", "--repeat", String(Math.abs(Math.round(amount))), amount > 0 ? "4" : "5"]); }
