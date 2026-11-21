# -*- coding: utf-8 -*-
"""排课查询：解析器 + 导入/查询接口回归。

运行：python tests/test_schedule.py
样本缺失时解析器用例跳过，接口用例仍会用样例 PDF（若存在）。
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import schedule_parser  # noqa: E402

SAMPLE_DIR = r'D:\File\AI\class schudel'
P1 = os.path.join(SAMPLE_DIR, 'toroomdetail(1).pdf')
P2 = os.path.join(SAMPLE_DIR, 'toroomdetail02.pdf')
P3 = os.path.join(SAMPLE_DIR, 'toroomdetail.pdf')
results = []


def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)) if detail else '')


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def parser_checks():
    if not (os.path.exists(P1) and os.path.exists(P2)):
        print('SKIP parser checks: sample PDFs not found')
        return
    a = schedule_parser.parse_schedule_pdf(P1)
    check('11-01 date', a['date'] == '2026-11-01', a['date'])
    check('11-01 weekday', a['weekday'] == '周日', a['weekday'])
    check('11-01 13 slots', len(a['slots']) == 13, len(a['slots']))
    check('11-01 slot span', a['slots'][0]['start'] == '08:15' and a['slots'][-1]['end'] == '21:20',
          (a['slots'][0]['start'], a['slots'][-1]['end']))
    check('11-01 rooms', a['summary']['rooms'] == 160, a['summary'])
    check('11-01 borrow count', a['summary']['borrow_count'] == 132, a['summary'])
    check('11-01 total minutes', a['summary']['total_minutes'] == 5940, a['summary'])
    check('11-01 no class', a['summary']['class_count'] == 0, a['summary'])
    check('11-01 special rooms', a['summary']['special_rooms'] == 4, a['summary'])
    check('11-01 sha256', len(a['source_sha256']) == 64, a['source_sha256'][:12])
    b = schedule_parser.parse_schedule_pdf(P2)
    check('11-02 date', b['date'] == '2026-11-02', b['date'])
    check('11-02 class count', b['summary']['class_count'] == 675, b['summary'])
    check('11-02 borrow count', b['summary']['borrow_count'] == 20, b['summary'])
    check('11-02 class minutes', b['summary']['class_minutes'] == 30375, b['summary'])
    check('11-02 borrow minutes', b['summary']['borrow_minutes'] == 900, b['summary'])
    check('11-02 total minutes', b['summary']['total_minutes'] == 31275, b['summary'])
    check('11-02 regular/building', all(r['building'] in ('一教', '二教', '其他') for r in b['rooms']))
    # 考试类型：在样例 PDF 的空单元格上覆盖一个「考」字，确认解析器能识别
    try:
        import pymupdf
        target = next(r for r in b['rooms'] if not r['special'] and not r['slots'][0])
        doc = pymupdf.open(P2)
        page = doc[0]
        rect = page.search_for(target['name'])[0]
        col = page.search_for('8:15')[0]
        page.insert_text((col.x0 + 4, (rect.y0 + rect.y1) / 2 + 3), '考',
                         fontname='china-s', fontsize=9, color=(1, 0, 0))
        tmp = os.path.join(tempfile.gettempdir(), 'dhu_exam_%s.pdf' % uuid.uuid4().hex[:8])
        doc.save(tmp)
        doc.close()
        e = schedule_parser.parse_schedule_pdf(tmp)
        er = next(r for r in e['rooms'] if r['name'] == target['name'])
        check('exam count', e['summary']['exam_count'] == 1, e['summary'])
        check('exam slot', er['slots'][0] == 'exam', er['slots'][:3])
        check('exam minutes', e['summary']['exam_minutes'] == 45, e['summary'])
        os.remove(tmp)
    except Exception as ex:
        check('exam parsing', False, repr(ex))
    if os.path.exists(P3):
        c = schedule_parser.parse_schedule_pdf(P3)
        check('11-11 date', c['date'] == '2026-11-11', c['date'])
        check('11-11 two pages merged', c['page_count'] == 2, c['page_count'])
        check('11-11 rooms', c['summary']['rooms'] == 69, c['summary'])
        check('11-11 class count', c['summary']['class_count'] == 389, c['summary'])


def start_server(port, db, log):
    env = os.environ.copy()
    env['DHU_OPS_PORT'] = str(port)
    env['DHU_OPS_DB'] = db
    env['DHU_OPS_HOST'] = '127.0.0.1'
    env['DHU_OPS_INITIAL_ADMIN_PWD'] = 'admin123'
    out = open(log, 'wb')
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')],
                            cwd=ROOT, env=env, stdout=out, stderr=subprocess.STDOUT)
    for _ in range(120):
        try:
            with urllib.request.urlopen('http://127.0.0.1:%d/api/health' % port, timeout=1) as r:
                if r.status == 200:
                    return proc
        except Exception:
            time.sleep(0.1)
    proc.kill()
    raise RuntimeError('server did not start')


def req(path, token=None, data=None, method=None):
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), data=body,
                               headers={'Content-Type': 'application/json',
                                        **({'Authorization': 'Bearer ' + token} if token else {})},
                               method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=20)
        raw, code = resp.read(), resp.getcode()
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
    try:
        payload = json.loads(raw.decode('utf-8'))
    except Exception:
        payload = raw
    return code, payload


def post_files(path, files, token, extra=None):
    boundary = '----dhu' + uuid.uuid4().hex
    chunks = []
    for name, content in files:
        chunks.append(('--' + boundary).encode())
        chunks.append(('Content-Disposition: form-data; name="files"; filename="%s"' % name).encode('utf-8'))
        chunks.append(b'Content-Type: application/pdf')
        chunks.append(b'')
        chunks.append(content)
    for key, value in (extra or {}).items():
        chunks.append(('--' + boundary).encode())
        chunks.append(('Content-Disposition: form-data; name="%s"' % key).encode())
        chunks.append(b'')
        chunks.append(str(value).encode())
    chunks.append(('--' + boundary + '--').encode())
    body = b'\r\n'.join(chunks)
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), data=body, method='POST')
    r.add_header('Content-Type', 'multipart/form-data; boundary=' + boundary)
    r.add_header('Authorization', 'Bearer ' + token)
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        raw, code = resp.read(), resp.getcode()
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
    return code, json.loads(raw.decode('utf-8'))


def api_checks():
    code, login = req('/api/login', data={'name': 'admin', 'pwd': 'admin123'})
    check('login', code == 200 and login.get('token'), code)
    token = login['token']
    check('state requires auth', req('/api/state')[0] == 401)
    with open(P1, 'rb') as f:
        c1 = f.read()
    with open(P2, 'rb') as f:
        c2 = f.read()
    files = [('toroomdetail(1).pdf', c1), ('toroomdetail02.pdf', c2)]
    code, pv = post_files('/api/schedule/preview', files, token)
    check('preview 200', code == 200, code)
    check('preview two files', len(pv.get('files', [])) == 2, pv)
    check('preview 11-02 675', pv['files'][1]['summary']['class_count'] == 675, pv['files'][1].get('summary'))
    code, imp = post_files('/api/schedule/import', files, token)
    check('import 200', code == 200 and len(imp.get('imported') or []) == 2, (code, imp))
    code, days = req('/api/schedule/days?from=2026-11-01&to=2026-11-30', token)
    check('days 200/2', code == 200 and len(days.get('days', [])) == 2, days)
    check('days 11-01 borrow minutes', days['days'][0]['borrow_minutes'] == 5940, days['days'][0])
    check('days 11-02 class minutes', days['days'][1]['class_minutes'] == 30375, days['days'][1])
    check('days total minutes', sum(x['total_minutes'] for x in days['days']) == 37215, days['days'])
    check('days used rooms', 0 < days['summary']['used_rooms'] <= 160, days.get('summary'))
    code, day = req('/api/schedule/day?date=2026-11-02', token)
    check('day 200/160', code == 200 and len(day.get('rooms', [])) == 160, code)
    check('day slots 13', len(day.get('slots', [])) == 13, len(day.get('slots', [])))
    check('day summary', day['summary']['class_count'] == 675, day.get('summary'))
    check('day class minutes', day['summary']['class_minutes'] == 30375, day.get('summary'))
    check('day borrow minutes', day['summary']['borrow_minutes'] == 900, day.get('summary'))
    check('day total minutes', day['summary']['total_minutes'] == 31275, day.get('summary'))
    code, nf = req('/api/schedule/day?date=2026-11-03', token)
    check('not imported 404', code == 404 and nf.get('not_imported') is True, (code, nf))
    code, rep = post_files('/api/schedule/import', files, token)
    check('duplicate import 409', code == 409, (code, rep))
    code, rep = post_files('/api/schedule/import', files, token, {'replace': '1'})
    check('replace import 200', code == 200 and rep.get('replaced'), (code, rep))
    r = urllib.request.Request('http://127.0.0.1:%d/api/schedule/source?date=2026-11-02' % PORT)
    r.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(r, timeout=20) as resp:
        check('source pdf', resp.read(5) == b'%PDF-', resp.headers.get('Content-Type'))
    code, dele = req('/api/schedule/day?date=2026-11-01', token, method='DELETE')
    check('delete 200', code == 200, (code, dele))
    check('deleted 404', req('/api/schedule/day?date=2026-11-01', token)[0] == 404)


PORT = free_port()
TMP_DIR = tempfile.mkdtemp(prefix='dhu_sched_')
proc = None
try:
    if os.path.exists(P1) and os.path.exists(P2):
        proc = start_server(PORT, os.path.join(TMP_DIR, 'dhu_ops.db'), os.path.join(TMP_DIR, 'server.log'))
        parser_checks()
        api_checks()
    else:
        parser_checks()
        print('SKIP api checks: sample PDFs not found')
finally:
    if proc:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except Exception:
            pass
    shutil.rmtree(TMP_DIR, ignore_errors=True)

ok = sum(1 for x in results if x)
print('\n%d/%d passed' % (ok, len(results)))
sys.exit(0 if ok == len(results) else 1)

