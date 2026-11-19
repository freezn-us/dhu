"""PDF 报告下载冒烟测试（启动真实服务，避免 file:// 与硬编码路径）。"""
import os, sys, json, time, socket, subprocess, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'output')
os.makedirs(OUT, exist_ok=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
TMP = tempfile.mkdtemp(prefix='dhu_pdf_')
env = os.environ.copy()
env.update(DHU_OPS_PORT=str(port), DHU_OPS_DB=os.path.join(TMP, 'dhu_ops.db'),
           DHU_OPS_HOST='127.0.0.1', DHU_OPS_INITIAL_ADMIN_PWD='admin123')
log = open(os.path.join(TMP, 'server.log'), 'ab', buffering=0)
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], cwd=ROOT, env=env,
                       stdout=log, stderr=subprocess.STDOUT)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    req = urllib.request.Request(f'http://127.0.0.1:{port}/api/login',
                                 data=json.dumps({'name': 'admin', 'pwd': 'admin123'}).encode(),
                                 headers={'Content-Type': 'application/json'})
    token = json.load(urllib.request.urlopen(req))['token']

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(accept_downloads=True)
        ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s)}catch(e){}" % json.dumps(token))
        page = ctx.new_page()
        page.goto(f'http://127.0.0.1:{port}/index.html#/reports', wait_until='load', timeout=15000)
        page.wait_for_timeout(1200)
        btn = page.locator('button', has_text='导出 PDF 报告').first
        with page.expect_download(timeout=60000) as dl_info:
            btn.click()
        dl = dl_info.value
        target = os.path.join(OUT, 'smoke-test-report.pdf')
        dl.save_as(target)
        size = os.path.getsize(target)
        print('PDF download OK:', dl.suggested_filename, 'size:', size, 'bytes')
        print('PASS - PDF generated > 5KB' if size > 5000 else 'WARN - PDF suspiciously small')
        browser.close()
finally:
    srv.terminate()
