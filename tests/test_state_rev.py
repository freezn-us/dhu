# -*- coding: utf-8 -*-
"""验证 /api/state 乐观锁与统一错误响应（临时库 + 临时端口，不碰正式数据）。
运行：python tests/test_state_rev.py
"""
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


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


PORT = free_port()
# 独立临时目录：DB 与试用授权同处一目录，避免 %TEMP% 下旧授权失效导致只读
TMP_DIR = tempfile.mkdtemp(prefix='dhu_revtest_')
DB = os.path.join(TMP_DIR, 'dhu_ops.db')
if os.path.exists(DB):
    os.remove(DB)

results = []


def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS' if cond else 'FAIL'), '-', name, ('| ' + str(detail)) if detail else '')


def req(path, token=None, data=None, method=None, raw_body=None):
    body = raw_body if raw_body is not None else (json.dumps(data).encode('utf-8') if data is not None else None)
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), data=body,
                               headers={'Content-Type': 'application/json',
                                        **({'Authorization': 'Bearer ' + token} if token else {})},
                               method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=10)
        return resp.getcode(), json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, None


env = os.environ.copy()
env['DHU_OPS_PORT'] = str(PORT)
env['DHU_OPS_DB'] = DB
env['DHU_OPS_INITIAL_ADMIN_PWD'] = 'admin123'  # 测试固定初始口令，跳过强制改密
env['DHU_OPS_HOST'] = '127.0.0.1'
log = open(os.path.join(TMP_DIR, 'server.log'), 'ab', buffering=0)
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
    check('登录', code == 200 and d.get('token'), code)
    token = d['token']

    code, d = req('/api/state', token=token)
    check('空库 GET 返回 rev=0', code == 200 and d.get('rev') == 0, d)

    st = {'v': 2, 'tickets': [{'no': 'WL-TEST-01', 'desc': '乐观锁验证'}], 'patrols': [], 'settings': {}}
    st['baseRev'] = 0
    code, d = req('/api/state', token=token, data=st)
    check('首次保存 rev=1', code == 200 and d.get('rev') == 1, d)

    code, d = req('/api/state', token=token)
    check('GET 带回 rev=1', code == 200 and d.get('rev') == 1 and len(d.get('tickets', [])) == 1, d.get('rev'))

    st2 = json.loads(json.dumps(st))
    st2['baseRev'] = 0  # 过期版本
    st2['tickets'][0]['desc'] = '过期写入'
    code, d = req('/api/state', token=token, data=st2)
    check('过期写入返回 409', code == 409 and d.get('conflict') is True, code)
    check('409 附最新状态', isinstance(d.get('state'), dict) and d['state'].get('rev') == 1
          and d['state']['tickets'][0]['desc'] == '乐观锁验证', '')

    st3 = json.loads(json.dumps(st))
    st3['baseRev'] = 1
    st3['tickets'][0]['desc'] = '正确版本写入'
    code, d = req('/api/state', token=token, data=st3)
    check('正确版本保存 rev=2', code == 200 and d.get('rev') == 2, d)

    code, d = req('/api/state', token=token)
    check('409 未污染数据', d['tickets'][0]['desc'] == '正确版本写入' and d.get('rev') == 2, '')

    legacy = {'v': 2, 'tickets': [], 'patrols': [], 'settings': {}}  # 不带 baseRev 的旧客户端
    code, d = req('/api/state', token=token, data=legacy)
    check('旧客户端兼容保存 rev=3', code == 200 and d.get('rev') == 3, d)

    code, d = req('/api/state', token=token, raw_body=b'{bad json')
    check('坏 JSON 返回 400 JSON', code == 400 and isinstance(d, dict) and d.get('error'), d)

    code, d = req('/api/state')
    check('未登录 401 JSON', code == 401 and isinstance(d, dict) and d.get('error'), d)

    code, d = req('/api/no-such-endpoint', token=token)
    check('未知接口 404 JSON', code == 404 and isinstance(d, dict) and d.get('error'), d)

    code, d = req('/api/health', token=token, data={})
    check('错误方法 405 JSON', code == 405 and isinstance(d, dict) and d.get('error'), d)

    code, d = req('/api/login', data={'name': 'admin', 'pwd': 'wrong'})
    check('登录失败仍为业务文案', code == 401 and d.get('error') == '用户名或密码错误', d)
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    log.close()
    try:
        os.remove(DB)
    except Exception:
        pass

print('----')
print('%d/%d 通过' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)