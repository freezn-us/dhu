"""验证导出 Excel 与「9月多媒体教室每日运维工作日志」附件版式一致，并验证按月区间导出。"""
import sys, os, re, json, time, subprocess, tempfile, urllib.request, socket
sys.path.insert(0, r'C:\Users\user\AppData\Local\Temp\pylibs')

from playwright.sync_api import sync_playwright
import openpyxl

ROOT = r'd:\pctools win10\dhu'
SRC = r'c:\Users\user\.trae-cn\attachments\fa036be3-0817-4df3-9eed-4cee74bb03ae_4e8618c2-9414-4baf-a4fa-89f12d6b685b_9月多媒体教室每日运维工作日志.xlsx'

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
DB = os.path.join(tempfile.gettempdir(), f'dhu_exp_{port}.db')
if os.path.exists(DB):
    os.remove(DB)
env = os.environ.copy(); env['DHU_OPS_PORT'] = str(port); env['DHU_OPS_DB'] = DB
log = open(os.path.join(tempfile.gettempdir(), f'dhu_exp_{port}.log'), 'ab', buffering=0)
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], cwd=ROOT, env=env,
                       stdout=log, stderr=subprocess.STDOUT)
for _ in range(60):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1)
        break
    except Exception:
        time.sleep(0.2)

r = urllib.request.Request(f'http://127.0.0.1:{port}/api/login',
                           data=json.dumps({'name': 'admin', 'pwd': 'admin123'}).encode(),
                           headers={'Content-Type': 'application/json'})
TOKEN = json.load(urllib.request.urlopen(r))['token']
URL = f'http://127.0.0.1:{port}/index.html'

results = []
def ok(n, d=''):
    results.append(('PASS', n, d)); print('PASS', n, d)
def bad(n, d=''):
    results.append(('FAIL', n, d)); print('FAIL', n, d)

out_path = os.path.join(tempfile.gettempdir(), f'dhu_range_{port}.xlsx')
tpl_path = os.path.join(tempfile.gettempdir(), f'dhu_tpl_{port}.xlsx')

with sync_playwright() as p:
    br = p.chromium.launch(channel='chrome', headless=True)
    ctx = br.new_context(accept_downloads=True)
    ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(TOKEN))
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(str(e)))

    page.goto(URL + '#/data', wait_until='load')
    page.wait_for_timeout(600)
    page.evaluate('window.Store.clearAll()')
    page.evaluate('window.App.render()')
    page.wait_for_timeout(400)

    page.locator('#file-import').set_input_files(SRC)
    page.wait_for_timeout(4000)
    btn = page.locator('#import-result button').filter(has_text=re.compile(r'确认导入'))
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(1500)
    n = page.evaluate('window.Store.getState().tickets.length')
    ok('导入 9 月附件', f'{n} 条') if n > 100 else bad('导入 9 月附件', f'{n} 条')

    # 记录系统中实际备注，供导出后比对
    REMARKS = page.evaluate("window.Store.getState().tickets.map(function(t){return t.remark||''})")
    page.screenshot(path=os.path.join(tempfile.gettempdir(), 'dhu_exp_page.png'))

    # 按月区间导出
    page.fill('#exp-from', '2026-09')
    page.fill('#exp-to', '2026-09')
    with page.expect_download(timeout=30000) as dl:
        page.click('text=按区间导出')
    d = dl.value
    d.save_as(out_path)
    ok('区间导出生成文件', d.suggested_filename) if os.path.exists(out_path) else bad('区间导出生成文件', '')

    # 模板下载
    with page.expect_download(timeout=30000) as dl2:
        page.click('text=下载 Excel 模板（东华日志版式）')
    dl2.value.save_as(tpl_path)
    ok('模板下载', dl2.value.suggested_filename) if os.path.exists(tpl_path) else bad('模板下载', '')

    if errs:
        bad('页面无脚本错误', '; '.join(errs[:3]))
    br.close()

srv.terminate()

