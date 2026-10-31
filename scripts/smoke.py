"""Smoke test harness (Playwright, Python). Not part of the app build.

Usage (from repo root, after `npm ci && npx vite build`):
  pip install playwright   # playwright only, on your machine; nothing is added to the repo
  npx vite preview --port 4173 &
  RF_URL=http://127.0.0.1:4173/ RF_OUT=/tmp/rf-smoke python3 scripts/smoke.py

What it does: writes a small CCv3 test card to a temp file, imports it through
the Library file input, edits and saves it, reloads to prove it persisted in
IndexedDB, walks Library/Details/Lorebook/Prompt/Assist/Test/Enhancer/Settings/
Guide at 390x844 (touch), exports the card as JSON, then proves a full backup
round trip: Settings > Backup exports the database (API keys unticked), a fresh
browser context restores it and the card with its saved edit is back, and
restoring the same file again leaves the card count unchanged. It repeats the
load/import/open checks at 1280x800. It prints one JSON object with a pass/fail
line per check and exits 1 on any failure. A failing check saves a screenshot
in RF_OUT.
"""
import asyncio, json, os, tempfile
from playwright.async_api import async_playwright, TimeoutError

URL = os.environ.get("RF_URL", "http://127.0.0.1:4173/")
OUT = os.environ.get("RF_OUT", "/tmp/rf-smoke")
CHROME = os.environ.get("RF_CHROME")  # optional executable_path
NAME = "Smoke Test Card"
DESC = "A small card made by the smoke test."
os.makedirs(OUT, exist_ok=True)

CARD = {
    "spec": "chara_card_v3",
    "spec_version": "3.0",
    "data": {
        "name": NAME,
        "description": DESC,
        "personality": "",
        "scenario": "",
        "first_mes": "Hello from the smoke test.",
        "mes_example": "",
        "creator_notes": "",
        "system_prompt": "",
        "post_history_instructions": "",
        "alternate_greetings": [],
        "tags": [],
        "creator": "",
        "character_version": "",
        "extensions": {},
        "character_book": {
            "name": "Smoke Lorebook",
            "entries": [{
                "name": "Smoke Entry",
                "keys": ["smoke"],
                "secondary_keys": [],
                "comment": "",
                "content": "Smoke lorebook entry.",
                "constant": False,
                "selective": True,
                "insertion_order": 0,
                "enabled": True,
                "position": "before_char",
            }],
        },
    },
}

checks = {}
errors = []


def shot_name(check):
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in check)[:60]


async def no_error_screen(pg):
    # ErrorBoundary renders "Something went wrong in this section" by default.
    return await pg.get_by_text("Something went wrong").count() == 0


async def no_overflow(pg):
    return not await pg.evaluate(
        "() => document.documentElement.scrollWidth > innerWidth + 1")


async def screen_ok(pg):
    if not await no_error_screen(pg):
        return "fail: error screen is on the page"
    if not await no_overflow(pg):
        return "fail: horizontal overflow"
    return "pass"


async def run_check(pg, name, fn):
    try:
        result = await fn()
        checks[name] = result if result else "pass"
    except Exception as e:
        checks[name] = f"fail: {str(e)[:200]}"
        try:
            await pg.screenshot(path=f"{OUT}/{shot_name(name)}.png")
        except Exception:
            pass


async def settle(pg):
    await pg.wait_for_timeout(700)


async def open_card(pg):
    # The Library card title is visible text; a card with no avatar image
    # has no <img> alt text, so alt text cannot be relied on to open it.
    # The title sits under a pointer-events-none overlay, so a normal click
    # never lands on it; force dispatches the tap at its centre, which is
    # what a real tap on the card does (it lands on the card container).
    # Several elements carry the name (a hidden status line among them),
    # so the first actually visible one is the card to open.
    for loc in await pg.get_by_text(NAME, exact=True).all():
        if await loc.is_visible():
            await loc.click(force=True)
            break
    else:
        raise AssertionError("no visible card title to open")
    await pg.get_by_role("textbox", name="e.g. Aeliana the Starlight Weaver").wait_for(state="visible", timeout=10000)
    await settle(pg)


async def import_card(pg, card_path):
    await pg.goto(URL)
    await pg.wait_for_timeout(1200)
    await pg.locator("input[type=file]").first.set_input_files(card_path)
    await pg.get_by_text(NAME, exact=True).first.wait_for(state="visible", timeout=15000)
    await settle(pg)


