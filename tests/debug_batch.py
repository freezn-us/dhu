"""Debug batchSchedule — 直接 store eval."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parents[1].joinpath('index.html').as_uri()  # 项目根，换机/换目录零修改
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    page.goto(BASE + '#/settings', wait_until='networkidle')
    page.wait_for_timeout(400)

    # 直接 eval store
    r = page.evaluate("""
    (function(){
      // 先看 dateKey 格式
      var d = new Date(2026, 10, 1);  // 11月1日
      var dk = Store.dateKey(d);
      // 直接调 batchSchedule
      try {
        var c = Store.batchSchedule('2026-11-01', '2026-11-03', ['周佳辉','李巍巍']);
        var r = Store.getScheduleRange('2026-11');
        return {
          dateKey: dk,
          dateKeyNow: Store.dateKey(Store.nowLocal()),
          batchResult: c,
          getScheduleRange: r,
          rawSettingsSchedule: Store.getState().settings.schedule
        };
      } catch(e) { return { error: e.message }; }
    })()""")
    print(json.dumps(r, ensure_ascii=False, indent=2))
    browser.close()
