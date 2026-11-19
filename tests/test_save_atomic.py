# -*- coding: utf-8 -*-
"""D1 回归：state JSON 与 mart 表必须同成同败，失败时绝不能返回成功。

场景：
  1. 正常保存两次；
  2. 人为破坏 tickets_mart 表后保存 → 必须 500，且 state 仍是旧值/旧版本号；
  3. 重启服务（init_db 自动补表）后再保存 → 恢复成功。

运行：python tests/test_save_atomic.py
"""
import json
import os
import shutil
import socket
import sqlite3
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
TMP_DIR = tempfile.mkdtemp(prefix='dhu_atomic_')
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


def start_server():
    log = open(LOG, 'ab', buffering=0)
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')],
                            cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/api/health' % PORT, timeout=1)
            return proc, log
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    log.close()
    raise SystemExit('服务未能启动')


def stop_server(proc, log):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    log.close()


proc, log = start_server()
try:
    code, d = req('/api/login', data={'name': 'admin', 'pwd': 'admin123'})
    check('管理员登录', code == 200 and bool(d.get('token')), code)
    admin = d.get('token', '')

    def state_desc():
        code, st = req('/api/state', token=admin)
        return st.get('tickets', [{}])[0].get('desc'), st.get('rev')

    def save(desc, base_rev):
        return req('/api/state', token=admin, data={
            'tickets': [{'no': 'WL-1', 'desc': desc, 'status': 'new'}],
            'baseRev': base_rev,
        })

    code, d = save('v1', 0)
    check('首次写入成功', code == 200 and d.get('rev') == 1, d)

    code, d = save('v2', 1)
    check('第二次写入成功（事务提交）', code == 200 and d.get('rev') == 2, d)
    check('第二次写入已落库', state_desc() == ('v2', 2), state_desc())

    # 人为删除 mart 表，模拟同步失败（磁盘错误/表损坏等）
    conn = sqlite3.connect(DB)
    conn.execute('DROP TABLE tickets_mart')
    conn.commit()
    conn.close()

    before = state_desc()
    code, d = save('v3-should-not-persist', 2)
    check('mart 同步失败返回 500（不再假成功）', code == 500, (code, d))
    check('失败响应带明确错误信息', isinstance(d, dict) and '保存失败' in d.get('error', ''),
          d.get('error') if isinstance(d, dict) else d)
    check('失败后 state 未被部分写入', state_desc() == before, (before, state_desc()))

    stop_server(proc, log)

    # 重启：init_db 会补回缺失的 mart 表，mart_backfill 会重新回填
    proc, log = start_server()
    code, d = req('/api/login', data={'name': 'admin', 'pwd': 'admin123'})
    check('重启后管理员登录', code == 200 and bool(d.get('token')), code)
    admin = d.get('token', '')

    code, d = save('v3', 2)
    check('恢复后可正常保存', code == 200 and d.get('rev') == 3, d)
    check('恢复后数据已落库', state_desc() == ('v3', 3), state_desc())

finally:
    try:
        stop_server(proc, log)
    except Exception:
        pass
    shutil.rmtree(TMP_DIR, ignore_errors=True)

print('----')
print('%d/%d 通过' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
