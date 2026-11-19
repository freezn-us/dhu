"""自定义日历控件：三处日志日期框未来日期置灰不可选、翻月/月份快选后点选日期正确回填、
JS 层拦截未来日期、回到今天按钮、排班日历选中态。
运行：python tests/test_date_clamp.py
"""
import sys, os, json, time, subprocess, tempfile, urllib.request, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根，换机/换目录零修改
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
TMP_DIR = tempfile.mkdtemp(prefix='dhu_cal_')
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port)
env['DHU_OPS_DB'] = os.path.join(TMP_DIR, 'dhu_ops.db')
env['DHU_OPS_INITIAL_ADMIN_PWD'] = 'admin123'  # 测试固定初始口令，跳过强制改密
log = open(os.path.join(TMP_DIR, 'server.log'), 'ab', buffering=0)
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], cwd=ROOT, env=env,
                       stdout=log, stderr=subprocess.STDOUT)
for _ in range(50):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1)
        break
    except Exception:
        time.sleep(0.2)
req = urllib.request.Request(f'http://127.0.0.1:{port}/api/login',
                             data=json.dumps({'name': 'admin', 'pwd': 'admin123'}).encode(),
                             headers={'Content-Type': 'application/json'})
tok = json.load(urllib.request.urlopen(req))['token']
base = f'http://127.0.0.1:{port}/index.html'
today = time.strftime('%Y-%m-%d')
today_d = int(today[8:10])
results = []
def check(name, cond, detail=''):
    results.append(cond)
    print(('PASS' if cond else 'FAIL'), '-', name, detail)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context()
    ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(tok))
    pg = ctx.new_page()

    # ① 三个页面都有自定义日历控件，且默认显示今天
    for route, dp_id in [('daily-log', 'dl-date'), ('patrol', 'pt-date'), ('log-entry', 'e-date')]:
        pg.goto(f'{base}#/{route}', wait_until='load')
        pg.wait_for_timeout(600)
        txt = pg.locator(f'#dp-val-{dp_id}').inner_text()
        check(f'{route} 日历控件显示今天', txt == today, txt)

    # ② 打开面板：今天之后的日期全部置灰 disabled
    pg.goto(f'{base}#/daily-log', wait_until='load'); pg.wait_for_timeout(500)
    pg.locator('#dp-dl-date .dp-box').click(); pg.wait_for_timeout(300)
    check('日历面板展开', pg.locator('#dp-panel').is_visible(), '')
    dis_ok = pg.evaluate(f"""() => {{
      const cells = [...document.querySelectorAll('#dp-panel .dp-cell')];
      const dis = cells.filter(c => c.classList.contains('dis')).map(c => +c.textContent);
      const ena = cells.filter(c => !c.classList.contains('dis')).map(c => +c.textContent);
      return dis.length > 0 && dis.every(d => d > {today_d}) && ena.every(d => d <= {today_d});
    }}""")
    check('未来日期全部置灰、过去可选', dis_ok, '')

    # ③ 月份快选：点标题 → 12 个月网格（含 12 月）→ 选 12 月 → 全部置灰
    pg.locator('#dp-panel .dp-label').click(); pg.wait_for_timeout(200)
    mtexts = pg.locator('#dp-panel .dp-mcell').all_inner_texts()
    check('月份快选含全部 12 个月', len(mtexts) == 12 and '12 月' in mtexts, str(mtexts[:4]))
    pg.locator('#dp-panel .dp-mcell', has_text='12 月').click(); pg.wait_for_timeout(200)
    label = pg.locator('#dp-panel .dp-label').inner_text()
    all_dis = pg.evaluate("""() => {
      const cells = [...document.querySelectorAll('#dp-panel .dp-cell')];
      return cells.length > 0 && cells.every(c => c.classList.contains('dis'));
    }""")
    check('切到 12 月（未来月份）日期全部置灰', '12 月' in label and all_dis, label)

    # ④ 翻回上个月，点 15 号 → 立即回填并切换页面日期
    pg.evaluate("UI.dp.setMode('day')"); pg.wait_for_timeout(150)
    pg.evaluate("UI.dp.nav(-1)"); pg.wait_for_timeout(150)   # 11 月
    pg.evaluate("UI.dp.nav(-1)"); pg.wait_for_timeout(150)   # 10 月
    pg.locator('#dp-panel .dp-cell:not(.dis)', has_text='15').first.click(); pg.wait_for_timeout(600)
    expect = today[:4] + '-10-15'
    val = pg.locator('#dp-val-dl-date').inner_text()
    check('翻月后点选日期立即回填', val == expect, val)
    check('面板选完后自动关闭', pg.locator('#dp-panel').is_hidden(), '')

    # ⑤ JS 层拦截未来日期（双保险）：先回到今天，再设未来日期，应保持今天不变
    pg.evaluate(f"Views.dailyLog.setDate('{today}')"); pg.wait_for_timeout(400)
    fds = time.strftime('%Y-%m-%d', time.localtime(time.time() + 5 * 86400))
    pg.evaluate(f"Views.dailyLog.setDate('{fds}')")
    pg.wait_for_timeout(400)
    toast = pg.locator('#toast').inner_text()
    val = pg.locator('#dp-val-dl-date').inner_text()
    check('JS 拦截未来日期并提示', '不能' in toast and val == today, f'{toast[:20]} | {val}')

    # ⑥ 回到今天按钮：先切到昨天再点按钮
    yds = time.strftime('%Y-%m-%d', time.localtime(time.time() - 86400))
    pg.evaluate(f"Views.dailyLog.setDate('{yds}')")
    pg.wait_for_timeout(400)
    btn = pg.locator('button', has_text='回到今天')
    check('非今天显示「回到今天」按钮', btn.count() == 1, '')
    if btn.count():
        btn.click(); pg.wait_for_timeout(400)
        check('点击后回到今天', pg.locator('#dp-val-dl-date').inner_text() == today, '')

    # ⑦ 排班日历选中态样式存在
    pg.goto(f'{base}#/settings', wait_until='load'); pg.wait_for_timeout(500)
    pg.evaluate("Views.settings.switchTab('schedule')"); pg.wait_for_timeout(400)
    pg.locator('.sched-cell:not(.empty)').first.click(); pg.wait_for_timeout(400)
    shadow = pg.eval_on_selector('.sched-cell.selected', 'el => getComputedStyle(el).boxShadow')
    check('排班日历选中格高亮（inset 光环）', 'inset' in shadow and '22, 119, 255' in shadow, shadow[:40])
    b.close()
srv.terminate()
print(f"\n通过 {sum(results)} / {len(results)}")
