// SPDX-License-Identifier: GPL-3.0-only
import { Builder, By, Key, type WebDriver, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import chrome from "selenium-webdriver/chrome.js";

let driver: WebDriver | null = null;
let activeBrowser = "";
function requireDriver(): WebDriver { if (!driver) throw new Error("Selenium browser is not started. Call browser_start first."); return driver; }
function locator(using: string, value: string): By { if (using === "css") return By.css(value); if (using === "xpath") return By.xpath(value); if (using === "id") return By.id(value); if (using === "name") return By.name(value); if (using === "tag") return By.tagName(value); throw new Error(`Unsupported locator strategy: ${using}`); }
function keyValue(value: string): string { const aliases: Record<string, string> = { ENTER: Key.ENTER, RETURN: Key.RETURN, TAB: Key.TAB, ESC: Key.ESCAPE, ESCAPE: Key.ESCAPE, BACKSPACE: Key.BACK_SPACE, DELETE: Key.DELETE, HOME: Key.HOME, END: Key.END, PAGEUP: Key.PAGE_UP, PAGEDOWN: Key.PAGE_DOWN, UP: Key.ARROW_UP, DOWN: Key.ARROW_DOWN, LEFT: Key.ARROW_LEFT, RIGHT: Key.ARROW_RIGHT, SPACE: Key.SPACE }; return aliases[value.toUpperCase()] ?? value; }
export interface StartOptions { browser?: "firefox" | "chrome"; profilePath?: string; headless?: boolean; binaryPath?: string; minimalProfile?: boolean; }
export async function start(options: StartOptions = {}): Promise<{ browser: string; visible: boolean; headless: boolean; minimalProfile: boolean }> {
  const browser = options.browser ?? "firefox"; const headless = options.headless ?? false; const minimalProfile = options.minimalProfile ?? true;
  if (driver) return { browser: activeBrowser, visible: !headless, headless, minimalProfile };
  const builder = new Builder().forBrowser(browser);
  if (browser === "firefox") {
    const firefoxOptions = new firefox.Options();
    if (options.profilePath) firefoxOptions.setProfile(options.profilePath);
    if (options.binaryPath) firefoxOptions.setBinary(options.binaryPath);
    firefoxOptions.addArguments("-width=1280", "-height=900"); if (headless) firefoxOptions.addArguments("--headless");
    if (minimalProfile) firefoxOptions.setPreference("datareporting.healthreport.uploadEnabled", false).setPreference("datareporting.policy.dataSubmissionEnabled", false).setPreference("toolkit.telemetry.enabled", false).setPreference("toolkit.telemetry.unified", false).setPreference("app.update.auto", false).setPreference("app.update.enabled", false).setPreference("browser.shell.checkDefaultBrowser", false).setPreference("browser.startup.homepage_override.mstone", "ignore").setPreference("browser.newtabpage.enabled", false).setPreference("browser.newtabpage.activity-stream.feeds.telemetry", false).setPreference("browser.newtabpage.activity-stream.telemetry", false).setPreference("network.prefetch-next", false).setPreference("network.http.speculative-parallel-limit", 0).setPreference("browser.urlbar.speculativeConnect.enabled", false).setPreference("dom.ipc.processCount", 1).setPreference("image.animation_mode", "none");
    builder.setFirefoxOptions(firefoxOptions);
  } else {
    const chromeOptions = new chrome.Options(); if (options.profilePath) chromeOptions.addArguments(`--user-data-dir=${options.profilePath}`); if (options.binaryPath) chromeOptions.setChromeBinaryPath(options.binaryPath); chromeOptions.addArguments("--window-size=1280,900", "--disable-background-networking", "--disable-component-update", "--disable-features=Translate,MediaRouter", "--no-first-run"); if (headless) chromeOptions.addArguments("--headless=new"); builder.setChromeOptions(chromeOptions);
  }
  driver = await builder.build(); activeBrowser = browser;
  return { browser, visible: !headless, headless, minimalProfile };
}
export async function stop(): Promise<void> { if (driver) { const current = driver; driver = null; activeBrowser = ""; await current.quit(); } }
export async function navigate(url: string, waitMs = 10000): Promise<{ url: string; title: string }> { const d = requireDriver(); await d.get(url); await d.wait(until.urlIs(url), waitMs).catch(() => undefined); return { url: await d.getCurrentUrl(), title: await d.getTitle() }; }
export async function page(): Promise<{ url: string; title: string; text: string; html: string }> { const d = requireDriver(); return { url: await d.getCurrentUrl(), title: await d.getTitle(), text: await d.findElement(By.css("body")).getText(), html: await d.getPageSource() }; }
export async function find(using: string, value: string, all = false): Promise<Array<{ tag: string; text: string; attributes: Record<string, string | null> }>> { const d = requireDriver(); const elements = all ? await d.findElements(locator(using, value)) : [await d.findElement(locator(using, value))]; return Promise.all(elements.map(async element => ({ tag: await element.getTagName(), text: await element.getText(), attributes: { id: await element.getAttribute("id"), class: await element.getAttribute("class"), href: await element.getAttribute("href"), value: await element.getAttribute("value") } }))); }
export async function click(using: string, value: string): Promise<void> { await requireDriver().findElement(locator(using, value)).click(); }
export async function type(using: string, value: string, text: string, clear = true): Promise<void> { const element = await requireDriver().findElement(locator(using, value)); if (clear) await element.clear(); await element.sendKeys(text); }
export async function press(key: string): Promise<void> { await requireDriver().actions().sendKeys(keyValue(key)).perform(); }
export async function waitFor(using: string, value: string, timeout = 10000): Promise<void> { await requireDriver().wait(until.elementLocated(locator(using, value)), timeout); }
export async function execute(script: string, args: unknown[] = []): Promise<unknown> { return requireDriver().executeScript(script, ...args); }
export async function tabs(): Promise<{ current: string; handles: string[] }> { const d = requireDriver(); return { current: await d.getWindowHandle(), handles: await d.getAllWindowHandles() }; }
export async function switchWindow(handle: string): Promise<void> { await requireDriver().switchTo().window(handle); }
export async function switchFrame(using: string, value: string): Promise<void> { await requireDriver().switchTo().frame(await requireDriver().findElement(locator(using, value))); }
export async function defaultContent(): Promise<void> { await requireDriver().switchTo().defaultContent(); }
export async function cookies(): Promise<unknown[]> { return requireDriver().manage().getCookies(); }
export async function storage(kind: "local" | "session"): Promise<Record<string, string>> { return await execute(`return Object.fromEntries(Object.entries(window.${kind}Storage));`) as Record<string, string>; }
export async function alert(action: "accept" | "dismiss" | "text", value?: string): Promise<string | void> { const a = await requireDriver().switchTo().alert(); if (action === "accept") await a.accept(); else if (action === "dismiss") await a.dismiss(); else if (value !== undefined) await a.sendKeys(value); else return a.getText(); }
export async function screenshot(): Promise<string> { return requireDriver().takeScreenshot(); }
