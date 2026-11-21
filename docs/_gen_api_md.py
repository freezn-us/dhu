# -*- coding: utf-8 -*-
"""从 server.py 生成 docs/api.md（AST 静态解析，不导入/不执行 server 代码）。

为什么用 AST 而不是 import server：
  1. server.py 在模块级 import license_key（依赖 cryptography），环境缺包就跑不了；
     import 还会触发建库/建表等副作用，污染 data\dev.db。
  2. 旧版用 fn.__code__.co_names 找 'require_auth' 判断鉴权，但 @wraps 装饰后
     view_functions 拿到的是 wrapper，co_names 里没有装饰器名 —— 于是所有接口
     都被误判为「无需登录」（含 /api/users、/api/backup/restore）。
     AST 直接读装饰器节点，判断准确。

重新生成：python docs/_gen_api_md.py
"""
import ast
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SERVER_PY = os.path.join(ROOT, 'server.py')
VERSION_JSON = os.path.join(ROOT, 'assets', 'version.json')

# 分组：按前缀/精确路径归类，顺序即文档章节顺序
GROUPS = [
    ('静态与自检', ('/', '/api/health')),
    ('登录与会话', ('/api/login', '/api/logout', '/api/me')),
    ('授权', ('/api/license',)),
    ('业务状态', ('/api/state', '/api/export/csv', '/api/desktop/shortcut')),
    ('备份与恢复', ('/api/backups', '/api/backup', '/api/backup/restore')),
    ('账号与权限', ('/api/users', '/api/groups', '/api/permissions')),
    ('审计', ('/api/audit',)),
    ('排课查询', ('/api/schedule',)),
    ('统计报表', ('/api/report/',)),
]


def read_version():
    try:
        with io.open(VERSION_JSON, encoding='utf-8') as f:
            return json.load(f).get('version', '0.0.0')
    except Exception:
        return '0.0.0'


def group_of(rule):
    for title, prefixes in GROUPS:
        for p in prefixes:
            if p == '/':
                if rule == '/':
                    return title
            elif rule == p or rule.startswith(p):
                return title
    return '其他'


def dec_name(dec):
    """取装饰器名：支持 @require_auth 与 @xxx.yyy 形式。"""
    node = dec.func if isinstance(dec, ast.Call) else dec
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ''


def route_of(dec):
    """从 @app.route('/path', methods=[...]) 解析出 (path, methods)；非路由装饰器返回 None。"""
    if not isinstance(dec, ast.Call):
        return None
    node = dec.func
    if not (isinstance(node, ast.Attribute) and node.attr == 'route'
            and isinstance(node.value, ast.Name) and node.value.id == 'app'):
        return None
    if not dec.args:
        return None
    p = dec.args[0]
    path = p.value if isinstance(p, ast.Constant) and isinstance(p.value, str) else None
    if path is None:
        return None
    methods = set()
    for kw in dec.keywords:
        if kw.arg == 'methods' and isinstance(kw.value, (ast.List, ast.Tuple, ast.Set)):
            for elt in kw.value.elts:
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    methods.add(elt.value.upper())
    if not methods:
        methods = {'GET'}  # Flask 默认
    return path, methods


def auth_of(decorators):
    names = [dec_name(d) for d in decorators]
    if 'require_admin' in names:
        return '管理员'
    for d in decorators:
        if dec_name(d) != 'require_perm':
            continue
        perms = []
        if isinstance(d, ast.Call):
            for a in d.args:
                if isinstance(a, ast.Constant) and isinstance(a.value, str):
                    perms.append(a.value)
        return '权限：%s' % ('/'.join(perms) if perms else '（未声明）')
    if 'require_auth' in names:
        return '登录用户'
    return '无需登录'


def first_doc_line(fn):
    ds = ast.get_docstring(fn)
    if not ds:
        return ''
    return ds.strip().split('\n')[0].strip()


def collect():
    with io.open(SERVER_PY, encoding='utf-8') as f:
        tree = ast.parse(f.read(), filename=SERVER_PY)

    out = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        path, methods = None, set()
        auth = '无需登录'
        for dec in node.decorator_list:
            r = route_of(dec)
            if r:
                path, methods = r[0], r[1]
        if path is None:
            continue
        auth = auth_of(node.decorator_list)
        keep = sorted(m for m in methods if m in ('GET', 'POST', 'PUT', 'DELETE'))
        row = (path, ','.join(keep), auth, first_doc_line(node))
        # 同一路径多个方法拆成多个 def 时，合并方法列
        key = (path, auth)
        if key in out:
            old = out[key]
            merged = sorted(set(old[1].split(',')) | set(keep))
            row = (path, ','.join(merged), auth, old[3] or row[3])
        out[key] = row

    rows = {}
    for row in out.values():
        rows.setdefault(group_of(row[0]), []).append(row)
    for title in rows:
        rows[title].sort(key=lambda r: r[0])
    return rows


def render(rows):
    order = [g[0] for g in GROUPS] + ['其他']
    o = io.StringIO()
    o.write('# API 接口文档\n\n')
    o.write('> 由 `docs/_gen_api_md.py` 对 `server.py` 做 AST 静态解析生成，代码基线 v%s。\n' % read_version())
    o.write('> 重新生成：`python docs/_gen_api_md.py`（不导入 server，无建库副作用）\n\n')
    o.write('## 调用约定\n\n')
    o.write('- 鉴权列含义：**登录用户** = 需 `Authorization: Bearer <token>`（token 由 `/api/login` 签发）；'
            '**管理员** = 在登录基础上还要求管理员角色；**权限：x/y** = 登录且拥有 x 或 y 任一权限点；'
            '**无需登录** = 公开接口。\n')
    o.write('- 未登录或会话失效返回 401；权限不足返回 403；参数错误返回 400 与 `{"error": "原因"}`。'
            '`/api/` 下所有错误统一为 JSON。\n')
    o.write('- 业务数据以 `/api/state` 整体读写（GET 下发含 `rev`，POST 回带 `baseRev` 做乐观锁；'
            '版本不一致返回 409 并附最新 state）。报表查询走 `/api/report/*`，由 mart 宽表支撑。\n')
    o.write('- 授权状态影响写入与登录：宽限期只读，过期禁止登录（见 `/api/license`）。\n\n')

    total = 0
    for title in order:
        if title not in rows:
            continue
        o.write('## %s\n\n' % title)
        o.write('| 路径 | 方法 | 鉴权 | 说明 |\n| --- | --- | --- | --- |\n')
        for path, methods, auth, doc in rows[title]:
            o.write('| `%s` | %s | %s | %s |\n' % (path, methods, auth, doc or '—'))
            total += 1
        o.write('\n')

    o.write('---\n\n共 %d 个接口。\n' % total)
    return o.getvalue(), total


def main():
    if not os.path.exists(SERVER_PY):
        print('找不到 %s' % SERVER_PY, file=sys.stderr)
        return 2
    rows = collect()
    text, total = render(rows)
    path = os.path.join(HERE, 'api.md')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

    # 自检：若受保护接口被标为「无需登录」，说明解析退化，直接失败而非产出错文档
    bad = [r[0] for r in rows.get('账号与权限', []) if r[2] == '无需登录']
    bad += [r[0] for r in rows.get('备份与恢复', []) if r[2] == '无需登录']
    if bad:
        print('错误：以下受保护接口被解析为「无需登录」，请检查装饰器解析逻辑：%s' % bad, file=sys.stderr)
        return 3

    print('已生成 %s（%d 个接口）' % (path, total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
