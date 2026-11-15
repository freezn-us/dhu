"""验证：顶栏登录徽章与退出按钮在白底顶栏上清晰可见；单条录入日历控件选日期即时回填+toast；
排班日历 2026-12 可达。
运行：python tests/test_topbar_cal.py
"""
import sys, os, json, time, subprocess, tempfile, urllib.request, socket
# 依赖由项目 .build-venv 提供；仅当旧机器临时 pylibs 真实存在时才加入搜索路径
_PYLIBS = r'C:\Users\user\AppData\Local\Temp\pylibs'
if os.path.isdir(_PYLIBS):
    sys.path.insert(0, _PYLIBS)
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根，换机/换目录零修改
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port)
env['DHU_OPS_DB'] = os.path.join(tempfile.gettempdir(), f'dhu_tb_{port}.db')
log = open(os.path.join(tempfile.gettempdir(), f'dhu_tb_{port}.log'), 'ab', buffering=0)
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
results = []
def check(name, cond, detail=''):
    results.append(cond)
    print(('PASS' if cond else 'FAIL'), '-', name, detail)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context()
    ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(tok))
    pg = ctx.new_page()

    # ① 顶栏：登录徽章（admin）与退出按钮在白底上清晰可见
    pg.goto(base + '#/dashboard', wait_until='load'); pg.wait_for_timeout(600)
    user = pg.eval_on_selector('#login-user', '''el => {
      const c = getComputedStyle(el);
      return {text: el.textContent, color: c.color, bg: c.backgroundColor, display: c.display};
    }''')
    print('login-user:', json.dumps(user, ensure_ascii=False))
    check('登录徽章显示且含 admin', 'admin' in user['text'] and user['display'] != 'none', user['text'])
    check('登录徽章深色文字白底可见', user['color'] == 'rgb(31, 35, 41)' and user['bg'] == 'rgb(240, 245, 255)',
          f"{user['color']} / {user['bg']}")
    out = pg.eval_on_selector('#logout-btn', '''el => {
      const c = getComputedStyle(el);
      return {text: el.textContent, color: c.color, bw: c.borderTopWidth, display: c.display};
    }''')
    print('logout-btn:', json.dumps(out, ensure_ascii=False))
    check('按钮文字为「退出登录」', out['text'] == '退出登录', out['text'])
    check('退出按钮深色文字+边框白底可见', out['color'] == 'rgb(100, 106, 115)' and out['bw'] == '1px' and out['display'] != 'none',
          f"{out['color']} / {out['bw']}")

    # ② 单条录入日历控件：翻月点选昨天 → 框内立即回填 + toast
    yds_t = time.localtime(time.time() - 86400)
    yds = time.strftime('%Y-%m-%d', yds_t)
    today = time.strftime('%Y-%m-%d')
    pg.goto(base + '#/log-entry', wait_until='load'); pg.wait_for_timeout(500)
    pg.locator('#dp-e-date .dp-box').click(); pg.wait_for_timeout(300)
    if yds[:7] != today[:7]:
        pg.evaluate("UI.dp.nav(-1)"); pg.wait_for_timeout(200)
    pg.locator(f'#dp-panel .dp-cell:text-is("{int(yds[8:10])}")').click(); pg.wait_for_timeout(400)
    prop_val = pg.locator('#dp-val-e-date').inner_text()
    toast = pg.locator('#toast').inner_text()
    check('log-entry 选昨天立即回填', prop_val == yds, prop_val)
    check('toast 反馈日期已设置', '日期已设为' in toast, toast[:30])
    check('面板选完后自动关闭', pg.locator('#dp-panel').is_hidden(), '')

    # ③ 排班日历 2026-12 正常渲染
    pg.goto(base + '#/settings', wait_until='load'); pg.wait_for_timeout(500)
    pg.evaluate("Views.settings.switchTab('schedule')"); pg.wait_for_timeout(300)
    pg.evaluate("Views.settings.schedMonth('2026-12')"); pg.wait_for_timeout(400)
    check('排班日历 2026-12 渲染 31 格',
          pg.locator('.sched-month').inner_text() == '2026 年 12 月'
          and pg.locator('.sched-cell:not(.empty)').count() == 31, '')
    b.close()
srv.terminate()
print(f"\n通过 {sum(results)} / {len(results)}")
