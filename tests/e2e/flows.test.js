// End-to-end tests: the real built site in Chromium, against the Firebase emulators,
// under the production Content-Security-Policy. Run: npm run test:e2e
// Needs Playwright with Chromium (on a dev machine: npm i -D playwright && npx playwright install chromium).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serve } from "./serve.js";
import { seed, PEOPLE } from "../../scripts/seed.js";

const { chromium } = createRequire(import.meta.url)("playwright");
const PORT = 4173;
const URL_ = `http://127.0.0.1:${PORT}`;
let browser, server;
const problems = [];   // console errors and CSP violations, checked at the end

before(async () => {
  await seed();
  execSync("node scripts/copy-pyodide.js && npx vite build --outDir dist-e2e --emptyOutDir", {
    stdio: "ignore",
    env: { ...process.env, VITE_USE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: "demo-stjbs" },
  });
  server = await serve("dist-e2e", PORT);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

const email = (key) => PEOPLE.find((p) => p.key === key).email;

async function as(key) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/permission|Failed to load resource/i.test(m.text())) problems.push(`${key}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`${key}: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(URL_ + "/");
  await page.waitForFunction(() => window.__signInForTest);
  const p = PEOPLE.find((x) => x.key === key);
  await page.evaluate(([e, n]) => window.__signInForTest(e, n), [p.email, p.name]);
  await page.locator("header.top nav").waitFor();
  return page;
}

// Navigates and waits until the router has finished drawing that page.
const go = async (page, hash) => {
  const same = await page.evaluate((h) => { delete document.documentElement.dataset.page; return location.hash === h; }, `#${hash}`);
  if (same) await page.reload();
  else await page.goto(`${URL_}/#${hash}`);
  await page.waitForFunction((h) => document.documentElement.dataset.page === h, `#${hash}`);
};

test("an outsider Google account is turned away", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(URL_ + "/");
  await page.waitForFunction(() => window.__signInForTest);
  await page.evaluate(() => window.__signInForTest("someone@gmail.com", "Someone"));
  await page.getByText("cannot use this site").waitFor();
  await context.close();
});

test("the allowlisted club account can sign in", async () => {
  const page = await as("club");
  await page.getByText("Program").first().waitFor();
  await page.context().close();
});

test("join class: student asks with a code, teacher approves, student sees the class", async () => {
  const gita = await as("s7");
  await go(gita, "/join");
  await gita.getByLabel("Join code").fill("ZZZZZZ");
  await gita.getByRole("button", { name: "Ask to join" }).click();
  await gita.getByText("No class has that code").waitFor();
  await gita.getByLabel("Join code").fill("pyth24");
  await gita.getByRole("button", { name: "Ask to join" }).click();
  await gita.getByText("Request sent to Python Sec 1").waitFor();

  const tara = await as("ta");
  await go(tara, "/class/py1/roster");
  const row = tara.locator("li", { hasText: "Gita Student" });
  await row.getByRole("button", { name: "Approve" }).click();
  await tara.locator("h2", { hasText: "Students (6)" }).waitFor();

  await go(gita, "/");
  await gita.getByRole("link", { name: "Python Sec 1" }).first().waitFor();
  await gita.context().close();
  await tara.context().close();
});

test("a student cannot open admin pages or another class", async () => {
  const ana = await as("s1");
  await go(ana, "/admin/people");
  await ana.getByText("not available for your role").waitFor();
  await go(ana, "/class/sc1");
  await ana.getByText("You do not have access").waitFor();
  await ana.context().close();
});

