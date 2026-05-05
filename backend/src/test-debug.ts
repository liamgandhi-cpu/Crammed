import "dotenv/config";
delete process.env.VERCEL;
delete (process.env as any).AWS_LAMBDA_FUNCTION_NAME;

import puppeteer from "puppeteer-core";

const LOCAL_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: LOCAL_CHROME,
    headless: "new" as unknown as boolean,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // Login to ClassLink
  console.log("Navigating to ClassLink...");
  await page.goto("https://login.classlink.com/my/loudoun", { waitUntil: "networkidle2", timeout: 30_000 });
  await page.waitForSelector("#username", { timeout: 15_000 });
  await page.type("#username", "1050291", { delay: 50 });
  await page.type("#password", "Ronald67!", { delay: 50 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {}),
    page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button, input[type='submit']")).find(
        b => /sign.?in|log.?in/i.test((b as HTMLElement).innerText || (b as HTMLInputElement).value || "")
      ) as HTMLElement | null;
      if (btn) btn.click();
    }),
  ]);
  await sleep(2000);
  console.log("After ClassLink login URL:", page.url());

  // Wait for launchpad, then click Schoology tile
  await page.waitForSelector("[aria-label='schoology']", { timeout: 15_000 }).catch(() => {});
  await sleep(1000);

  const newTabPromise = new Promise<any>((resolve) => {
    browser.once("targetcreated", async (target: any) => {
      const p = await target.page();
      if (p) resolve(p);
    });
  });

  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("*")).find(e =>
      (e.getAttribute("aria-label") ?? "").toLowerCase() === "schoology"
    ) as HTMLElement | null;
    if (el) el.click();
  });

  const newTab = await Promise.race([
    newTabPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);

  let activePage = newTab || page;
  if (newTab) {
    console.log("New tab opened:", newTab.url());
    await newTab.bringToFront();
    await sleep(2000);
  }

  // Click "Continue to website" if present
  for (let i = 0; i < 5; i++) {
    const url = activePage.url();
    console.log(`Loop ${i}: url=${url}`);
    if (!url.includes("classlink.com") && !url.includes("launchpad.com")) break;
    const clicked = await activePage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("a, button, [role='button']")).find(
        b => /continue|website|launch|proceed|open/i.test((b as HTMLElement).innerText ?? "")
      ) as HTMLElement | null;
      if (btn) { btn.click(); return (btn as HTMLElement).innerText.trim(); }
      return null;
    });
    if (clicked) {
      console.log(`Clicked: "${clicked}"`);
      await activePage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
      await sleep(1500);
    } else {
      await sleep(2000);
    }
  }

  console.log("After classlink, url:", activePage.url());

  // Now we're on Microsoft. Type email.
  await activePage.waitForSelector("input[name='loginfmt']", { timeout: 15_000 });
  await sleep(500);
  await activePage.type("input[name='loginfmt']", "1050291@lcps.org", { delay: 50 });
  await activePage.waitForSelector("#idSIButton9", { timeout: 8_000 }).catch(() => {});
  await Promise.all([
    activePage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {}),
    activePage.click("#idSIButton9"),
  ]);
  console.log("After email Next, url:", activePage.url());
  await sleep(2000);

  // Now dump the password page
  const inputs = await activePage.evaluate(() => {
    return Array.from(document.querySelectorAll("input")).map(el => ({
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      visible: el.offsetWidth > 0 && el.offsetHeight > 0,
    }));
  });
  console.log("Inputs on MS password page:", JSON.stringify(inputs, null, 2));

  const bodyText = await activePage.evaluate(() => document.body?.innerText?.slice(0, 300));
  console.log("Body text:", bodyText);

  await browser.close();
  process.exit(0);
})();
