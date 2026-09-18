#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Compare installed browser candidates under the same Selenium workload.
import { Builder, By } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import chrome from "selenium-webdriver/chrome.js";
import { execFileSync } from "node:child_process";

const headless = process.argv.includes("--headless");
const workload = `data:text/html,<title>Computer-MCP benchmark</title><body><main id="root"></main><script>for(let i=0;i<2000;i++){const p=document.createElement('p');p.textContent='benchmark item '+i;document.querySelector('#root').appendChild(p)};</script></body>`;
const candidates = (process.env.BROWSER_CANDIDATES ?? "firefox,firefox-esr").split(",").map(spec => { const [name, binary] = spec.split(":", 2); return { name, binary }; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function processStats(binary) {
  try {
    const output = execFileSync("ps", ["-eo", "rss=,pcpu=,args="], { encoding: "utf8" });
    const needle = binary ? binary.split("/").pop() : "firefox";
    let rss = 0; let cpu = 0; let count = 0;
    for (const line of output.split("\n")) { if (!line.includes(needle)) continue; const match = line.trim().match(/^(\d+)\s+([0-9.]+)\s+(.*)$/); if (match) { rss += Number(match[1]); cpu += Number(match[2]); count++; } }
    return { rssMb: Math.round(rss / 1024 * 100) / 100, cpuPercent: Math.round(cpu * 100) / 100, processCount: count };
  } catch { return { rssMb: null, cpuPercent: null, processCount: 0 }; }
}
async function runCandidate(candidate) {
  const started = Date.now(); let driver; const result = { candidate: candidate.name, binary: candidate.binary ?? null, headless, startupMs: null, idle: null, loaded: null, multiTab: null, jsBusy: null, stability: null, webdriver: "failed", error: null };
  try {
    if (candidate.name !== "firefox" && !candidate.binary) {
      try { candidate.binary = execFileSync("sh", ["-c", `command -v ${candidate.name}`], { encoding: "utf8" }).trim(); result.binary = candidate.binary; } catch { result.error = `Candidate binary not found: ${candidate.name}. Supply name:/absolute/path/to/browser`; return result; }
    }
    const builder = new Builder().forBrowser("firefox"); const options = new firefox.Options();
    if (candidate.binary) options.setBinary(candidate.binary); if (headless) options.addArguments("--headless"); options.addArguments("-width=1280", "-height=900");
    options.setPreference("dom.ipc.processCount", 1).setPreference("toolkit.telemetry.enabled", false).setPreference("datareporting.healthreport.uploadEnabled", false);
    builder.setFirefoxOptions(options); driver = await builder.build(); result.startupMs = Date.now() - started; result.webdriver = "ok";
    await driver.get("about:blank"); await sleep(1500); result.idle = processStats(candidate.binary);
    await driver.get(workload); await sleep(1500); result.loaded = processStats(candidate.binary);
    await driver.switchTo().newWindow("tab"); await driver.get(workload); await sleep(1000); result.multiTab = processStats(candidate.binary);
    await driver.executeScript("const end=performance.now()+1200; let x=0; while(performance.now()<end){x=Math.sqrt(Math.random()*1000000)+x%17} return x;"); await sleep(500); result.jsBusy = processStats(candidate.binary);
    await sleep(5000); result.stability = processStats(candidate.binary);
  } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
  finally { if (driver) await driver.quit().catch(() => undefined); }
  return result;
}
const results = [];
for (const candidate of candidates) results.push(await runCandidate(candidate));
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), workload: "data URL with 2,000 DOM nodes, two tabs, 1.2s JavaScript loop, 5s stability wait", results }, null, 2));