test("submit project: pick an option, run Python, mark done", async () => {
  const ana = await as("s1");
  await go(ana, "/class/py1/project/w1");
  await ana.getByLabel(/Text art/).check();
  await ana.locator("textarea.code-input").first().fill('print("+--+")\nprint("|Ana|")');
  await ana.getByRole("button", { name: "Run" }).click();
  await ana.locator(".output pre", { hasText: "|Ana|" }).waitFor({ timeout: 90_000 });   // first run loads Python
  await ana.locator(".choice label", { hasText: "Done" }).click();
  await ana.getByRole("button", { name: "Save" }).click();
  await ana.getByText(/^Saved/).waitFor();

  const tara = await as("ta");
  await go(tara, "/class/py1/project/w1");
  const row = tara.locator("tr", { hasText: "Ana Student" });
  await row.getByText("Done").waitFor();
  await ana.context().close();
  await tara.context().close();
});

test("help: needs help attaches code and last error; queue is oldest first; teacher answers", async () => {
  const budi = await as("s2");
  await go(budi, "/class/py1/project/w1");
  await budi.getByLabel(/Name card/).check();
  await budi.locator("textarea.code-input").first().fill("print(nmae)");
  await budi.getByRole("button", { name: "Run" }).click();
  await budi.locator(".output__error", { hasText: "NameError" }).waitFor({ timeout: 90_000 });
  await budi.locator(".choice label", { hasText: "Needs help" }).click();
  await budi.getByLabel("What are you stuck on?").fill("What is wrong with my name?");
  await budi.getByRole("button", { name: "Save" }).click();
  await budi.getByText("Your teacher has your code and your last error").waitFor();

  const tara = await as("ta");
  await go(tara, "/class/py1/help");
  const items = tara.locator("ul.list > li");
  await items.nth(1).waitFor();
  assert.match(await items.nth(0).textContent(), /Citra Student/);   // waiting 4 days: first
  const mine = items.nth(1);
  assert.match(await mine.textContent(), /Budi Student/);
  assert.match(await mine.textContent(), /NameError: name 'nmae' is not defined/);
  await mine.getByLabel("Answer").fill("Check the spelling of name.");
  await mine.getByRole("button", { name: "Send answer" }).click();
  await tara.waitForFunction(() => !document.body.textContent.includes("Budi Student"));

  await go(budi, "/");
  await budi.getByText("Check the spelling of name.").waitFor();
  await budi.context().close();
  await tara.context().close();
});

test("an infinite loop is stopped and Python still works afterwards", async () => {
  const ana = await as("s1");
  await go(ana, "/topic/py-loops");
  const box = ana.locator(".codebox").first();
  await box.locator("textarea").fill("while True:\n    pass");
  await box.getByRole("button", { name: "Run" }).click();
  await box.getByText("Stopped after 5 s").waitFor({ timeout: 90_000 });
  await box.getByRole("button", { name: "Reset" }).click();
  await box.getByRole("button", { name: "Run" }).click();
  await box.locator(".output pre", { hasText: "5 x 7 = 35" }).waitFor({ timeout: 90_000 });
  await ana.context().close();
});

test("attendance: teacher submits the flagged session; history is kept; admin flag clears", async () => {
  const admin = await as("admin");
  const flagged = () => admin.locator("li", { hasText: "Not submitted" }).filter({ hasText: "Python Sec 1" });
  await go(admin, "/dashboard");
  assert.equal(await flagged().count(), 1);

  const tara = await as("ta");
  await go(tara, "/class/py1/attendance");
  await tara.getByText(/session\(s\) need attendance/).waitFor();
  const row = tara.locator("li", { hasText: "Budi Student" });
  await row.locator("label", { hasText: "Absent" }).click();
  await tara.getByRole("button", { name: "Submit attendance" }).click();
  await tara.waitForFunction(() => !document.body.textContent.includes("need attendance"));
  await tara.getByRole("button", { name: "Open" }).first().click();
  await tara.getByRole("button", { name: "Show history" }).click();
  await tara.getByText(/Edit 1 by Tara Teacher/).waitFor();

  await go(admin, "/dashboard");
  assert.equal(await flagged().count(), 0);
  await admin.context().close();
  await tara.context().close();
});