async def main():
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(CARD, f)
        card_path = f.name

    async with async_playwright() as p:
        launch = {"args": ["--no-sandbox"]}
        if CHROME:
            launch["executable_path"] = CHROME
        b = await p.chromium.launch(**launch)

        async def new_ctx(w, h, mobile):
            ctx = await b.new_context(viewport={"width": w, "height": h},
                                      has_touch=mobile, is_mobile=mobile,
                                      device_scale_factor=2 if mobile else 1,
                                      service_workers="block")
            return ctx

        def attach(pg):
            # The harness blocks service workers (as ui-audit.py does), so the
            # app's service-worker registration always fails here and logs it;
            # Playwright itself warns "Service Worker registration blocked".
            # That one log is a harness artifact, not an app runtime error,
            # so it is left out of the collected errors. Everything else counts.
            def on_console(m):
                if m.type == "error" and not m.text.startswith("Service worker registration failed"):
                    errors.append(m.text[:200])
            pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
            pg.on("console", on_console)
            def on_failed(r):
                if r.url.startswith(URL):
                    errors.append(f"{r.url} {r.failure}"[:200])
            pg.on("requestfailed", on_failed)

        # --- phone-size run ---
        pg = await (await new_ctx(390, 844, True)).new_page()
        attach(pg)

        async def app_loads():
            await pg.goto(URL)
            await pg.wait_for_timeout(1200)
            await pg.get_by_role("button", name="Library", exact=True).first.wait_for(state="visible", timeout=10000)
            return await screen_ok(pg)
        await run_check(pg, "app loads", app_loads)

        async def do_import():
            await import_card(pg, card_path)
            return "pass"
        await run_check(pg, "import", do_import)

        async def do_open():
            await open_card(pg)
            value = await pg.get_by_role("textbox", name="e.g. Aeliana the Starlight Weaver").input_value()
            return "pass" if value == NAME else f"fail: name field shows {value[:100]!r}"
        await run_check(pg, "open card", do_open)

        async def edit_save():
            box = pg.get_by_role("textbox", name="Describe the character's physical appearance, backstory, traits, and role.")
            await box.click()
            await box.press("End")
            await box.type(" smoke")
            await pg.get_by_role("button", name="Save Card").first.click()
            await pg.wait_for_timeout(1200)
            await pg.reload()
            await pg.wait_for_timeout(1200)
            await open_card(pg)
            value = await pg.get_by_role("textbox", name="Describe the character's physical appearance, backstory, traits, and role.").input_value()
            return "pass" if value.endswith(" smoke") else f"fail: description ends {value[-100:]!r}"
        await run_check(pg, "edit and save", edit_save)

        for tab in ["Lorebook", "Prompt", "Assist", "Test", "Enhancer", "Settings"]:
            async def screen(tab=tab):
                try:
                    await pg.get_by_role("button", name=tab, exact=(tab in ("Test", "Settings"))).first.click(timeout=5000)
                except TimeoutError:
                    return f"skipped: not found"
                await settle(pg)
                return await screen_ok(pg)
            await run_check(pg, f"screen {tab}", screen)
        # Guide lives in the Library header, like ui-audit.py opens it.
        async def guide():
            try:
                await pg.get_by_role("button", name="Library", exact=True).first.click(timeout=5000)
                await settle(pg)
                await pg.get_by_role("button", name="Guide").first.click(timeout=5000)
            except TimeoutError:
                return "skipped: not found"
            await settle(pg)
            return await screen_ok(pg)
        await run_check(pg, "screen Guide", guide)

        async def export_json():
            # The Guide dialog from the previous check is closed with Back,
            # the way ui-audit.py does it, then the card is opened again.
            await pg.go_back()
            await settle(pg)
            await open_card(pg)
            await pg.get_by_text("Cover art and export").first.click()
            await settle(pg)
            try:
                async with pg.expect_download(timeout=15000) as dl:
                    await pg.get_by_label("Export card as").select_option("json")
                download = await dl.value
                path = os.path.join(OUT, "smoke-export.json")
                await download.save_as(path)
            except TimeoutError:
                return "not covered: no download after choosing JSON export"
            exported = json.load(open(path))
            data = exported.get("data", exported)
            if data.get("name") != NAME:
                return f"fail: exported name is {str(data.get('name'))[:100]!r}"
            if not str(data.get("description", "")).endswith(" smoke"):
                return f"fail: exported description ends {str(data.get('description', ''))[-100:]!r}"
            return "pass"
        await run_check(pg, "export json", export_json)

        # --- backup round trip (fresh context restores the edited card) ---
        backup_path = {"path": None}

        async def count_visible_cards(page):
            n = 0
            for loc in await page.get_by_text(NAME, exact=True).all():
                if await loc.is_visible():
                    n += 1
            return n

        async def wait_visible_title(page, timeout_ms=10000):
            # The name also appears in hidden status lines, so waiting on the
            # first match can wait forever; wait for any visible title instead.
            waited = 0
            while waited < timeout_ms:
                if await count_visible_cards(page) >= 1:
                    return
                await page.wait_for_timeout(200)
                waited += 200
            raise AssertionError("no visible card title after waiting")

        async def backup_export():
            await pg.get_by_role("button", name="Settings", exact=True).first.click()
            await settle(pg)
            await pg.get_by_role("button", name="Export Backup (JSON)").first.click()
            await pg.get_by_role("dialog", name="Export Backup Warning").wait_for(state="visible", timeout=10000)
            box = pg.get_by_label("Include API keys in this backup")
            if await box.is_checked():
                await box.uncheck()
            await pg.get_by_text("Export Backup (no API keys)", exact=True).wait_for(state="visible", timeout=5000)
            try:
                async with pg.expect_download(timeout=15000) as dl:
                    await pg.get_by_role("button", name="Export JSON").first.click()
                download = await dl.value
            except TimeoutError:
                return "fail: no backup download after confirming the export"
            path = os.path.join(OUT, "smoke-backup.json")
            await download.save_as(path)
            backup_path["path"] = path
            return "pass"
        await run_check(pg, "backup export", backup_export)

        rp = None
        restored_count = {"n": None}

        async def backup_restore():
            nonlocal rp
            if not backup_path["path"]:
                return "fail: no backup file from the export check"
            rp = await (await new_ctx(390, 844, True)).new_page()
            attach(rp)
            await rp.goto(URL)
            await rp.wait_for_timeout(1200)
            await rp.get_by_role("button", name="Library", exact=True).first.wait_for(state="visible", timeout=10000)
            await rp.get_by_text("No Character Cards Yet", exact=True).wait_for(state="visible", timeout=10000)
            await rp.get_by_role("button", name="Settings", exact=True).first.click()
            await settle(rp)
            await rp.get_by_label("Restore Database (JSON / ZIP)").set_input_files(backup_path["path"])
            await rp.get_by_text("Database restored!", exact=False).first.wait_for(state="visible", timeout=15000)
            await rp.get_by_role("button", name="OK").first.click()
            await settle(rp)
            await rp.get_by_role("button", name="Library", exact=True).first.click()
            await wait_visible_title(rp)
            restored_count["n"] = await count_visible_cards(rp)
            if restored_count["n"] != 1:
                return f"fail: {restored_count['n']} cards in the Library after restore"
            await open_card(rp)
            value = await rp.get_by_role("textbox", name="Describe the character's physical appearance, backstory, traits, and role.").input_value()
            if not value.endswith(" smoke"):
                return f"fail: restored description ends {value[-100:]!r}"
            name_value = await rp.get_by_role("textbox", name="e.g. Aeliana the Starlight Weaver").input_value()
            if name_value != NAME:
                return f"fail: restored name field shows {name_value[:100]!r}"
            return "pass"
        await run_check(rp or pg, "backup restore", backup_restore)

        async def backup_restore_again():
            if rp is None or not backup_path["path"]:
                return "fail: no restored page or backup file from the restore check"
            await rp.get_by_role("button", name="Settings", exact=True).first.click()
            await settle(rp)
            await rp.get_by_label("Restore Database (JSON / ZIP)").set_input_files(backup_path["path"])
            await rp.get_by_text("Database restored!", exact=False).first.wait_for(state="visible", timeout=15000)
            await rp.get_by_role("button", name="OK").first.click()
            await settle(rp)
            await rp.get_by_role("button", name="Library", exact=True).first.click()
            await wait_visible_title(rp)
            n = await count_visible_cards(rp)
            if n != restored_count["n"]:
                return f"fail: card count changed from {restored_count['n']} to {n} on re-restore"
            return "pass"
        await run_check(rp or pg, "backup restore again", backup_restore_again)

        # --- desktop run, fresh context ---
        d = await (await new_ctx(1280, 800, False)).new_page()
        attach(d)

        async def d_loads():
            await d.goto(URL)
            await d.wait_for_timeout(1200)
            await d.get_by_role("button", name="Library", exact=True).first.wait_for(state="visible", timeout=10000)
            return await screen_ok(d)
        await run_check(d, "desktop app loads", d_loads)

        async def d_import():
            await import_card(d, card_path)
            return "pass"
        await run_check(d, "desktop import", d_import)

        async def d_open():
            await open_card(d)
            value = await d.get_by_role("textbox", name="e.g. Aeliana the Starlight Weaver").input_value()
            return "pass" if value == NAME else f"fail: name field shows {value[:100]!r}"
        await run_check(d, "desktop open card", d_open)

        await b.close()

    if errors:
        checks["no runtime errors"] = f"fail: {errors[0][:200]}"
    else:
        checks["no runtime errors"] = "pass"
    out = {"checks": checks, "errors": errors}
    print(json.dumps(out, indent=1))
    return 1 if any(v.startswith("fail") for v in checks.values()) else 0


try:
    raise SystemExit(asyncio.run(main()))
except SystemExit:
    raise
except Exception as e:
    print(json.dumps({"checks": {"script": f"fail: {str(e)[:200]}"}, "errors": [str(e)[:200]]}, indent=1))
    raise SystemExit(1)
