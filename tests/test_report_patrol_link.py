# -*- coding: utf-8 -*-
"""D2 回归：巡视报表的 linkedTickets 不能因 OR 优先级绕过日期过滤。

数据中放 3 条巡视：区间内 1 条（有 logNo）、区间外 1 条（有 logNo）、
区间外 1 条（有 abnormal）。修复前区间外两条会被 OR 分支算进 linkedTickets。

运行：python tests/test_report_patrol_link.py
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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []


def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)) if detail else '')


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


PORT = free_port()
TMP_DIR = tempfile.mkdtemp(prefix='dhu_patrol_')
DB = os.path.join(TMP_DIR, 'dhu_ops.db')
LOG = os.path.join(TMP_DIR, 'server.log')
env = os.environ.copy()
env['DHU_OPS_PORT'] = str(PORT)
env['DHU_OPS_DB'] = DB
env['DHU_OPS_INITIAL_ADMIN_PWD'] = 'admin123'  # 测试固定初始口令，跳过强制改密
env['DHU_OPS_HOST'] = '127.0.0.1'


def req(path, token=None, data=None, method=None):
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), data=body,
                               headers={'Content-Type': 'application/json',
                                        **({'Authorization': 'Bearer ' + token} if token else {})},
                               method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=15)
        raw, code = resp.read(), resp.getcode()
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
    try:
        return code, json.loads(raw.decode('utf-8'))
    except Exception:
        return code, raw[:300].decode('utf-8', errors='replace')


log = open(LOG, 'ab', buffering=0)
proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')],
                        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
try:
    deadline = time.time() + 15
    up = False
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/api/health' % PORT, timeout=1)
            up = True
            break
        except Exception:
            time.sleep(0.2)
    check('服务启动', up)
    if not up:
        raise SystemExit(1)

    code, d = req('/api/login', data={'name': 'admin', 'pwd': 'admin123'})
    check('管理员登录', code == 200 and bool(d.get('token')), code)
    admin = d.get('token', '')

    state = {
        'tickets': [],
        'patrols': [
            {'id': 'p-in', 'date': '2026-11-10', 'name': 'A', 'status': 'done',
             'by': '张工', 'logNo': 'WL-1', 'results': {}},
            {'id': 'p-out-log', 'date': '2026-01-05', 'name': 'B', 'status': 'done',
             'by': '李工', 'logNo': 'WL-2', 'results': {}},
            {'id': 'p-out-abn', 'date': '2026-01-06', 'name': 'C', 'status': 'done',
             'by': '王工', 'abnormal': '投影异常', 'results': {}},
        ],
        'assets': {'devices': []},
        'kb': [],
        'settings': {},
        'baseRev': 0,
    }
    code, d = req('/api/state', token=admin, data=state)
    check('测试数据写入', code == 200, d)

    code, d = req('/api/report/patrol?from=2026-11-01&to=2026-11-30', token=admin)
    check('11 月报表可读', code == 200, d)
    check('11 月 total=1', isinstance(d, dict) and d.get('total') == 1, d.get('total') if isinstance(d, dict) else d)
    check('11 月 linkedTickets 不被区间外记录污染',
          isinstance(d, dict) and d.get('linkedTickets') == 1,
          d.get('linkedTickets') if isinstance(d, dict) else d)

    code, d = req('/api/report/patrol?from=2026-01-01&to=2026-01-31', token=admin)
    check('1 月报表可读', code == 200, d)
    check('1 月 total=2', isinstance(d, dict) and d.get('total') == 2, d.get('total') if isinstance(d, dict) else d)
    check('1 月 linkedTickets=2（OR 条件仍在区间内生效）',
          isinstance(d, dict) and d.get('linkedTickets') == 2,
          d.get('linkedTickets') if isinstance(d, dict) else d)

finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    log.close()
    shutil.rmtree(TMP_DIR, ignore_errors=True)

print('----')
print('%d/%d 通过' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
