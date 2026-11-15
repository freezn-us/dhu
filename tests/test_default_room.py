"""缺少教室编号时默认 0000 导入的验证（东华日报版式）。"""
import sys, os, re, json, time, subprocess, tempfile, urllib.request, socket

# 依赖由项目 .build-venv 提供；仅当旧机器临时 pylibs 真实存在时才加入搜索路径
_PYLIBS = r'C:\Users\user\AppData\Local\Temp\pylibs'
if os.path.isdir(_PYLIBS):
    sys.path.insert(0, _PYLIBS)
from playwright.sync_api import sync_playwright
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根，换机/换目录零修改
TMP = tempfile.gettempdir()
XLSX = os.path.join(TMP, 'dhu_default_room.xlsx')

# ---------- 构造一个缺教室编号的东华日报表 ----------
wb = openpyxl.Workbook()
ws = wb.active
ws.title = '9月1'
rows = [
    ['东华大学多媒体教室每日运维工作日志'],
    ['日期', '第1教学周   2026年9月1日  星期二', '', '', '当班人员', '张三', '', ''],
    ['时段', '序号', '教室编号', '工作内容', '故障类型', '处理结果', '责任人', '备注'],
    ['上午\n7:30-11:30', 1, None, '投影仪无信号', '投影仪问题', '更换 HDMI 线', '张三', ''],
    ['上午\n7:30-11:30', 2, '1118', '话筒无声', '音频/麦克风', '更换话筒电池', '李四', ''],
    ['故障类型说明：中控/开机故障 | 投影仪问题 | 音频/麦克风 | 网络'],
]
for r in rows:
    ws.append(r)
wb.save(XLSX)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
DB = os.path.join(TMP, f'dhu_default_room_{port}.db')
if os.path.exists(DB):
    os.remove(DB)
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port); env['DHU_OPS_DB'] = DB
log = open(os.path.join(TMP, f'dhu_default_room_{port}.log'), 'ab', buffering=0)
httpd = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], cwd=ROOT, env=env,
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
TOKEN = json.load(urllib.request.urlopen(req))['token']
URL = f'http://127.0.0.1:{port}/index.html'

results = []
def ok(name, detail=''):
    results.append(('PASS', name, detail))
def bad(name, detail=''):
    results.append(('FAIL', name, detail))

# 模板下载应等于附件原件（样式格式原样保留）
import hashlib
tpl_url = f'http://127.0.0.1:{port}/assets/donghua-daily-log-template.xlsx'
served = urllib.request.urlopen(tpl_url).read()
local_tpl = os.path.join(ROOT, 'assets', 'donghua-daily-log-template.xlsx')
origin = open(local_tpl, 'rb').read()
if hashlib.md5(served).hexdigest() == hashlib.md5(origin).hexdigest() and len(served) > 8000:
    ok('Excel 模板可下载且为附件原件', f'{len(served)} 字节')
else:
    bad('Excel 模板下载与附件不一致', f'{len(served)} vs {len(origin)}')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context()
    ctx.add_init_script(
        "try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}"
        % json.dumps(TOKEN))
    page = ctx.new_page()
    page.goto(URL, wait_until='load', timeout=15000)
    page.wait_for_timeout(600)

    page.goto(URL + '#/data', wait_until='load')
    page.wait_for_timeout(300)
    page.evaluate('window.Store.clearAll()')
    page.evaluate('window.App.render()')
    page.wait_for_timeout(400)
    ok('已清空演示数据', str(page.evaluate('window.Store.getState().tickets.length')))

    page.locator('#file-import').set_input_files(XLSX)
    page.wait_for_timeout(2500)

    alerts = [a.inner_text() for a in page.locator('#import-result .alert').all()]
    top = alerts[0] if alerts else ''
    print('alert:', top[:300])

    m = re.search(r'可导入\s*(\d+)', top)
    n = int(m.group(1)) if m else -1
    ok('缺教室编号的行也计入可导入 = 2', str(n)) if n == 2 else bad('可导入条数', f'预期 2，实际 {n}；{top[:160]}')

    # 不应再出现「缺少教室编号」的拒收错误（提示语里含该词是正常的）
    err_texts = [a.inner_text() for a in page.locator('#import-result .alert.err').all()]
    if not any('缺少教室编号' in t for t in err_texts):
        ok('不再拒收「缺少教室编号」', f'错误提示 {len(err_texts)} 条')
    else:
        bad('仍拒收缺少教室编号', str(err_texts)[:200])

    if not any('默认按 0000' in t for t in alerts):
        ok('不再补默认 0000（教室号保持空）', '')
    else:
        bad('仍补默认 0000', str(alerts[:3]))

    btn = page.locator('#import-result button').filter(has_text=re.compile(r'确认导入|导入'))
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(800)
        ok('确认导入成功', '')
    else:
        bad('确认导入按钮', '未找到')

    tks = page.evaluate('window.Store.getState().tickets.map(function(t){return {room:t.room,desc:t.desc,no:t.no}})')
    print('tickets:', json.dumps(tks, ensure_ascii=False))
    if len(tks) == 2:
        ok('导入 2 条日志', f'{len(tks)} 条')
    else:
        bad('导入条数', f'{len(tks)} 条')
    if any((t['room'] or '') == '' and '投影仪' in (t['desc'] or '') for t in tks):
        ok('缺教室编号的记录正常导入且教室为空', '(空)')
    else:
        bad('缺教室编号未正常导入', str(tks))
    if any(t['room'] == '1118' for t in tks):
        ok('原有教室编号保持 1118', '1118')
    else:
        bad('正常教室编号被改写', str(tks))

    # 附件模板本身也要能全量导入（3 行，含 1 行巡检）
    page.locator('#file-import').set_input_files(local_tpl)
    page.wait_for_timeout(2500)
    a2 = [a.inner_text() for a in page.locator('#import-result .alert').all()]
    top2 = a2[0] if a2 else ''
    print('tpl alert:', top2[:200])
    m2 = re.search(r'可导入\s*(\d+)', top2)
    n2 = int(m2.group(1)) if m2 else -1
    ok('附件模板全量可导入 = 3 行', str(n2)) if n2 == 3 else bad('附件模板可导入条数', f'预期 3，实际 {n2}；{top2[:120]}')
    btn2 = page.locator('#import-result button').filter(has_text=re.compile(r'确认导入|导入'))
    if btn2.count():
        btn2.first.click()
        page.wait_for_timeout(800)
    tks2 = page.evaluate('window.Store.getState().tickets.map(function(t){return {room:t.room,logType:t.logType}})')
    if len(tks2) == 5:
        ok('模板 3 行全部入库（含巡检行）', '共 5 条')
    else:
        bad('模板导入行数', f'共 {len(tks2)} 条')
    if any(t['logType'] == 'patrol' for t in tks2):
        ok('模板中的巡检行也正常入库', 'patrol')
    else:
        bad('巡检行未入库', str(tks2))

    browser.close()

httpd.terminate()
try:
    os.remove(DB)
except Exception:
    pass

print('\n================ 验证结果 ================')
for st, name, detail in results:
    print(f'{st} - {name} | {detail}')
print(f'通过 {sum(1 for r in results if r[0] == "PASS")} / {len(results)}')
