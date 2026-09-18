// SPDX-License-Identifier: GPL-3.0-only
import { hasCommand, run } from "./exec.js";

export type DesktopEnvironment = "x11" | "wayland" | "unknown";
export interface Capabilities { screenshot: boolean; input: boolean; clipboard: boolean; monitors: boolean; }
export interface EnvironmentInfo { environment: DesktopEnvironment; display: string | null; waylandDisplay: string | null; capabilities: Capabilities; notes: string[]; }

export async function detectEnvironment(): Promise<EnvironmentInfo> {
  const x11 = Boolean(process.env.DISPLAY) && !process.env.WAYLAND_DISPLAY;
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const environment: DesktopEnvironment = x11 ? "x11" : wayland ? "wayland" : "unknown";
  const xdotool = await hasCommand("xdotool");
  const xclip = await hasCommand("xclip");
  const ffmpeg = await hasCommand("ffmpeg");
  const notes: string[] = [];
  if (wayland) notes.push("Wayland is detected. This implementation does not bypass compositor security; use an X11 session or provide compositor-approved tools.");
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) notes.push("Neither DISPLAY nor WAYLAND_DISPLAY is set.");
  return {
    environment, display: process.env.DISPLAY ?? null, waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
    capabilities: { screenshot: x11 && ffmpeg, input: x11 && xdotool, clipboard: x11 && xclip, monitors: x11 }, notes,
  };
}

export async function requireX11(capability: string): Promise<void> {
  const info = await detectEnvironment();
  if (info.environment !== "x11") throw new Error(`Unable to perform ${capability}. Detected display environment: ${info.environment}. Required capability: X11 desktop access. Suggested action: run the server inside an X11 graphical session; this server does not silently emulate Wayland input.`);
}

export async function screenSize(): Promise<{ width: number; height: number; monitors: Array<{ name: string; x: number; y: number; width: number; height: number; primary: boolean }> }> {
  await requireX11("screen-size discovery");
  const { stdout } = await run("xrandr", ["--query"]);
  const monitors: Array<{ name: string; x: number; y: number; width: number; height: number; primary: boolean }> = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([^ ]+) connected(?: primary)? (\d+)x(\d+)\+(\-?\d+)\+(\-?\d+)/);
    if (m) monitors.push({ name: m[1], width: Number(m[2]), height: Number(m[3]), x: Number(m[4]), y: Number(m[5]), primary: line.includes(" primary ") });
  }
  if (!monitors.length) { const { stdout: geometry } = await run("xdotool", ["getdisplaygeometry"]); const [width, height] = geometry.trim().split(/\s+/).map(Number); return { width, height, monitors: [] }; }
  const minX = Math.min(...monitors.map(m => m.x)); const minY = Math.min(...monitors.map(m => m.y));
  const maxX = Math.max(...monitors.map(m => m.x + m.width)); const maxY = Math.max(...monitors.map(m => m.y + m.height));
  return { width: maxX - minX, height: maxY - minY, monitors };
}
