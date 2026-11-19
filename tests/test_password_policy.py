# -*- coding: utf-8 -*-
"""S1a/S1b 验收：随机初始口令、强制改密、离线重置、监听地址与 access.txt。

运行：python tests/test_password_policy.py
"""
import json
import os
import re
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


def req(port, path, token=None, data=None, method=None):
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (port, path), data=body,
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
        return code, raw[:200].decode('utf-8', errors='replace')


def wait_up(port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/api/health' % port, timeout=1)
            return True
        except Exception:
            time.sleep(0.2)
    return False


def read_initial_pwd(tmp):
    path = os.path.join(tmp, '初始管理员密码.txt')
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8-sig') as f:
        text = f.read()
    m = re.search(r'初始密码：(\S+)', text)
    return m.group(1) if m else None


PORT = free_port()
TMP_DIR = tempfile.mkdtemp(prefix='dhu_pwdtest_')
DB = os.path.join(TMP_DIR, 'dhu_ops.db')
env = os.environ.copy()
env.pop('DHU_OPS_INITIAL_ADMIN_PWD', None)  # 走真实随机口令路径
env['DHU_OPS_PORT'] = str(PORT)
env['DHU_OPS_DB'] = DB
env['DHU_OPS_HOST'] = '127.0.0.1'

log = open(os.path.join(TMP_DIR, 'server.log'), 'ab', buffering=0)


def start():
    return subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')],
                            cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)


def stop(proc):
    try:
        proc.terminate()
        proc.wait(timeout=8)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


proc = start()
try:
    check('服务启动', wait_up(PORT))
    init_pwd = read_initial_pwd(TMP_DIR)
    check('生成随机初始密码文件', bool(init_pwd), init_pwd)
    check('初始密码为 12 位', bool(init_pwd) and len(init_pwd) == 12, len(init_pwd or ''))

    code, d = req(PORT, '/api/login', data={'name': 'admin', 'pwd': init_pwd})
    check('初始密码可登录', code == 200 and bool(d.get('token')), code)
    admin = d.get('token')
    check('登录返回 must_change_pwd=True', d.get('must_change_pwd') is True, d)

    code, d = req(PORT, '/api/me', token=admin)
    check('/api/me 放行且带标记', code == 200 and d.get('must_change_pwd') is True, code)

    code, d = req(PORT, '/api/state', token=admin)
    check('未改密访问业务接口被 403 拦截', code == 403 and d.get('code') == 'must_change_password', d)

    code, d = req(PORT, '/api/state', token=admin, method='POST', data={'v': 2, 'tickets': []})
    check('未改密写入同样被拦截', code == 403, code)

    code, d = req(PORT, '/api/change-password', token=admin, method='POST',
                  data={'old_pwd': 'wrong-old', 'new_pwd': 'Strong#Pass2026', 'confirm_pwd': 'Strong#Pass2026'})
    check('原密码错误被拒绝', code == 400, d)

    code, d = req(PORT, '/api/change-password', token=admin, method='POST',
                  data={'old_pwd': init_pwd, 'new_pwd': 'short', 'confirm_pwd': 'short'})
    check('弱密码（不足 10 位）被拒绝', code == 400, d)

    code, d = req(PORT, '/api/change-password', token=admin, method='POST',
                  data={'old_pwd': init_pwd, 'new_pwd': 'Strong#Pass2026', 'confirm_pwd': 'Strong#Pass2027'})
    check('两次输入不一致被拒绝', code == 400, d)

    code, d = req(PORT, '/api/change-password', token=admin, method='POST',
                  data={'old_pwd': init_pwd, 'new_pwd': init_pwd, 'confirm_pwd': init_pwd})
    check('新密码不能与原密码相同', code == 400, d)

    NEW_PWD = 'Strong#Pass2026'
    code, d = req(PORT, '/api/change-password', token=admin, method='POST',
                  data={'old_pwd': init_pwd, 'new_pwd': NEW_PWD, 'confirm_pwd': NEW_PWD})
    check('改密成功', code == 200 and d.get('ok') is True, d)
    check('改密后一次性密码文件被删除',
          not os.path.exists(os.path.join(TMP_DIR, '初始管理员密码.txt')))

    code, d = req(PORT, '/api/state', token=admin)
    check('改密后可访问业务接口', code == 200, code)

    req(PORT, '/api/logout', token=admin, method='POST')
    code, d = req(PORT, '/api/login', data={'name': 'admin', 'pwd': init_pwd})
    check('旧初始密码已失效', code == 401, code)
    code, d = req(PORT, '/api/login', data={'name': 'admin', 'pwd': NEW_PWD})
    check('新密码登录成功且不再强制改密',
          code == 200 and d.get('must_change_pwd') is False, d)

    # 离线重置管理员密码
    stop(proc)
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'server.py'), '--reset-admin'],
                       cwd=ROOT, env=env, capture_output=True, timeout=60)
    check('--reset-admin 正常退出', r.returncode == 0, r.returncode)
    reset_pwd = read_initial_pwd(TMP_DIR)
    check('重置后重新生成一次性密码文件', bool(reset_pwd) and reset_pwd != NEW_PWD, reset_pwd)

    proc = start()
    check('重置后服务可启动', wait_up(PORT))
    code, d = req(PORT, '/api/login', data={'name': 'admin', 'pwd': reset_pwd})
    check('重置密码可登录且再次强制改密',
          code == 200 and d.get('must_change_pwd') is True, d)
finally:
    stop(proc)
    log.close()

# S1b：默认监听地址与 access.txt（直接调用服务端纯函数，不启动服务）
sys.path.insert(0, ROOT)
os.environ['DHU_OPS_DB'] = DB
import server  # noqa: E402

server.CONFIG_DIR = TMP_DIR
server.DB = os.path.join(TMP_DIR, 'host-test.db')
access = os.path.join(TMP_DIR, 'access.txt')


def write_access(v):
    with open(access, 'w', encoding='utf-8') as f:
        f.write(v)


write_access('local\n')
check('access.txt=local → 仅本机', server._default_host() == '127.0.0.1', server._default_host())
write_access('lan\n')
check('access.txt=lan → 局域网', server._default_host() == '0.0.0.0', server._default_host())
write_access('garbage\n')
check('access.txt 无法识别 → 回退', server._default_host() == '127.0.0.1', server._default_host())
os.remove(access)
check('无 access.txt 且全新库 → 仅本机', server._default_host() == '127.0.0.1', server._default_host())
open(server.DB, 'ab').close()
check('无 access.txt 且已有库（升级）→ 保持局域网',
      server._default_host() == '0.0.0.0', server._default_host())

shutil.rmtree(TMP_DIR, ignore_errors=True)
total, passed = len(results), sum(1 for x in results if x)
print('\n%d/%d 通过' % (passed, total))
sys.exit(0 if passed == total else 1)