# ---------- 用 openpyxl 比对版式 ----------
def check_book(path, label, min_sheets):
    wb = openpyxl.load_workbook(path)
    names = wb.sheetnames
    day_like = [x for x in names if re.match(r'^\d+月\d+$', x)]
    ok(f'{label}：sheet 命名 M月D（同模板）', f'{len(day_like)}/{len(names)}')
    if not day_like:
        return wb
    ws = wb[day_like[0]]
    a1 = ws['A1'].value
    ok(f'{label}：A1 大标题', repr(a1)) if a1 == '东华大学多媒体教室每日运维工作日志' else bad(f'{label}：A1 大标题', repr(a1))
    b2 = ws['B2'].value or ''
    ok(f'{label}：B2 教学周+日期+星期', repr(b2)[:44]) if ('教学周' in b2 and '星期' in b2) else bad(f'{label}：B2 行内容', repr(b2))
    hdr = [ws.cell(3, c).value for c in range(1, 9)]
    expect = ['时段', '序号', '教室编号', '工作内容', '故障类型', '处理结果', '责任人', '备注']
    ok(f'{label}：第3行表头', str(hdr)) if hdr == expect else bad(f'{label}：第3行表头', str(hdr))
    ok(f'{label}：A2=日期/E2=当班人员') if (ws['A2'].value == '日期' and ws['E2'].value == '当班人员') else bad(f'{label}：A2/E2', f'{ws["A2"].value}/{ws["E2"].value}')
    last = ws.max_row
    footer = ws.cell(last, 1).value or ''
    ok(f'{label}：末行故障类型说明', repr(footer)[:36]) if str(footer).startswith('故障类型说明') else bad(f'{label}：末行说明', repr(footer))
    merges = set(str(m) for m in ws.merged_cells.ranges)
    need = {'A1:H1', 'B2:D2', 'F2:H2', f'A{last}:H{last}'}
    ok(f'{label}：标题/日期/表尾合并与模板一致', str(sorted(need))) if need <= merges else bad(f'{label}：基础合并区域', str(need - merges))
    # 时段列：块首有值、块内其余为空；同值连续块应合并
    blocks, cur = [], None
    for rr in range(4, last):
        av = str(ws.cell(rr, 1).value or '')
        if av:
            cur = {'start': rr, 'end': rr, 'val': av}
            blocks.append(cur)
        elif cur:
            cur['end'] = rr
    merge_bad = [b for b in blocks if b['end'] > b['start'] and f"A{b['start']}:A{b['end']}" not in merges]
    ok(f'{label}：时段相同的记录已合并单元格', f'{len(blocks)} 个时段块') if blocks and not merge_bad else bad(f'{label}：时段未合并', str(merge_bad[:3]))
    # 0000（导入缺失）教室编号导出时置空
    zeros = [rr for rr in range(4, last) if str(ws.cell(rr, 3).value or '').strip() in ('0000', '0')]
    ok(f'{label}：教室编号 0000 已置空', f'{len(zeros)} 处') if not zeros else bad(f'{label}：仍有 0000', str(zeros[:5]))
    widths = [round(ws.column_dimensions[c].width or 0, 2) for c in 'ABCDEFGH']
    expect_w = [16, 8.88, 14.5, 51.25, 18.62, 37.62, 30.12, 14]
    near = all(abs(a - b) <= 1.5 for a, b in zip(widths, expect_w))
    ok(f'{label}：列宽与模板一致（±1.5）', str(widths)) if near else bad(f'{label}：列宽', str(widths))
    c = ws.cell(4, 4)
    ok(f'{label}：正文宋体16带边框', f'{c.font.name}/{c.font.sz}/{c.border.left.style}') if (c.font.name == '宋体' and c.font.sz == 16 and c.border.left.style == 'thin') else bad(f'{label}：正文样式', f'{c.font.name}/{c.font.sz}/{c.border.left.style}')
    h = ws.cell(3, 1)
    ok(f'{label}：表头黑体16加粗', f'{h.font.name}/{h.font.bold}') if (h.font.name == '黑体' and h.font.bold) else bad(f'{label}：表头样式', f'{h.font.name}/{h.font.bold}')
    a4 = str(ws['A4'].value or '')
    ok(f'{label}：A4 含 时段名+时段范围', repr(a4)[:40]) if (('\n' in a4) and any(k in a4 for k in ('上午', '下午', '晚上'))) else bad(f'{label}：A4 时段', repr(a4))
    # 底色与模板一致：日期行/时段列浅蓝 D6E4F0、表头蓝 4E79A7、固定巡检行浅黄 FFF2CC
    def fill_rgb(cell):
        f = cell.fill
        return (f.fgColor.rgb or '') if f.patternType == 'solid' else ''
    ok(f'{label}：日期行底色浅蓝 D6E4F0', fill_rgb(ws['A2'])) if fill_rgb(ws['A2']) == 'FFD6E4F0' else bad(f'{label}：日期行底色', fill_rgb(ws['A2']))
    ok(f'{label}：表头底色蓝 4E79A7', fill_rgb(ws['A3'])) if fill_rgb(ws['A3']) == 'FF4E79A7' else bad(f'{label}：表头底色', fill_rgb(ws['A3']))
    ok(f'{label}：时段列底色浅蓝 D6E4F0', fill_rgb(ws['A4'])) if fill_rgb(ws['A4']) == 'FFD6E4F0' else bad(f'{label}：时段列底色', fill_rgb(ws['A4']))
    patrol_rows = [rr for rr in range(4, last) if str(ws.cell(rr, 5).value or '') == '服务类']
    if patrol_rows:
        pr = patrol_rows[0]
        cols = [fill_rgb(ws.cell(pr, cc)) for cc in (2, 3, 4, 5, 6, 8)]
        ok(f'{label}：固定巡检行浅黄底色 FFF2CC', f'第 {pr} 行') if all(x == 'FFFFF2CC' for x in cols) else bad(f'{label}：巡检行底色', str(cols))
    else:
        ok(f'{label}：固定巡检行浅黄底色 FFF2CC', '本表无巡检行，跳过')
    ok(f'{label}：表尾含浅黄色巡检项说明（两行原文）', repr(footer)[-40:]) if '浅黄色底色列为固定巡检项' in str(footer) else bad(f'{label}：表尾备注说明缺失', repr(footer)[-60:])
    # 序号在各时段内从 1 重新开始
    restarts, groups, cur, n = True, [], None, 0
    for rr in range(4, last):
        av = str(ws.cell(rr, 1).value or '')
        sv = ws.cell(rr, 2).value
        if av != cur:
            if av:
                if isinstance(sv, (int, float)) and int(sv) != 1:
                    restarts = False
                cur = av
                n = 0
                groups.append(av.split('\n')[0])
        if isinstance(sv, (int, float)):
            n += 1
            if int(sv) != n:
                restarts = False
    ok(f'{label}：序号按时段从1重新计数', str(groups[:4])) if restarts else bad(f'{label}：序号分段', f'groups={groups[:4]}')
    ok(f'{label}：天数 ≥ {min_sheets}', f'{len(day_like)} 天') if len(day_like) >= min_sheets else bad(f'{label}：天数偏少', str(len(day_like)))
    return wb

wb_out = check_book(out_path, '区间导出', 20)
check_book(tpl_path, '模板', 1)

# 备注列必须是实际备注（与系统中的 remark 一一对应，无「时段：」等推导文字）
remark_state = sorted(x for x in REMARKS if x)
book_remarks = []
for name in wb_out.sheetnames:
    ws = wb_out[name]
    for rr in range(4, ws.max_row):
        v = str(ws.cell(rr, 8).value or '').strip()
        if v:
            book_remarks.append(v)
book_remarks.sort()
if book_remarks == remark_state:
    ok('备注列=实际备注（逐条一致）', f'{len(book_remarks)} 条')
else:
    bad('备注列=实际备注', f'导出 {book_remarks[:4]} vs 系统 {remark_state[:4]}')
if not any(x.startswith('时段：') for x in book_remarks):
    ok('备注无「时段：」推导文字')
else:
    bad('备注无「时段：」推导文字', str(book_remarks[:3]))

fails = [x for x in results if x[0] == 'FAIL']
print('\n=== %d/%d 通过 ===' % (len(results) - len(fails), len(results)))
for f in fails:
    print('FAILED:', f[1], '|', f[2])
sys.exit(1 if fails else 0)
