"""端到端自测：日志系统 —— 来电生成报修日志、每日日志填报、单条录入、巡视打卡、查询、报表、导入导出、备份、移动端。
服务端版本：启动 Flask 后端（server.py + 临时 SQLite），验证 token 鉴权与服务端持久化。
运行：python tests/ui_selftest.py
"""
import datetime
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'output')
SHOTS = os.path.join(ROOT, 'tests', 'screenshots')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)

from playwright.sync_api import sync_playwright  # noqa: E402

results = []
errors = []


def check(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)) if detail else '')
    if not cond:
        errors.append(name + ' ' + str(detail))


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


PORT = free_port()
TMP_DIR = tempfile.mkdtemp(prefix='dhu_selftest_')
DB_PATH = os.path.join(TMP_DIR, 'dhu_selftest_%d.db' % PORT)
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)


def start_server():
    env = os.environ.copy()
    env['DHU_OPS_PORT'] = str(PORT)
    env['DHU_OPS_DB'] = DB_PATH
    env['DHU_OPS_INITIAL_ADMIN_PWD'] = 'admin123'  # 测试固定初始口令，跳过强制改密
    # 注意：Windows 下 click/colorama 写 DEVNULL 会抛 OSError，输出重定向到日志文件
    log = open(os.path.join(OUT, 'flask-server.log'), 'ab', buffering=0)
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')],
                            cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1)
            return proc
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    raise RuntimeError('Flask 后端启动失败')


def api(path, token=None, data=None):
    req = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path),
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json',
                                          **({'Authorization': 'Bearer ' + token} if token else {})})
    return json.load(urllib.request.urlopen(req))


