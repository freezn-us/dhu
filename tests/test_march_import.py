"""3月版东华日报（表头在第4-5行、含已解决/未解决列、无时段/故障类型/责任人列）导入验证，
以及「导出运维工作日志 Excel」与附件同版式的回归校验。
运行：python tests/test_march_import.py
"""
import sys, os, re, json, time, subprocess, tempfile, urllib.request, base64
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')

from playwright.sync_api import sync_playwright

ROOT = r'd:\pctools win10\dhu'
MARCH_XLSX = r'c:\Users\user\.trae-cn\attachments\a4c3ec6c-7f2d-421d-8d54-8868b5c063f7_12f4fad1-30e2-466f-8c86-e77c3c4e6162_3月运维工作日志.xlsx'
OUT_XLSX = os.path.join(ROOT, 'tests', 'output', 'export-march-format.xlsx')

import socket
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
DB_PATH = os.path.join(tempfile.gettempdir(), f'dhu_march_import_{port}.db')
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port); env['DHU_OPS_DB'] = DB_PATH
log = open(os.path.join(tempfile.gettempdir(), f'dhu_march_{port}.log'), 'ab', buffering=0)
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
def pass_(name, detail=''):
    results.append(('PASS', name, detail)); print('PASS -', name, detail)
def fail_(name, detail=''):
    results.append(('FAIL', name, detail)); print('FAIL -', name, detail)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context()
    ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(TOKEN))
    page = ctx.new_page()
    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    page.goto(URL + '#/data', wait_until='load')
    page.wait_for_timeout(800)
    page.evaluate('window.Store.clearAll()')
    page.wait_for_timeout(300)

    # 1. 导入 3 月版日报
    page.set_input_files('#file-import', MARCH_XLSX)
    page.wait_for_timeout(4000)
    top_msg = ''
    alerts = page.locator('#import-result .alert').all()
    if alerts:
        top_msg = alerts[0].inner_text()
    print('top alert:', repr(top_msg[:220]))

    if '东华每日运维日志' in top_msg:
        pass_('3月版识别为东华日报格式', top_msg[:80])
    else:
        fail_('3月版识别为东华日报格式', top_msg[:150])

    m = re.search(r'跨\s*(\d+)\s*个\s*sheet', top_msg)
    if m and int(m.group(1)) >= 27:
        pass_('覆盖 27+ 个 sheet', m.group(1))
    else:
        fail_('覆盖 27+ 个 sheet', top_msg[:150])

    m3 = re.search(r'可导入\s*(\d+)\s*(?:单|条|行)', top_msg)
    n_ok = int(m3.group(1)) if m3 else 0
    if n_ok >= 120:
        pass_('可导入单数 ≥ 120', str(n_ok))
    else:
        fail_('可导入单数 ≥ 120', f'{n_ok} | {top_msg[:150]}')

    confirm_btn = page.locator('#import-result button').filter(has_text=re.compile(r'确认导入|导入'))
    if confirm_btn.count():
        confirm_btn.first.click()
        page.wait_for_timeout(1200)

    total = page.evaluate('window.Store.getState().tickets.length')
    if total >= 120:
        pass_('导入后日志数 ≥ 120', str(total))
    else:
        fail_('导入后日志数 ≥ 120', str(total))

    # 2. 3月格式特性校验
    sample = page.evaluate('''
    (function(){
      var tks = window.Store.getState().tickets;
      var waiting = tks.filter(t=>t.status==='waiting');
      var unsolved = tks.filter(t=>t.solved===false);
      var first = tks.filter(t=>t.createdAt && t.createdAt.indexOf('2026-03-02')===0).slice(0,3)
        .map(t=>({no:t.no, room:t.room, desc:(t.desc||'').slice(0,20), status:t.status, solved:t.solved, fault:t.fault}));
      var multi = tks.filter(t=>/原教室清单/.test(t.remark||'')).length;
      var solved1118 = tks.filter(t=>t.room==='1118')[0];
      return {waiting: waiting.length, unsolved: unsolved.length, first, multi,
              r1118: solved1118 ? {status: solved1118.status, solved: solved1118.solved, action: solved1118.action} : null};
    })()
    ''')
    print('sample:', json.dumps(sample, ensure_ascii=False))
    if sample['unsolved'] >= 1 and sample['waiting'] >= 1:
        pass_('未解决行 → 待跟进/未解决', f"waiting={sample['waiting']} unsolved={sample['unsolved']}")
    else:
        fail_('未解决行 → 待跟进/未解决', json.dumps(sample, ensure_ascii=False)[:150])
    if sample['r1118'] and sample['r1118']['solved'] is False:
        pass_('1118「无法解决」行 solved=false', sample['r1118']['action'][:20])
    else:
        fail_('1118「无法解决」行 solved=false', str(sample['r1118']))
    if sample['multi'] >= 1:
        pass_('多教室并列行拆分并入备注', str(sample['multi']))
    else:
        fail_('多教室并列行拆分并入备注', '0')

    # 3. 导出 → 与附件同版式
    b64 = page.evaluate('''
    (function(){
      var wb = window.Store.buildDailyWorkbook(window.Store.getState().tickets);
      return window.XLSX.write(wb, {type: 'base64', bookType: 'xlsx'});
    })()
    ''')
    with open(OUT_XLSX, 'wb') as f:
        f.write(base64.b64decode(b64))

    import openpyxl
    wb = openpyxl.load_workbook(OUT_XLSX)
    names = wb.sheetnames
    day_like = [n for n in names if re.match(r'^\d+月\d+$', n)]
    # 只导出有日志的天（附件中无记录或全为巡检行的天不产生 sheet）
    if len(day_like) == len(names) and len(day_like) >= 20:
        pass_('导出工作表按天命名（9月2 样式）', f'{len(day_like)} 天')
    else:
        fail_('导出工作表按天命名', str(names[:8]))
    ws = wb[day_like[0]]
    hdr_ok = (ws['A1'].value == '东华大学多媒体教室每日运维工作日志'
              and [ws.cell(3, c).value for c in range(1, 9)] == ['时段', '序号', '教室编号', '工作内容', '故障类型', '处理结果', '责任人', '备注'])
    if hdr_ok:
        pass_('导出表头与模板一致（时段/序号/教室编号/工作内容/故障类型/处理结果/责任人/备注）', ws['A1'].value)
    else:
        fail_('导出表头与模板一致', f"A1={ws['A1'].value} C3={ws.cell(3, 3).value}")
    last = ws.max_row
    merged = {str(x) for x in ws.merged_cells.ranges}
    need = {'A1:H1', 'B2:D2', 'F2:H2', f'A{last}:H{last}'}
    if need.issubset(merged) and any(re.match(r'^A\d+:A\d+$', x) for x in merged):
        pass_('导出合并单元格与模板一致（时段同值合并）', f'{len(merged)} 处合并')
    else:
        fail_('导出合并单元格与模板一致', str(need - merged))
    # 数据行从第 4 行开始，B 列序号、A 列时段带上午/下午/晚上
    v_room, v_desc, v_seq, v_period = ws['C4'].value, ws['D4'].value, ws['B4'].value, str(ws['A4'].value or '')
    if v_desc and isinstance(v_seq, (int, float)) and any(k in v_period for k in ('上午', '下午', '晚上')):
        pass_('导出数据行版式正确（时段按上午/下午/晚上区分）', f'{v_period.splitlines()[0]} | {v_seq} | {v_room}')
    else:
        fail_('导出数据行版式正确', f'A4={v_period!r} B4={v_seq} C4={v_room} D4={v_desc}')

    page.wait_for_timeout(300)
    real_errors = [e for e in console_errors if 'favicon' not in e.lower()]
    if not real_errors:
        pass_('控制台无新 JS 异常', '')
    else:
        fail_('控制台无新 JS 异常', str(real_errors[:3]))

    browser.close()
    httpd.terminate()
    try:
        os.remove(DB_PATH)
    except Exception:
        pass

print('\n================ 验证结果 ================')
for status, name, detail in results:
    print(f'{status} - {name} | {detail}')
print(f"通过 {sum(1 for r in results if r[0] == 'PASS')} / {len(results)}")
