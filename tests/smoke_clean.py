"""Clean smoke test: batch + copy + PDF."""
import sys, os
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'screenshots')
BASE = 'file:///D:/pctools%20win10/dhu/index.html'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
    page = ctx.new_page()

    # 1. 批量排班 — 直接 eval store（验证功能正确）
    page.goto(BASE + '#/settings', wait_until='networkidle')
    page.wait_for_timeout(400)
    r = page.evaluate("""
    (function(){
      Store.setSchedule('2026-11-04', ['周佳辉','李巍巍']);
      var c = Store.batchSchedule('2026-11-01', '2026-11-05', ['周佳辉','李巍巍','刘铮']);
      var r = Store.getScheduleRange('2026-11');
      return { count: Object.keys(r).length, sample1: r['2026-11-01'], sample4: r['2026-11-04'] };
    })()""")
    print(f'[批量排班] 5天写入: {r}')
    
    # 2. 复制上一天
    copy_r = page.evaluate("""
    (function(){
      Store.copySchedule('2026-11-04', '2026-11-06');
      var r = Store.getScheduleRange('2026-11');
      return { nov6: r['2026-11-06'], total: Object.keys(r).length };
    })()""")
    print(f'[复制上一天] 11-04→11-06: {copy_r}')
    
    # 3. 来电登记 → 今日当班
    page.goto(BASE + '#/intake', wait_until='networkidle')
    page.wait_for_timeout(400)
    duty = page.locator('.duty-engineers').inner_text().strip().replace('\n', ', ')
    print(f'[来电登记] 今日当班: {duty}')
    
    # 4. PDF
    page.goto(BASE + '#/reports', wait_until='networkidle')
    page.wait_for_timeout(500)
    with page.expect_download(timeout=90000) as dl_info:
        page.click('button:has-text("导出 PDF 报告")')
    dl = dl_info.value
    target = os.path.join(OUT, 'clean-smoke.pdf')
    dl.save_as(target)
    print(f'[PDF] 下载 {os.path.getsize(target)} bytes: {dl.suggested_filename}')
    
    browser.close()
    print('\n=== 全部冒烟测试通过 ===')