test("pace: student answers anonymously; teacher sees only totals with 5+ answers", async () => {
  const ana = await as("s1");
  await go(ana, "/");
  await ana.getByText("How was the pace?").waitFor();
  await ana.getByRole("button", { name: "About right" }).click();
  await ana.getByText("Your answer was counted anonymously.").waitFor();
  await go(ana, "/");
  assert.equal(await ana.getByText("How was the pace?").count(), 0);   // cannot vote twice

  const tara = await as("ta");
  await go(tara, "/class/py1/pace");
  const rows = tara.locator("tbody tr");
  assert.equal(await rows.count(), 1);   // seeded session with 5 answers; today's 1 answer is hidden
  assert.match(await rows.first().textContent(), /5$/);
  await ana.context().close();
  await tara.context().close();
});

test("curriculum: frozen-level change is rejected; snippets are run; a valid version publishes; errata", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cur-"));
  const base = JSON.parse(readFileSync("curriculum/curriculum.json", "utf8"));

  const frozenEdit = structuredClone(base);
  frozenEdit.tracks[0].levels[0].topics[0].snippets[0].code = 'print("changed")';
  writeFileSync(join(dir, "frozen.json"), JSON.stringify(frozenEdit));

  const good = structuredClone(base);
  good.tracks[0].levels[1].topics[0].title = "Conditionals (if, elif, else)";   // py-l2 not reached yet
  good.tracks[0].levels.push({ id: "py-l4", title: "Level 4: Files", topics: [{ id: "py-files", title: "Files",
    snippets: [{ id: "py-files-bad", title: "Broken", code: "open('missing.txt').read()" }] }] });
  writeFileSync(join(dir, "good.json"), JSON.stringify(good));

  const admin = await as("admin");
  await go(admin, "/admin/curriculum");
  await admin.locator("input[type=file]").setInputFiles(join(dir, "frozen.json"));
  await admin.getByText("Rejected").waitFor();
  await admin.getByText(/Level "py-l1" is frozen/).waitFor();

  await admin.locator("input[type=file]").setInputFiles(join(dir, "good.json"));
  await admin.getByText("The file is valid and leaves frozen levels unchanged.").waitFor();
  await admin.getByText(/11 run, 1 with errors/).waitFor({ timeout: 120_000 });
  assert.match(await admin.locator("tr", { hasText: "py-files-bad" }).textContent(), /FileNotFoundError/);
  await admin.getByLabel("Notes for this version").fill("Adds level 4");
  await admin.getByRole("button", { name: "Publish as version 2" }).click();   // confirm() auto-accepted
  await admin.locator("tr", { hasText: "Adds level 4" }).filter({ hasText: "Latest" }).waitFor();

  // Errata: changing code is refused, fixing a title is accepted.
  await admin.locator(".choice label", { hasText: "Errata" }).click();
  const typo = structuredClone(good);
  typo.tracks[0].levels[0].topics[0].title = "Output with print()";
  writeFileSync(join(dir, "typo.json"), JSON.stringify(typo));
  await admin.locator("input[type=file]").setInputFiles(join(dir, "frozen.json"));
  await admin.getByText(/Not an erratum/).first().waitFor();
  await admin.locator("input[type=file]").setInputFiles(join(dir, "typo.json"));
  await admin.getByText("1 text change(s); nothing else changed.").waitFor();
  await admin.getByText(/run, 1 with errors/).waitFor({ timeout: 120_000 });
  await admin.getByRole("button", { name: "Apply errata to version 2" }).click();
  await admin.getByText("Errata applied to version 2.").waitFor();
  assert.match(await admin.locator("tr", { hasText: "Adds level 4" }).textContent(), /Adds level 4\s*1/);   // errata count

  // The class pinned py-l1 to version 1, so it still sees version 1's level 1; level 4 is new for it.
  const tara = await as("ta");
  await go(tara, "/class/py1/curriculum");
  await tara.getByText("locked to version 1").waitFor();
  await tara.getByText("Level 4: Files").waitFor();
  await admin.context().close();
  await tara.context().close();
});

