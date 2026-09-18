// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from "node:child_process";
import { requireX11, screenSize } from "./linux.js";

export async function capture(format: "png" | "jpeg", quality: number, scale?: number): Promise<{ data: Buffer; mimeType: string; width: number; height: number }> {
  await requireX11("screenshot capture");
  const size = await screenSize();
  const output = format === "jpeg" ? "mjpeg" : "png";
  const args = ["-hide_banner", "-loglevel", "error", "-f", "x11grab", "-video_size", `${size.width}x${size.height}`, "-i", `${process.env.DISPLAY ?? ":0"}.0`, "-frames:v", "1"];
  if (scale && scale !== 1) args.push("-vf", `scale=${Math.max(1, Math.round(size.width * scale))}:-1`);
  if (format === "jpeg") {
    const quantizer = Math.max(2, Math.min(31, Math.round(31 - quality * 29)));
    args.push("-q:v", String(quantizer));
  }
  args.push("-f", output, "pipe:1");
  return await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`Unable to capture the Linux desktop with FFmpeg: ${Buffer.concat(errors).toString()}`));
        return;
      }
      resolve({ data: Buffer.concat(chunks), mimeType: format === "jpeg" ? "image/jpeg" : "image/png", width: scale ? Math.round(size.width * scale) : size.width, height: scale ? Math.round(size.height * scale) : size.height });
    });
  });
}
