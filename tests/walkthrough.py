"""Manual UX walkthrough — 排班 + PDF + tag-input."""
import os, sys, time
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(OUT, exist_ok=True)
BASE = 'file:///D:/pctools%20win10/dhu/index.html'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
    page = ctx.new_page()
    
    # 1. 排班日历 tab
    page.goto(BASE + '#/settings', wait_until='networkidle')
    page.wait_for_timeout(500)
    page.click('.tabs button.on + button')  # 跳过 rooms
    page.wait_for_timeout(200)
    tabs = page.locator('.tabs button').all()
    for t in tabs:
        if '排班' in t.text_content():
            t.click()
            break
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, 'ux-01-schedule-cal.png'), full_page=True)
    print('1. 排班日历已渲染')
    
    # 2. 点击某天 → 编辑器
    cells = page.locator('.sched-cell').all()
    # 找今天
    for c in cells:
        if 'today' in (c.get_attribute('class') or ''):
            c.click()
            break
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(OUT, 'ux-02-schedule-editor.png'), full_page=True)
    print('2. 点击今天 → 编辑器已打开')
    
    # toggle 几个工程师
    for name in ['周佳辉', '李巍巍', '刘铮']:
        page.evaluate(f"""
        (function(){{
          var picks = document.querySelectorAll('.sched-editor .se-pick .pick');
          for (var i=0;i<picks.length;i++) {{
            if (picks[i].textContent.trim() === '{name}') {{
              picks[i].click(); break;
            }}
          }}
        }})()""")
        page.wait_for_timeout(100)
    page.screenshot(path=os.path.join(OUT, 'ux-03-schedule-picked.png'), full_page=True)
    print('3. toggle 3 个工程师')
    
    # 3. 来电登记 → 当班卡片
    page.goto(BASE + '#/intake', wait_until='networkidle')
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, 'ux-04-intake-duty.png'), full_page=True)
    duty_text = page.locator('.duty-card').inner_text()
    print('4. 来电登记当班:', duty_text[:80])
    
    # 4. 巡视打卡 → tag-input 搜索
    page.goto(BASE + '#/patrol', wait_until='networkidle')
    page.wait_for_timeout(500)
    # 重置一个 pending 任务
    page.evaluate("""
    var st=Store.getState(); var today=Store.fmtDate(Store.nowLocal());
    var p=st.patrols.filter(function(x){return x.date===today && x.status==='pending';})[0];
    if(p){p.status='pending';p.results={};} Store.save(); App.render();
    """)
    page.wait_for_timeout(400)
    page.locator('.patrol-table button:has-text("打卡")').first.click()
    page.wait_for_timeout(300)
    page.locator('.check-grid input[value="fail"]').first.check()
    page.wait_for_timeout(200)
    # tag-input 出现
    page.screenshot(path=os.path.join(OUT, 'ux-05-tag-input-empty.png'))
    print('5. tag-input 空状态')
    
    # 搜索 '22'
    page.fill('#p-rooms-input', '22')
    page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(OUT, 'ux-06-tag-filter.png'))
    print('6. 输入 22 → 过滤下拉')
    
    # 点击一个
    page.evaluate("""
    (function(){
      var items = document.querySelectorAll('#p-dropdown .ti-item');
      if (items.length) items[0].click();
    })()""")
    page.wait_for_timeout(100)
    page.screenshot(path=os.path.join(OUT, 'ux-07-tag-selected.png'))
    print('7. 选中一个')
    
    # 再选一个
    page.evaluate("""
    (function(){
      var items = document.querySelectorAll('#p-dropdown .ti-item');
      for (var i=0;i<items.length;i++) {
        if (items[i].querySelector('.ti-check').textContent.trim() !== '✓') {
          items[i].click(); break;
        }
      }
    })()""")
    page.wait_for_timeout(100)
    page.screenshot(path=os.path.join(OUT, 'ux-08-tag-two.png'))
    print('8. 选中两个 → 下拉勾选 ✓')
    
    # 关闭
    page.click('#modal-foot button:has-text("取消")')
    page.wait_for_timeout(200)
    
    # 5. PDF 导出 + 检查 PDF 质量
    page.goto(BASE + '#/reports', wait_until='networkidle')
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, 'ux-09-reports-before-pdf.png'), full_page=True)
    
    with page.expect_download(timeout=90000) as dl_info:
        page.click('button:has-text("导出 PDF 报告")')
    dl = dl_info.value
    pdf_target = os.path.join(OUT, 'ux-report.pdf')
    dl.save_as(pdf_target)
    pdf_size = os.path.getsize(pdf_target)
    print(f'9. PDF 下载: {pdf_size} bytes, name={dl.suggested_filename}')
    
    browser.close()
    print('\n=== 体验走完，看 screenshots 目录 ===')