test("export: downloads JSON with every dataset and clears the warning", async () => {
  const admin = await as("admin");
  await go(admin, "/admin/export");
  await admin.getByText("Last exported 20 days ago").waitFor();
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("button", { name: "Download everything (JSON)" }).click()]);
  const json = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.ok(json.attendance.length > 0);
  assert.ok(json.submissions.some((s) => s.student === "Ana Student"));
  assert.ok(json.help.some((h) => h.student === "Budi Student" && h.answer));
  assert.equal(json.pace.length, 1);
  await admin.getByText(/Downloaded everything/).waitFor();
  const [csv] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("button", { name: "Attendance (CSV)" }).click()]);
  assert.match(readFileSync(await csv.path(), "utf8"), /^﻿class,date,session,student,email,mark,edits/);
  await go(admin, "/");
  assert.equal(await admin.getByText(/Last exported|never been exported/).count(), 0);
  await admin.context().close();
});

test("the builtbyjosef logo appears only in the Settings credit", async () => {
  const ana = await as("s1");
  for (const hash of ["/", "/dashboard", "/library", "/class/py1", "/topic/py-print", "/attributions"]) {
    await go(ana, hash);
    assert.equal(await ana.locator("img").count(), 0, `unexpected image on ${hash}`);
  }
  await go(ana, "/settings");
  await ana.getByText("Designed and built by Josef Yang").waitFor();
  assert.equal(await ana.locator("img").count(), 1);
  await ana.context().close();
});

test("a very long error still saves with Needs help", async () => {
  const dewi = await as("s4");
  await go(dewi, "/class/py1/project/w1");
  await dewi.getByLabel(/Name card/).check();
  await dewi.locator("textarea.code-input").first().fill('raise ValueError("x" * 5000)');
  await dewi.getByRole("button", { name: "Run" }).click();
  await dewi.locator(".output__error", { hasText: "ValueError" }).waitFor({ timeout: 90_000 });
  await dewi.locator(".choice label", { hasText: "Needs help" }).click();
  await dewi.getByRole("button", { name: "Save" }).click();
  await dewi.getByText("Your teacher has your code and your last error").waitFor();
  await dewi.context().close();
});

test("editing old attendance keeps a student who has since been removed", async () => {
  const tara = await as("ta");
  await go(tara, "/class/py1/roster");
  await tara.locator("li", { hasText: "Eko Student" }).getByRole("button", { name: "Remove" }).click();
  await tara.locator("h2", { hasText: "Rejected or removed" }).waitFor();
  await go(tara, "/class/py1/attendance");
  await tara.getByRole("button", { name: "Open" }).last().click();   // oldest submitted session
  const eko = tara.locator("li", { hasText: "Eko Student" });
  await eko.getByText("(no longer in the class)").waitFor();
  await tara.getByRole("button", { name: "Save changes" }).click();
  await tara.waitForFunction(() => !document.querySelector("[aria-label='Attendance for Eko Student']"));
  await tara.getByRole("button", { name: "Open" }).last().click();
  await tara.locator("li", { hasText: "Eko Student" }).waitFor();   // still recorded after the edit
  await tara.context().close();
});

test("pace: if the teacher cancels the session, students are told voting has closed", async () => {
  const tara = await as("ta");
  await go(tara, "/class/py1/attendance");
  await tara.getByRole("button", { name: "Open" }).first().click();   // most recent session
  await tara.getByRole("button", { name: "No session this day" }).click();
  await tara.waitForFunction(() => document.body.textContent.includes("No session"));
  const budi = await as("s2");
  await go(budi, "/");
  await budi.getByRole("button", { name: "Too hard" }).click();
  await budi.getByText("Answers for this session have closed.").waitFor();
  await tara.context().close();
  await budi.context().close();
});

test("no console errors or CSP violations during the run", () => {
  assert.deepEqual(problems, []);
});
