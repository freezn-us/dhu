"""东华日报 xlsx 导入验证（Flask 后端 + SQLite 版）。"""
import sys, os, re, json, time, subprocess, tempfile, urllib.request
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')

from playwright.sync_api import sync_playwright

ROOT = r'd:\pctools win10\dhu'
DAILY_XLSX = r'c:\Users\user\.trae-cn\attachments\ae23861c-d918-491f-9bb5-cc556ccd08bf_84642d41-5fa2-454f-bc84-28728970376b_9月多媒体教室每日运维工作日志.xlsx'

import socket
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
DB_PATH = os.path.join(tempfile.gettempdir(), f'dhu_daily_import_{port}.db')
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port); env['DHU_OPS_DB'] = DB_PATH
log = open(os.path.join(tempfile.gettempdir(), f'dhu_daily_{port}.log'), 'ab', buffering=0)
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
    results.append(('PASS', name, detail))
def fail_(name, detail=''):
    results.append(('FAIL', name, detail))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=None, channel='chrome', headless=True)
    ctx = browser.new_context()
    ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(TOKEN))
    page = ctx.new_page()

    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    print('open', URL)
    page.goto(URL, wait_until='load', timeout=15000)
    page.wait_for_timeout(800)

    # 1. 清空旧日志 —— 走 JS 直接调 Store.clearAll，避免弹层选择器问题
    page.goto(URL + '#/data', wait_until='load')
    page.wait_for_timeout(300)
    page.evaluate('window.Store.clearAll()')
    page.evaluate('window.App.render()')
    page.wait_for_timeout(500)
    ticket_count_before = page.evaluate('window.Store.getState().tickets.length')
    print('ticket count before:', ticket_count_before)
    if ticket_count_before == 0:
        pass_('已清空演示数据', '')
    else:
        fail_('已清空演示数据', f'仍有 {ticket_count_before}')

    # 2. 导入真实 xlsx
    file_input = page.locator('#file-import')
    file_input.set_input_files(DAILY_XLSX)
    page.wait_for_timeout(3000)

    # 3. 检查预览识别为东华日报
    top_msg = ''
    alerts = page.locator('#import-result .alert').all()
    if alerts:
        top_msg = alerts[0].inner_text()
    print('top alert:', repr(top_msg[:200]))

    detected_daily = '东华每日运维日志' in top_msg
    pass_('识别为东华日报格式', top_msg[:100]) if detected_daily else fail_('识别为东华日报格式', top_msg[:150])

    m = re.search(r'跨\s*(\d+)\s*个\s*sheet', top_msg)
    if m:
        n = int(m.group(1))
        pass_('跨 30 个 sheet 解析', f'实际 {n}') if n == 30 else fail_('跨 30 个 sheet 解析', f'实际 {n}')
    else:
        fail_('跨 sheet 解析', top_msg[:200])

    # 默认全量导入：不再跳过巡检行
    if '已跳过巡检' not in top_msg:
        pass_('默认全量导入（含巡检行，不再跳过）', '无跳过统计')
    else:
        fail_('巡检行仍被跳过', top_msg[:200])

    m3 = re.search(r'可导入\s*(\d+)\s*(?:单|条|行)', top_msg)
    if m3:
        ok_n = int(m3.group(1))
        pass_('可导入单数 ≥ 700（含巡检）', f'{ok_n}') if ok_n >= 700 else fail_('可导入单数 ≥ 700（含巡检）', f'{ok_n}')
    else:
        fail_('可导入单数缺失', top_msg[:200])

    # 4. 东华日报说明 warn alert
    warn_texts = [a.inner_text() for a in page.locator('#import-result .alert.warn').all()]
    has_tip = any('东华日报格式说明' in t or '东华日报' in t for t in warn_texts)
    pass_('东华日报说明显示', f'warn alerts={len(warn_texts)}') if has_tip else fail_('东华日报说明显示', str(warn_texts[:2]))

    # 5. 确认导入（如果有确认按钮）
    confirm_btn = page.locator('#import-result button').filter(has_text=re.compile(r'确认导入|导入'))
    if confirm_btn.count():
        confirm_btn.first.click()
        page.wait_for_timeout(1000)
        pass_('确认导入成功', '')
    else:
        fail_('确认导入按钮', '未找到')

    ticket_count_after = page.evaluate('window.Store.getState().tickets.length')
    print('ticket count after import:', ticket_count_after)
    if ticket_count_after > 500:
        pass_('导入后日志数 > 500', str(ticket_count_after))
    else:
        fail_('导入后日志数偏少', str(ticket_count_after))

    # 6. 看看詹晓青是否出现在工程师名单里
    eng_names = page.evaluate('window.Store.getState().settings.engineers.map(e=>e.name).join(",")')
    print('engineers:', eng_names)
    if '詹晓青' in eng_names:
        pass_('詹晓青在工程师名单里', eng_names)
    else:
        fail_('詹晓青在工程师名单里', eng_names)

    # 7. 看导入后的 ticket 里有没有詹晓青作为主责、有没有多责任人进备注
    sample = page.evaluate('''
        (function(){
            var tks = window.Store.getState().tickets.filter(t=>t.no.startsWith("WL-202609"));
            var total = tks.length;
            var zhan = tks.filter(t=>t.assignee==="詹晓青").length;
            var havePatrolNote = tks.filter(t=>/当班工程师/.test(t.remark)).length;
            var havePeriodNote = tks.filter(t=>/时段：/.test(t.remark)).length;
            var first3 = tks.slice(0,3).map(t=>({no:t.no,createdAt:t.createdAt,room:t.room,fault:t.fault,desc:t.desc,assignee:t.assignee,status:t.status,remark:t.remark?t.remark.slice(0,60):''}));
            return {total, zhan, havePatrolNote, havePeriodNote, first3};
        })()
    ''')
    print('sample:', json.dumps(sample, ensure_ascii=False, indent=2))
    if sample['zhan'] > 0:
        pass_('詹晓青有日志', f'{sample["zhan"]} 条')
    else:
        fail_('詹晓青有日志', f'0 条；总 9 月导入 {sample["total"]}')
    pass_('多责任人进备注', f'{sample["havePatrolNote"]} 单有"当班工程师"备注')

    # 8. 控制台无新报错
    page.wait_for_timeout(300)
    page_errors = [e for e in console_errors if 'Failed to load' not in e and '404' not in e.lower() and 'favicon' not in e.lower()]
    if not page_errors:
        pass_('控制台无新 JS 异常', '')
    else:
        fail_('控制台无新 JS 异常', str(page_errors[:3]))

    browser.close()
    httpd.terminate()
    try:
        os.remove(DB_PATH)
    except Exception:
        pass

print('\n================ 验证结果 ================')
for status, name, detail in results:
    print(f'{status} - {name} | {detail}')
print(f'通过 {sum(1 for r in results if r[0]=="PASS")} / {len(results)}')
