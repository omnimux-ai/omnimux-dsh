#!/usr/bin/env python3.14
"""
#3112 QA screenshots — real browser (playwright), functional path:
E1 无账号 → 导入对话框 → E2 进度承诺 → 内容自动出现 → 失败态(原因+重试) → 重试回 E2 → 分流链接。
Both themes. Evidence lands next to this harness (docs/evidence/account-monitor-v2-first-fetch-3112/).
"""
import json
import pathlib
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

EVIDENCE = pathlib.Path(__file__).resolve().parent.parent
DEMO = "http://127.0.0.1:8311/account-monitor-v2-first-fetch-3112/tmp-qa/demo.html"
OUT = EVIDENCE

def shot(page, name):
    path = OUT / name
    page.screenshot(path=str(path), full_page=False)
    print(f"  shot {path.name}")

def main():
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8311", "-d", str(EVIDENCE.parent)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(0.6)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            for theme in ("dark", "light"):
                page = browser.new_page(viewport={"width": 1400, "height": 900})
                page.goto(f"{DEMO}?theme={theme}")
                page.wait_for_selector("text=还没有监控账号", timeout=8000)
                tag = "dark" if theme == "dark" else "light"

                shot(page, f"01-empty-{tag}.png")

                # The real import path: open the dialog, paste a profile URL,
                # let classify echo, submit → the account is queued.
                page.click("text=导入对标账号")
                page.wait_for_selector("input[type='url']", timeout=5000)
                page.fill("input[type='url']", "https://www.tiktok.com/@meow_daily")
                page.locator("input[type='url']").blur()
                page.wait_for_selector("text=将导入账号", timeout=5000)
                page.click("button:has-text('导入'):not(:has-text('对标'))")

                page.wait_for_selector("text=正在为你抓取内容", timeout=8000)
                shot(page, f"02-fetching-{tag}.png")

                # First fetch lands: the Host reports idle + the post collected;
                # the watch's last poll re-reads page 1 — content appears.
                page.evaluate("""() => {
                  const h = window.__qaHost;
                  h.accounts = [{ id: 'acc-1', handle: '@meow_daily', nickname: '喵星日常', platform: 'tiktok', refresh_state: 'idle', post_count: 1 }];
                  h.posts = [window.__qaPost];
                  window.__qaApply();
                }""")
                page.wait_for_selector("text=猫咪饮水机实测", timeout=8000)
                shot(page, f"03-content-{tag}.png")

                # First fetch failed terminally: error + no posts → reason + retry.
                page.evaluate("""() => {
                  const h = window.__qaHost;
                  h.accounts = [{ id: 'acc-1', handle: '@meow_daily', nickname: '喵星日常', platform: 'tiktok', refresh_state: 'error', post_count: 0, consecutive_failures: 4 }];
                  h.posts = [];
                  window.__qaApply();
                }""")
                page.wait_for_selector("text=连续 4 次刷新失败", timeout=8000)
                shot(page, f"04-failed-{tag}.png")

                page.click("button:has-text('重试')")
                page.wait_for_selector("text=正在为你抓取内容", timeout=8000)
                shot(page, f"05-retry-{tag}.png")

                # The browse-out link hands navigation to the shell.
                page.click("text=去逛逛爆款趋势")
                page.wait_for_selector("text=已切到爆款趋势", timeout=5000)
                shot(page, f"06-browse-trend-{tag}.png")

                page.close()
            browser.close()
    finally:
        server.terminate()

if __name__ == "__main__":
    main()
