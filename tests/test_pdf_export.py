"""Quick PDF download smoke test."""
import os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'output')
os.makedirs(OUT, exist_ok=True)
URL = 'file:///D:/pctools%20win10/dhu/index.html'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(accept_downloads=True)
    page = ctx.new_page()
    page.goto(URL + '#/reports', wait_until='networkidle', timeout=15000)
    time.sleep(1.5)
    has_jspdf = page.evaluate('!!window.jspdf')
    has_h2c = page.evaluate('!!window.html2canvas')
    print('jspdf loaded:', has_jspdf, 'html2canvas loaded:', has_h2c)
    if not has_jspdf or not has_h2c:
        print('FAIL: vendor libs not loaded')
        browser.close(); sys.exit(1)
    
    try:
        with page.expect_download(timeout=90000) as dl_info:
            page.click('button:has-text("导出 PDF 报告")')
        dl = dl_info.value
        target = os.path.join(OUT, 'smoke-test-report.pdf')
        dl.save_as(target)
        size = os.path.getsize(target)
        print('PDF download OK:', dl.suggested_filename, 'size:', size, 'bytes')
        if size > 5000:
            print('PASS - PDF generated > 5KB')
        else:
            print('WARN - PDF suspiciously small')
    except Exception as e:
        print('FAIL - download error:', e)
    browser.close()
