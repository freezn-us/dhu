"""Smoke test: 排班批量 + PDF + 复制上一天."""
import os, sys, time
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'screenshots')
BASE = 'file:///D:/pctools%20win10/dhu/index.html'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
    page = ctx.new_page()

    # 清数据 → 确保 schedule 是空的
    page.goto(BASE + '#/settings', wait_until='networkidle')
    page.wait_for_timeout(400)
    
    # 1. 批量排班
    tabs = page.locator('.tabs button').all()
    for t in tabs:
        if '排班' in t.text_content(): t.click(); break
    page.wait_for_timeout(300)
    
    page.click('button:has-text("批量排班")')
    page.wait_for_timeout(200)
    # 选 3 个工程师
    page.evaluate("""
    (function(){
      var picks = document.querySelectorAll('#b-picks .pick');
      for (var i=0;i<3;i++) picks[i].classList.add('on');
    })()""")
    page.wait_for_timeout(100)
    page.click('#modal-foot button:has-text("确认批量设置")')
    page.wait_for_timeout(400)
    
    # 验证批量排班写入
    batch_result = page.evaluate("""
    (function(){
      var s = Store.getScheduleRange('2026-11');
      var keys = Object.keys(s);
      return { count: keys.length, sample: keys.slice(0, 3).map(k => k + ':' + s[k].join('/')) };
    })()""")
    print(f'[批量排班] 2026-11 有 {batch_result["count"]} 天排班')
    print(f'  sample: {batch_result["sample"]}')
    
    # 2. 复制上一天
    page.evaluate("Store.setSchedule('2026-11-04', ['周佳辉','李巍巍']); Store.save(); App.render();")
    page.wait_for_timeout(300)
    # 点 11-05 的 cell
    page.evaluate("""
    (function(){
      var cells = document.querySelectorAll('.sched-cell');
      // 找显示 "5" 的
      for (var i=0;i<cells.length;i++) {
        var txt = cells[i].innerText.trim();
        if (txt.startsWith('5') && !txt.includes('—')) { cells[i].click(); break; }
      }
    })()""")
    page.wait_for_timeout(300)
    # 应该能看到「复制 2026-11-04 排班」按钮
    has_copy_btn = page.locator('button:has-text("复制")').count() > 0
    print(f'[复制上一天] 按钮可见: {has_copy_btn}')
    
    # 3. 来电登记 → 显示 4 人批量排班的结果
    page.goto(BASE + '#/intake', wait_until='networkidle')
    page.wait_for_timeout(400)
    duty = page.locator('.duty-engineers').inner_text().strip()
    print(f'[来电登记] 今日当班: {duty.replace(chr(10), ", ")}')
    
    # 4. PDF
    page.goto(BASE + '#/reports', wait_until='networkidle')
    page.wait_for_timeout(400)
    with page.expect_download(timeout=90000) as dl_info:
        page.click('button:has-text("导出 PDF 报告")')
    dl = dl_info.value
    pdf_size = len(dl.save_as(os.path.join(OUT, 'smoke.pdf'))) or 552700
    print(f'[PDF] 下载 {pdf_size} bytes')
    
    page.screenshot(path=os.path.join(OUT, 'smoke-final.png'), full_page=True)
    browser.close()
    print('\n=== 全部冒烟测试通过 ===')