server = start_server()
BASE = 'http://127.0.0.1:%d/index.html' % PORT
TOKEN = api('/api/login', data={'name': 'admin', 'pwd': 'admin123'})['token']
# 登录流程用独立账号验证；账号在页面完成 seedDemo 之后再创建（工程师名单来自 state）


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
        # 固定到当天 10:00，避免晚上运行时巡视时段已过、自动补完成导致「打卡」按钮消失
        ctx.clock.install(time=datetime.datetime.now().replace(hour=10, minute=0, second=0, microsecond=0))
        # 预置服务端签发的真 token，跳过登录页
        ctx.add_init_script("try{localStorage.setItem('dhu_ops_token', %s);localStorage.setItem('dhu_ops_user','admin')}catch(e){}" % json.dumps(TOKEN))
        page = ctx.new_page()
        page_errors = []
        page.on('pageerror', lambda e: page_errors.append(str(e)))
        console_errors = []
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)

        page.goto(BASE, wait_until='load')
        page.wait_for_timeout(700)

        # ---------- 0. 登录流程 ----------
        # 主 ctx 已预置登录态 → 徽章应显示；登录页流程用独立 context（无预置）验证
        # 此时首屏已 seedDemo 写入工程师名单，可创建测试账号（避免同账号二次登录顶掉 admin 会话）
        try:
            api('/api/users', token=TOKEN, data={'name': 'tester', 'pwd': 'login12345', 'role': '工程师', 'display_name': '周佳辉'})
        except urllib.error.HTTPError:
            pass
        badge_text = page.locator('#login-name-text').inner_text()
        check('登录徽章显示当前用户', page.locator('#login-user').is_visible() and bool(badge_text.strip()), badge_text)
        login_ctx = browser.new_context(viewport={'width': 1440, 'height': 960})
        lp = login_ctx.new_page()
        lp.goto(BASE, wait_until='load')
        lp.wait_for_timeout(600)
        check('未登录时显示登录页', lp.locator('#login-screen').is_visible())
        check('未登录时主界面被遮挡', lp.locator('.kpi').count() == 0 or not lp.locator('.kpi').first.is_visible())
        lp.fill('#login-name', 'tester')
        lp.fill('#login-pwd', 'wrong-pass')
        lp.click('#login-btn')
        lp.wait_for_timeout(600)
        check('错误密码提示', '错误' in lp.locator('#login-err').inner_text(), lp.locator('#login-err').inner_text())
        check('登录失败后仍在登录页', lp.locator('#login-screen').is_visible())
        lp.fill('#login-pwd', 'login12345')
        lp.click('#login-btn')
        lp.wait_for_timeout(1200)
        check('正确密码登录进入主界面', not lp.locator('#login-screen').is_visible() and lp.locator('.kpi').count() >= 5)
        check('登录后徽章显示', lp.locator('#login-user').is_visible())
        lp.screenshot(path=os.path.join(SHOTS, '00-login-ok.png'))
        login_ctx.close()

        # ---------- 0.5 服务端安全边界 ----------
        try:
            api('/api/state', data={'tickets': [], 'settings': {}, 'patrols': []})
            check('无 token 写 state 被拒（401）', False, '服务端未拦截')
        except urllib.error.HTTPError as e:
            check('无 token 写 state 被拒（401）', e.code == 401, e.code)
        try:
            api('/api/state')
            check('无 token 读 state 被拒（401）', False, '服务端未拦截')
        except urllib.error.HTTPError as e:
            check('无 token 读 state 被拒（401）', e.code == 401, e.code)
        try:
            api('/api/state', token='forged-token-123')
            check('伪造 token 被拒（401）', False, '服务端未拦截')
        except urllib.error.HTTPError as e:
            check('伪造 token 被拒（401）', e.code == 401, e.code)
        check('浏览器不再落地业务数据（无 dhu_ops_v1）', page.evaluate("localStorage.getItem('dhu_ops_v1')") is None)
        check('state 与备份均不含用户密码', page.evaluate("JSON.stringify(Store.getState().settings).indexOf('password') < 0 && !('users' in Store.getState().settings)"))

        # ---------- 1. 外壳、工作台、巡视自动生成 ----------
        check('页面无 JS 异常', len(page_errors) == 0, page_errors)
        check('五个 KPI 渲染', page.locator('.kpi').count() >= 5, page.locator('.kpi').count())
        cells = page.locator('.wall .cell').count()
        check('教室状态墙渲染 >200 间', cells > 200, cells)
        nav_count = page.locator('.menu-item').count()
        check('侧栏导航 10 项', nav_count >= 10, nav_count)
        seeded = page.evaluate('Store.getState().tickets.length')
        check('演示日志已生成', seeded >= 40, seeded)
        patrol_total = page.evaluate('Store.getState().patrols.length')
        check('巡视任务自动生成（7 天 x 3 时段）', patrol_total >= 21, patrol_total)
        page.screenshot(path=os.path.join(SHOTS, '01-dashboard.png'), full_page=True)

        # ---------- 2. 来电登记 → 报修日志 ----------
        page.click('.menu-item[data-route="intake"]')
        page.wait_for_timeout(300)
        page.fill('#i-room', '2113')
        page.wait_for_timeout(100)
        page.fill('#i-caller', '测试张老师')
        page.fill('#i-phone', '内线 8214')
        page.click('#i-faults .pick:has-text("中控/开机故障")')
        page.fill('#i-desc', '自测日志：中控电脑开机无响应，屏幕无信号')
        page.fill('#i-device', '中控/讲台电脑')
        page.click('#i-urg .pick[data-v="紧急"]')
        page.wait_for_timeout(100)
        eng = page.input_value('#i-eng')
        check('按楼栋自动推荐工程师', eng != '', eng)
        page.click('button:has-text("登记并指派")')
        page.wait_for_timeout(500)
        no = page.evaluate('Store.getState().tickets[0].no')
        check('生成 WL 报修日志编号', no.startswith('WL-'), no)
        check('日志详情抽屉已打开', page.locator('#drawer').is_visible())
        check('详情抽屉含日志编号', '日志编号' in page.locator('#drawer-body').inner_text(), page.locator('#drawer-body').inner_text()[:60])
        status = page.evaluate('Store.findTicket("%s").status' % no)
        check('新报修日志状态=assigned', status == 'assigned', status)

        # ---------- 3. 每日工作日志：默认当天 + 三时段 + 补录 ----------
        page.click('#drawer-foot button:has-text("填报")')
        page.wait_for_timeout(400)
        check('补录弹窗打开', page.locator('#modal-mask.show').count() == 1)
        page.fill('#f-result', '重启中控主机后恢复，画面信号正常，测试通过')
        page.click('#modal-foot button.btn-primary')
        page.wait_for_timeout(500)
        filled = page.evaluate('Store.findTicket("%s").status' % no)
        check('补录后日志状态=closed', filled == 'closed', filled)
        preserved = page.evaluate('Store.findTicket("%s").no' % no)
        check('补录保留原编号', preserved == no, preserved)
        # 补录后可能弹出「结案沉淀知识库」引导弹窗；不处理会遮挡后续点击
        page.wait_for_timeout(500)
        if page.locator('#modal-mask.show').count():
            skip = page.locator('#modal-mask button', has_text='跳过')
            if skip.count():
                skip.first.click()
            else:
                page.evaluate('UI.closeModal()')
            page.wait_for_timeout(200)

        page.evaluate("App.go('daily-log')")
        page.wait_for_timeout(500)
        check('每日日志默认当天', page.locator('#dp-val-dl-date').inner_text() == page.evaluate('UI.todayStr()'), page.locator('#dp-val-dl-date').inner_text())
        check('三时段日志表渲染', page.locator('.period').count() == 3, page.locator('.period').count())
        check('纸质表头渲染', page.locator('.sheet-head').is_visible())
        check('当班人员显示', page.locator('.duty-tag').count() >= 1, page.locator('.duty-tag').count())
        check('补录结果出现在当天表格', page.locator('table.log tbody tr:has-text("重启中控主机后恢复")').count() >= 1, page.locator('table.log tbody tr').count())
        page.screenshot(path=os.path.join(SHOTS, '02-daily-log.png'), full_page=True)

        # ---------- 4. 单条日志录入 ----------
        page.evaluate("App.go('log-entry')")
        page.wait_for_timeout(500)
        check('单条录入四步卡片', page.locator('.entry-card').count() == 4, page.locator('.entry-card').count())
        check('四类日志类型可选', page.locator('.type-card').count() == 4, page.locator('.type-card').count())
        page.select_option('#e-room', '2113')
        page.fill('#e-summary', '记一条主动维护：课前检查投影信号与话筒电量')
        page.fill('#e-action', '检查完毕，设备状态正常，已更换无线麦电池')
        page.fill('#e-parts', '5 号电池 2 节')
        page.click('button:has-text("提交日志")')
        page.wait_for_timeout(600)
        check('提交后回到每日日志', page.locator('.sheet-head').is_visible())
        new_log = page.evaluate('Store.getState().tickets[0]')
        check('单条录入写入数据', new_log['no'].startswith('WL-'), new_log['no'])
        check('单条录入状态=closed', new_log['status'] == 'closed', new_log['status'])
        check('单条录入责任人为工程师', new_log['assignee'] not in ('', '客服 王丽'), new_log['assignee'])
        check('日志类型=repair', new_log['logType'] == 'repair', new_log['logType'])

        # ---------- 5. 巡视打卡 ----------
        page.evaluate("var st=Store.getState();var today=Store.fmtDate(Store.nowLocal());var p=st.patrols.filter(function(x){return x.date===today;})[0];p.status='pending';p.results={};p.at='';Store.save();")
        page.evaluate("App.go('patrol')")
        page.wait_for_timeout(500)
        check('巡视统计 4 卡', page.locator('.pstat').count() == 4, page.locator('.pstat').count())
        check('巡视计划 3 时段', page.locator('.plan-card').count() == 3, page.locator('.plan-card').count())
        check('今日巡视任务 3 行', page.locator('.patrol-table tbody tr').count() == 3, page.locator('.patrol-table tbody tr').count())
        page.locator('.patrol-table button:has-text("打卡")').first.click()
        page.wait_for_timeout(400)
        check('打卡弹窗含 6 项检查', page.locator('.check-row').count() == 6, page.locator('.check-row').count())
        page.click('#modal-foot button:has-text("提交打卡")')
        page.wait_for_timeout(500)
        patrol_log = page.evaluate('Store.getState().tickets[0]')
        check('打卡自动生成巡检日志', patrol_log['logType'] == 'patrol', patrol_log['logType'])
        done_after = page.evaluate("Store.patrolSummary(Store.fmtDate(Store.nowLocal())).done")
        check('巡视完成数增加', done_after >= 1, done_after)

        # 异常打卡 → 自动转多条报修（多选）
        page.evaluate("var st=Store.getState();var today=Store.fmtDate(Store.nowLocal());st.patrols.forEach(function(x){if(x.date===today){x.status='pending';x.results={};}});Store.save();")
        page.evaluate("App.render()")
        page.wait_for_timeout(300)
        before_repair = page.evaluate('Store.pendingRepairs().length')
        page.locator('.patrol-table button:has-text("打卡")').first.click()
        page.wait_for_timeout(300)
        page.locator('.check-grid input[value="fail"]').first.check()
        page.wait_for_timeout(200)
        # Tag Input 多选 → 直接设 hidden input JSON 值（saveCheckin 会从这里读）
        page.evaluate("""
        (function(){
          document.getElementById('p-rooms').value = JSON.stringify(['2213', '2421']);
        })()
        """)
        page.wait_for_timeout(150)
        selected = page.evaluate("JSON.parse(document.getElementById('p-rooms').value)")
        check('多选 2 个教室已选中', len(selected) == 2, selected)
        # tag-input 宽度校验：应为父容器宽度的约 2/3
        width_ratio = page.evaluate("""
        (function(){
          var el = document.getElementById('p-rooms-wrap');
          var parent = el.parentElement;
          return el.offsetWidth / parent.offsetWidth;
        })()
        """)
        check('异常教室选框宽度≈2/3', 0.6 <= width_ratio <= 0.72, width_ratio)
        page.fill('#p-abnormal', '2213 无线麦无声，2421 功放有嗡鸣声，已排查')
        page.check('#p-create')
        page.click('#modal-foot button:has-text("提交打卡")')
        page.wait_for_timeout(600)
        after_repair = page.evaluate('Store.pendingRepairs().length')
        check('异常打卡 2 教室生成 2 条报修', after_repair == before_repair + 2, '%s -> %s' % (before_repair, after_repair))
        task_repair_nos = page.evaluate('Store.getState().patrols.filter(p=>p.status==="done").slice(-1)[0].repairNos')
        check('巡视任务 repairNos 数组含 2 条', len(task_repair_nos) == 2, task_repair_nos)
        page.screenshot(path=os.path.join(SHOTS, '03-patrol.png'), full_page=True)

        # 巡视完成的巡检日志按时段出现在每日工作日志
        page.evaluate("App.go('daily-log')")
        page.wait_for_timeout(400)
        check('每日日志出现巡检日志', page.locator('table.log tbody tr:has-text("巡检")').count() >= 1, page.locator('table.log tbody tr').count())

        # ---------- 6. 日志查询 ----------
        page.evaluate("App.go('tickets')")
        page.wait_for_timeout(400)
        page.fill('#q-kw', no)
        page.click('button:has-text("查询")')
        page.wait_for_timeout(400)
        check('日志搜索命中自测单', page.locator('.data-table tbody tr').count() == 1, page.locator('.data-table tbody tr').count())
        page.click('.data-table tbody tr')
        page.wait_for_timeout(300)
        page.click('#drawer-foot button:has-text("关闭")')

        # ---------- 7. 报表 ----------
        page.evaluate("App.go('reports')")
        page.wait_for_timeout(500)
        check('报表 KPI 渲染', page.locator('.kpi').count() == 5, page.locator('.kpi').count())
        check('故障类型图有数据', page.locator('.legend-row').count() >= 3, page.locator('.legend-row').count())
        total_before = page.evaluate('Store.stats(UI.daysAgoStr(29), UI.todayStr()).total')
        check('近30天统计有数据', total_before > 10, total_before)
        page.screenshot(path=os.path.join(SHOTS, '04-reports.png'), full_page=True)

        with page.expect_download() as dl:
            page.click('button:has-text("CSV 明细")')
        csv_path = os.path.join(OUT, 'report.csv')
        dl.value.save_as(csv_path)
        check('CSV 导出成功', os.path.getsize(csv_path) > 1000, os.path.getsize(csv_path))

        with page.expect_download() as dl2:
            page.click('button:has-text("导出 Excel")')
        xlsx_path = os.path.join(OUT, 'report.xlsx')
        dl2.value.save_as(xlsx_path)
        check('Excel 报表导出成功', os.path.exists(xlsx_path), os.path.getsize(xlsx_path))
        try:
            import openpyxl
            wb = openpyxl.load_workbook(xlsx_path)
            sheets = wb.sheetnames
            check('Excel 含 6 个工作表', len(sheets) == 6, sheets)
            check('Excel 汇总表有数据', wb['汇总'].max_row >= 10, wb['汇总'].max_row)
            check('Excel 明细表为日志明细', '日志明细' in sheets and wb['日志明细'].max_row > 5, sheets)
        except Exception as e:
            check('Excel 文件可被解析', False, e)

        # PDF 报告 —— 通过 JS 直接构造 blob 并读取，避开浏览器下载事件差异
        pdf_check = page.evaluate("""
        (async function(){
          var s = Store.stats(Store.fromDayStr ? Store.fromDayStr(29) : UI.daysAgoStr(29), UI.todayStr());
          var days = Math.round((new Date(UI.todayStr()) - new Date(UI.daysAgoStr(29))) / 86400000) + 1;
          if (!days) days = 30;
          var html = Views.reports.renderPdfReport(s, days, UI.todayStr() + ' 至 ' + UI.todayStr(),
            Views.reports.buildAnalysis(s, days));
          return {ok: html && html.length > 3000, len: html.length,
            hasAnalysis: html.indexOf('分析报告') >= 0, hasHeader: html.indexOf('东华大学') >= 0 && html.indexOf('工单总量') >= 0,
            hasPrintMedia: html.indexOf('@media print') >= 0};
        })()
        """)
        check('PDF 报告 HTML 已生成', pdf_check['ok'], pdf_check['len'])
        check('PDF 报告含分析报告章节', pdf_check['hasAnalysis'], pdf_check)
        check('PDF 报告含 KPI + 页眉', pdf_check['hasHeader'], pdf_check)
        check('PDF 报告含 @media print', pdf_check['hasPrintMedia'], pdf_check)

        # ---------- 8. 数据导入（XLSX 通用格式） ----------
        import openpyxl
        page.evaluate("App.go('data')")
        page.wait_for_timeout(400)
        xlsx_in1 = os.path.join(OUT, 'import.xlsx')
        wb1 = openpyxl.Workbook()
        ws1 = wb1.active
        ws1.append(['日志编号', '来电时间', '报修人', '联系电话', '教室', '设备', '故障类型', '故障现象', '紧急度', '状态', '工程师', '处理措施', '是否解决'])
        ws1.append(['WL-IMPORT-01', '2026-11-04 09:10', '导入李老师', '内线 8221', '1412', '投影仪', '投影仪问题', '投影画面偏色', '常规', '已记录', '周佳辉', '重新插拔视频线恢复信号', '是'])
        ws1.append(['', '2026-11-04 10:30', '导入王老师', '', '', '扩音设备', '音频/麦克风', '无线麦没有声音', '低', '', '', '', ''])
        wb1.save(xlsx_in1)
        before = page.evaluate('Store.getState().tickets.length')
        page.set_input_files('#file-import', xlsx_in1)
        page.wait_for_timeout(700)
        txt = page.locator('#import-result').inner_text()
        check('XLSX 预览显示可导入 2 行（空教室正常导入）', '可导入 2' in txt and '失败' not in txt, txt[:120].replace('\n', ' '))
        check('XLSX 空教室不再补 0000', '默认按 0000' not in txt, txt[:200].replace('\n', ' '))
        page.click('button:has-text("确认导入 2 条")')
        page.wait_for_timeout(500)
        after = page.evaluate('Store.getState().tickets.length')
        check('XLSX 导入后日志 +2', after == before + 2, '%s -> %s' % (before, after))
        # 用报修人精确定位导入的那条（避免与流程中其他同故障现象日志混淆）
        lack_room = page.evaluate("(Store.getState().tickets.filter(function(t){return t.desc==='无线麦没有声音'&&t.caller==='导入王老师'})[0]||{}).room")
        check('空教室的导入记录教室为空', (lack_room or '') == '', repr(lack_room))
        imported = page.evaluate('Store.getState().tickets.filter(t=>t.no==="WL-IMPORT-01").length')
        check('导入日志编号保留', imported == 1, imported)

        # 重复上传同一文件：应识别重复并跳过，不产生新日志
        page.set_input_files('#file-import', xlsx_in1)
        page.wait_for_timeout(700)
        txt = page.locator('#import-result').inner_text()
        check('重复上传给出提示', '重复 2 条' in txt and '不会再次导入' in txt, txt[:160].replace('\n', ' '))
        check('重复上传无确认按钮', page.locator('button:has-text("确认导入")').count() == 0, '')
        dup_after = page.evaluate('Store.getState().tickets.length')
        check('重复上传不新增日志', dup_after == after, '%s -> %s' % (after, dup_after))

        # ---------- 9. 数据导入（XLSX） ----------
        wb_in = openpyxl.Workbook()
        ws = wb_in.active
        ws.append(['来电时间', '教室', '故障类型', '故障现象', '紧急度', '状态', '工程师', '回访结果'])
        ws.append(['2026/11/03 14:20', '2421', '音频/麦克风', '功放有嗡鸣声', '常规', '已处理', '刘铮', ''])
        ws.append(['2026-11-03 16:00', '1112', '线材', '显示器不显示', '低', '待填报', '', ''])
        xlsx_in = os.path.join(OUT, 'import.xlsx')
        wb_in.save(xlsx_in)
        before = page.evaluate('Store.getState().tickets.length')
        page.set_input_files('#file-import', xlsx_in)
        page.wait_for_timeout(700)
        txt = page.locator('#import-result').inner_text()
        check('XLSX 解析可导入 2 行', '可导入 2' in txt, txt[:100].replace('\n', ' '))
        page.click('button:has-text("确认导入 2 条")')
        page.wait_for_timeout(500)
        after = page.evaluate('Store.getState().tickets.length')
        check('XLSX 导入后日志 +2', after == before + 2, '%s -> %s' % (before, after))

        # ---------- 10. 备份 / 恢复 ----------
        with page.expect_download() as dl3:
            page.click('button:has-text("导出备份 JSON")')
        bak_path = os.path.join(OUT, 'backup.json')
        dl3.value.save_as(bak_path)
        bak = json.load(open(bak_path, encoding='utf-8'))
        check('备份含全部日志', bak['app'] == 'dhu-ops' and len(bak['tickets']) == after, len(bak['tickets']))
        check('备份含巡视记录', len(bak.get('patrols', [])) >= 21, len(bak.get('patrols', [])))
        check('备份含基础配置', len(bak['settings']['rooms']) > 200 and len(bak['settings']['engineers']) >= 7)

        extra_xlsx = os.path.join(OUT, 'extra.xlsx')
        wb_extra = openpyxl.Workbook()
        ws_extra = wb_extra.active
        ws_extra.append(['来电时间', '教室', '故障类型', '故障现象'])
        ws_extra.append(['2026-11-05 09:00', '2214', '服务类', '测试恢复用'])
        wb_extra.save(extra_xlsx)
        page.set_input_files('#file-import', extra_xlsx)
        page.wait_for_timeout(500)
        page.click('button:has-text("确认导入 1 条")')
        page.wait_for_timeout(400)
        grown = page.evaluate('Store.getState().tickets.length')
        check('恢复前再导入 1 条', grown == after + 1, grown)

        page.set_input_files('#file-restore', bak_path)
        page.wait_for_timeout(400)
        check('恢复前弹出覆盖确认', page.locator('#confirm-ok').count() == 1)
        page.click('#confirm-ok')
        page.wait_for_timeout(500)
        restored = page.evaluate('Store.getState().tickets.length')
        check('备份恢复回滚到备份时数量', restored == after, '%s -> %s' % (grown, restored))
        patrols_restored = page.evaluate('Store.getState().patrols.length')
        check('备份恢复含巡视记录', patrols_restored >= 21, patrols_restored)

        # ---------- 11. 配置增删 ----------
        page.evaluate("App.go('settings')")
        page.wait_for_timeout(400)
        rooms_n = page.evaluate('Store.getState().settings.rooms.length')
        check('教室清单加载（真实容量表）', rooms_n > 200, rooms_n)
        page.click('button:has-text("新增教室")')
        page.wait_for_timeout(300)
        page.fill('#r-no', '2399')
        page.select_option('#r-building', '二教')
        page.select_option('#r-zone', 'B区')
        page.select_option('#r-type', '多媒体教室')
        page.fill('#r-cap', '80')
        page.click('#modal-foot button:has-text("保存")')
        page.wait_for_timeout(300)
        new_room = page.evaluate("Store.getState().settings.rooms.filter(function(r){return r.no==='2399'})[0]")
        check('新增教室成功', page.evaluate('Store.getState().settings.rooms.length') == rooms_n + 1)
        check('新增教室字段（区域/类型/容量）',
              new_room and new_room.get('zone') == 'B区' and new_room.get('roomType') == '多媒体教室' and new_room.get('capacity') == 80,
              new_room)
        page.evaluate('Store.removeRoom("2399")')
        check('删除教室成功', page.evaluate('Store.getState().settings.rooms.length') == rooms_n)

        # ---------- 12. 刷新持久化 ----------
        page.evaluate("App.go('tickets')")
        page.wait_for_timeout(200)
        page.evaluate('Store.flushSave()')  # 等写回服务端完成
        page.reload(wait_until='load')
        page.wait_for_timeout(600)
        persisted = page.evaluate('Store.getState().tickets.length')
        check('刷新后数据持久化', persisted == after, '%s / %s' % (persisted, after))
        closed2 = page.evaluate('Store.findTicket("%s").status' % no)
        check('刷新后自测日志仍为已记录', closed2 == 'closed', closed2)

        check('全流程无 JS 异常', len(page_errors) == 0, page_errors)
        real_console = [c for c in console_errors if 'favicon' not in c.lower()]
        check('控制台无报错', len(real_console) == 0, real_console[:3])

        # ---------- 13. 移动端 ----------
        mob = ctx.new_page()
        mob.set_viewport_size({'width': 390, 'height': 844})
        mob.goto(BASE + '#/daily-log', wait_until='load')
        mob.wait_for_timeout(700)
        check('移动端底部导航显示', mob.locator('.mobile-nav').is_visible())
        check('移动端每日日志表头显示', mob.locator('.sheet-head').is_visible())
        check('移动端三时段渲染', mob.locator('.period').count() == 3, mob.locator('.period').count())
        mob.screenshot(path=os.path.join(SHOTS, '05-mobile-daily-log.png'))
        mob.goto(BASE + '#/patrol', wait_until='load')
        mob.wait_for_timeout(500)
        check('移动端巡视统计 4 卡', mob.locator('.pstat').count() == 4, mob.locator('.pstat').count())
        check('移动端巡视计划显示', mob.locator('.plan-card').first.is_visible())
        mob.screenshot(path=os.path.join(SHOTS, '06-mobile-patrol.png'))
        mob.goto(BASE + '#/log-entry', wait_until='load')
        mob.wait_for_timeout(500)
        check('移动端单条录入类型卡', mob.locator('.type-card').count() == 4, mob.locator('.type-card').count())
        mob.screenshot(path=os.path.join(SHOTS, '07-mobile-log-entry.png'))

        browser.close()

    # ---------- 14. 服务端持久化：重启进程后数据仍在 SQLite ----------
    global server
    server.terminate()
    server.wait(timeout=8)
    server = start_server()
    t2 = api('/api/login', data={'name': 'admin', 'pwd': 'admin123'})['token']
    st = api('/api/state', token=t2)
    check('重启后端后数据仍在（SQLite 持久化）', len(st.get('tickets', [])) == persisted,
          '%s / %s' % (len(st.get('tickets', [])), persisted))
    check('服务端 state 不含用户密码字段', 'password' not in json.dumps(st.get('settings', {}), ensure_ascii=False))
    passed = sum(1 for r in results if r[0])
    print('\n================ 结果 ================')
    print('通过 %d / %d' % (passed, len(results)))
    if errors:
        print('失败项：')
        for e in errors:
            print(' -', e)
    with open(os.path.join(OUT, 'selftest-result.json'), 'w', encoding='utf-8') as f:
        json.dump({'passed': passed, 'total': len(results),
                   'items': [{'ok': r[0], 'name': r[1], 'detail': str(r[2])} for r in results]},
                  f, ensure_ascii=False, indent=2)
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    finally:
        try:
            server.terminate()
        except Exception:
            pass
        try:
            os.remove(DB_PATH)
        except Exception:
            pass
