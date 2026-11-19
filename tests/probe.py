"""Deep UX probe — 找排班和 PDF 的体验别扭点."""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'screenshots')
BASE = Path(__file__).resolve().parents[1].joinpath('index.html').as_uri()  # 项目根，换机/换目录零修改

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 960})
    page = ctx.new_page()

    page.goto(BASE + '#/settings', wait_until='networkidle')
    page.wait_for_timeout(400)

    # → 排班 tab
    tabs = page.locator('.tabs button').all()
    for t in tabs:
        if '排班' in t.text_content(): t.click(); break
    page.wait_for_timeout(300)

    # 1. 空输入下拉条数
    n_dropdown_items = page.evaluate("""
    (function(){
      // 模拟 tag-input 空输入场景 — 找一个弹窗里的 tag-input 才能测，
      // 换个思路：直接测排班编辑器的工程师 pick 数量
      var picks = document.querySelectorAll('.sched-editor .se-pick .pick');
      return picks.length;
    })()
    """)
    print(f'[排班] 编辑器可选工程师: {n_dropdown_items}')

    # 2. 日历 cell 内排班人数显示上限 — 切换编辑某天后，日历是否实时更新？
    # 先点今天
    page.evaluate("""
    (function(){
      var cells = document.querySelectorAll('.sched-cell');
      for (var i=0;i<cells.length;i++) {
        if (cells[i].querySelector('.d .today')) { cells[i].click(); break; }
      }
    })()""")
    page.wait_for_timeout(200)
    
    # 编辑器 toggle 1 个工程师 → 观察 App.render 后日历 cell 是否刷新
    before = page.evaluate("""
    (function(){
      var cell = document.querySelector('.sched-cell.selected');
      return cell ? cell.innerText.trim() : '';
    })()""")
    print(f'[排班] 编辑前今天 cell 文本: "{before[:80]}..."')

    # toggle 一个工程师
    page.evaluate("""
    (function(){
      var picks = document.querySelectorAll('.sched-editor .se-pick .pick');
      if (picks.length) picks[0].click();
    })()""")
    page.wait_for_timeout(400)  # App.render 会重渲染
    
    after_toggle = page.evaluate("""
    (function(){
      var cell = document.querySelector('.sched-cell.selected');
      return cell ? cell.innerText.trim() : '';
    })()""")
    has_rebuilt = page.evaluate("!!document.querySelector('.sched-cell.selected')")
    print(f'[排班] toggle 后 cell 文本: "{after_toggle[:80]}..."  editor重建={has_rebuilt}')

    # 3. 批量操作检查 — 日历顶部有没有「复制上一天」「批量分配」
    header_html = page.evaluate("document.querySelector('.sched-wrap .sched-header')?.innerHTML || ''")
    has_copy = '复制' in header_html or 'copy' in header_html.lower()
    has_prev = '上一天' in header_html or 'prev' in header_html.lower()
    has_batch = '批量' in header_html or 'batch' in header_html.lower()
    print(f'[排班] 顶部按钮 — 复制:{has_copy} 上一天:{has_prev} 批量:{has_batch}')

    # 4. 排班编辑器底部有没有批量快捷
    editor_btns = page.evaluate("""
    (function(){
      var btns = document.querySelectorAll('.sched-editor .btn');
      return Array.from(btns).map(b => b.textContent.trim());
    })()""")
    print(f'[排班] 编辑器底部按钮: {editor_btns}')

    # 5. 检查 Store.settings.schedule 的结构 — toggle 后是否写入
    page.evaluate("Store.setSchedule('2026-11-05', ['周佳辉','李巍巍','刘铮','宋华']); App.render();")
    page.wait_for_timeout(300)
    page.goto(BASE + '#/intake', wait_until='networkidle')
    page.wait_for_timeout(400)
    
    duty_on_intake = page.locator('.duty-engineers').inner_text()
    print(f'[来电登记] 今日当班 (排4人后): {duty_on_intake.strip()}')

    # 6. PDF 生成 — 检查容器是否清理干净
    page.goto(BASE + '#/reports', wait_until='networkidle')
    page.wait_for_timeout(400)
    
    # 预加载 vendor
    has_vendor = page.evaluate("!!window.jspdf && !!window.html2canvas")
    print(f'[PDF] vendor加载: {has_vendor}')

    # 测 HTML 报告的 A4 适配问题
    html_ok = page.evaluate("""
    (function(){
      var s = Store.stats();
      var days = Math.round((new Date() - new Date(Store.fromDayStr ? Store.fromDayStr(29) : UI.daysAgoStr(29))) / 86400000) + 1;
      var html = Views.reports.renderPdfReport(s, days, 'test', Views.reports.buildAnalysis(s, days));
      // 检查 renderPdfReport 生成的 HTML 里有没有 @page 或 a4 相关设置
      return {
        hasP: html.indexOf('@page') >= 0,
        width1100: html.indexOf('width:1100') >= 0 || html.indexOf('width: 1100') >= 0,
        totalLen: html.length
      };
    })()""")
    print(f'[PDF] HTML 报告检查: {html_ok}')

    page.screenshot(path=os.path.join(OUT, 'ux-probe-final.png'), full_page=True)
    browser.close()

    print('\n=== 探针完成 ===')
    print('别扭点候选:')
    print('1. 排班日历没有「复制上一天/批量分配」 — 每天要手动 toggle')
    print('2. 排班日历 cell 64px 太紧，标签多了会挤')
    print('3. PDF renderPdfReport 没 @page — html2canvas 截图基准不是 A4')
    print('4. 排班编辑器 toggle 后 App.render 重建整个页面，体验上可能有闪烁')
    print('5. 排班无「按楼栋分组」一键分配')
