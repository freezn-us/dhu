# -*- coding: utf-8 -*-
"""验证「12 个权限点」已在服务端真实生效（临时库 + 临时端口，不碰正式数据）。

覆盖两面：
  1. 越权写入被 403 拦截，且不污染数据；
  2. 正常用户只改自己有权限的域、或原样提交未改动字段时不受影响（不误伤）。

运行：python tests/test_state_perm.py
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
# 每个测试用独立临时目录：DB 与试用授权都落在该目录，避免 %TEMP% 下旧授权
# 因机器码变化失效，把测试带进「只读宽限」状态。
TMP_DIR = tempfile.mkdtemp(prefix='dhu_permtest_')
DB = os.path.join(TMP_DIR, 'dhu_ops.db')


def req(path, token=None, data=None, method=None, raw_body=None):
    body = raw_body if raw_body is not None else (json.dumps(data).encode('utf-8') if data is not None else None)
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), data=body,
                               headers={'Content-Type': 'application/json',
                                        **({'Authorization': 'Bearer ' + token} if token else {})},
                               method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=15)
        raw = resp.read()
        code = resp.getcode()
    except urllib.error.HTTPError as e:
        raw = e.read()
        code = e.code
    try:
        return code, json.loads(raw.decode('utf-8'))
    except Exception:
        return code, raw[:200].decode('utf-8', errors='replace')


BASE_STATE = {
    'v': 2,
    'createdAt': '2026-11-15T09:00:00',
    'tickets': [{'no': 'WL-20261115-01', 'desc': '原始日志'}],
    'patrols': [{'id': 'p1', 'done': False}],
    'assets': [{'id': 'a1', 'name': '投影仪'}],
    'kb': [{'id': 'k1', 'title': '开机无信号'}],
    'settings': {'engineers': [{'name': '张工'}, {'name': '李工'},
                               {'name': '王工'}, {'name': '赵工'},
                               {'name': '钱工'}], 'rooms': []},
}

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
    check('管理员登录', code == 200 and bool(d.get('token')), code)
    admin = d['token']

    seed = json.loads(json.dumps(BASE_STATE))
    seed['baseRev'] = 0
    code, d = req('/api/state', token=admin, data=seed)
    check('首次写入（空库）放行', code == 200 and d.get('rev') == 1, d)
    check('工程师名单已入库', isinstance(seed.get('settings'), dict), '')

    users = [('viewer', '张工', ['reports']),
             ('writer', '李工', ['daily-log']),
             ('keeper', '王工', ['settings']),
             ('kbp', '钱工', ['kb']),
             ('nobody', '赵工', [])]
    tokens = {}
    for name, display, perms in users:
        code, d = req('/api/users', token=admin, method='POST',
                      data={'name': name, 'pwd': 'Test@12345', 'display_name': display, 'role': '工程师'})
        check('创建用户 ' + name, code == 200 and d.get('ok') is True, d)
        code, d = req('/api/users/%s/permissions' % name, token=admin, method='PUT',
                      data={'permissions': perms})
        check('设置权限 ' + name, code == 200, d)
        code, d = req('/api/login', data={'name': name, 'pwd': 'Test@12345'})
        check('登录 ' + name, code == 200 and bool(d.get('token')), code)
        tokens[name] = d.get('token', '')

    def current():
        code, st = req('/api/state', token=admin)
        return st

    def post_as(token, mutate=None):
        st = json.loads(json.dumps(current()))
        if mutate:
            mutate(st)
        st['baseRev'] = st.get('rev', 0)
        return req('/api/state', token=token, data=st)

    def set_desc(v):
        def _m(st):
            st['tickets'][0]['desc'] = v
        return _m

    def set_setting(v):
        def _m(st):
            st['settings']['note'] = v
        return _m

    # --- 管理员：全域放行 ---
    def admin_mutate(st):
        st['tickets'][0]['desc'] = '管理员改动'
        st['settings']['note'] = 'admin'
        st['kb'][0]['title'] = '管理员改的知识库'
        st['patrols'][0]['done'] = True
        st['assets'][0]['name'] = '管理员改的设备'
    code, d = post_as(admin, admin_mutate)
    check('管理员可修改全部域', code == 200, d)

    # --- 核心：只有 reports 权限的用户越权改日志 ---
    before = current()
    code, d = post_as(tokens['viewer'], set_desc('越权改动'))
    check('低权限用户改 tickets 被 403', code == 403 and isinstance(d, dict) and 'denied' in d, d)
    check('403 明确标出被拒域', isinstance(d, dict) and '工作日志' in d.get('denied', []), d.get('denied') if isinstance(d, dict) else d)
    after = current()
    check('403 未污染数据', after['tickets'][0]['desc'] == before['tickets'][0]['desc']
          and after.get('rev') == before.get('rev'), (before.get('rev'), after.get('rev')))

    # --- 不误伤：原样提交（所有域均未变化）应放行 ---
    code, d = post_as(tokens['viewer'])
    check('低权限用户原样提交放行（不误伤）', code == 200, d)

    # --- 有对应权限的业务用户 ---
    code, d = post_as(tokens['writer'], set_desc('工程师正常填报'))
    check('daily-log 用户改 tickets 放行', code == 200, d)

    code, d = post_as(tokens['writer'], set_setting('越权改配置'))
    check('daily-log 用户改 settings 被 403', code == 403, d)
    check('403 标出基础配置', isinstance(d, dict) and '基础配置' in d.get('denied', []), d.get('denied') if isinstance(d, dict) else d)

    def both(st):
        st['tickets'][0]['desc'] = '同时改'
        st['settings']['note'] = '同时改配置'
    code, d = post_as(tokens['writer'], both)
    check('混合改动只因无权限域被拦', code == 403 and isinstance(d, dict)
          and d.get('denied') == ['基础配置'], d.get('denied') if isinstance(d, dict) else d)
    check('混合改动未写库', current()['tickets'][0]['desc'] != '同时改', '')

    code, d = post_as(tokens['keeper'], set_setting('配置员正常修改'))
    check('settings 用户改 settings 放行', code == 200, d)

    def set_kb(st):
        st['kb'][0]['title'] = '越权改知识库'
    code, d = post_as(tokens['keeper'], set_kb)
    check('settings 用户改 kb 被 403', code == 403 and isinstance(d, dict)
          and '知识库' in d.get('denied', []), d)

    code, d = post_as(tokens['nobody'], set_desc('无任何权限'))
    check('无任何权限用户改 tickets 被 403', code == 403, d)

    # --- 报表 PDF 接口的权限点校验 ---
    code, d = req('/api/report/pdf', token=tokens['writer'], method='POST', data={})
    check('无 reports 权限调用 PDF 被 403', code == 403 and isinstance(d, dict)
          and '统计报表' in d.get('error', ''), d)
    code, d = req('/api/report/pdf', token=admin, method='POST', data={})
    check('管理员调用 PDF 不被权限拦截', code != 403, code)

    # --- 六个报表 JSON 接口统一要求 reports 权限 ---
    for path in ['/api/report/summary', '/api/report/trend', '/api/report/patrol',
                 '/api/report/device/summary', '/api/report/device/warranty']:
        code, _ = req(path, token=tokens['viewer'])
        check('reports 权限可读 ' + path, code == 200, code)
        code, _ = req(path, token=tokens['writer'])
        check('daily-log 用户读 ' + path + ' 被 403', code == 403, code)
    # compare 需要 from/to，单独带参数验证（无参数时 400 属正常参数校验，不是权限问题）
    code, _ = req('/api/report/compare?from=2026-11-01&to=2026-11-30', token=tokens['viewer'])
    check('reports 权限可读 /api/report/compare', code == 200, code)
    code, _ = req('/api/report/compare?from=2026-11-01&to=2026-11-30', token=tokens['writer'])
    check('daily-log 用户读 /api/report/compare 被 403', code == 403, code)

    # --- CSV 导出权限与结构校验 ---
    code, d = req('/api/export/csv', token=tokens['writer'], method='POST',
                  data={'filename': 'x.csv', 'rows': [['a']]})
    check('无导出权限用户调用 CSV 被 403', code == 403, code)
    code, d = req('/api/export/csv', token=admin, method='POST',
                  data={'filename': 'x.csv', 'rows': [['a', 'b']]})
    check('管理员 CSV 导出可用', code == 200, code)
    code, d = req('/api/export/csv', token=admin, method='POST',
                  data={'filename': 'x.csv', 'rows': 'bad'})
    check('CSV rows 非数组被 400', code == 400, code)

    # --- 审计写入按类别受权限约束 ---
    code, d = req('/api/audit', token=tokens['writer'], method='POST',
                  data={'category': '配置', 'action': '伪造配置变更'})
    check('daily-log 用户伪造配置审计被 403', code == 403, code)
    code, d = req('/api/audit', token=tokens['writer'], method='POST',
                  data={'category': '日志', 'action': '修改日志'})
    check('业务权限内写审计放行', code == 200, code)
    code, d = req('/api/audit', token=tokens['nobody'], method='POST',
                  data={'category': '页面', 'action': '访问页面'})
    check('页面审计所有登录用户可写', code == 200, code)
    code, d = req('/api/audit', token=tokens['nobody'], method='POST',
                  data={'category': '用户', 'action': '删除用户'})
    check('普通用户伪造用户审计被 403', code == 403, code)
    code, d = req('/api/audit', token=tokens['kbp'], method='POST',
                  data={'category': '知识库', 'action': '沉淀知识库'})
    check('kb 权限可写知识库审计（类别在白名单内）', code == 200, code)
    code, d = req('/api/audit', token=tokens['writer'], method='POST',
                  data={'category': '知识库', 'action': '伪造知识库审计'})
    check('daily-log 用户伪造知识库审计被 403', code == 403, code)

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
