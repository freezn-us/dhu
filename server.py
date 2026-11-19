# -*- coding: utf-8 -*-
"""东华大学多媒体教室运维系统 · 后端服务

Flask + SQLite：静态文件托管 + 登录鉴权 + 状态持久化。
所有业务数据（settings/tickets/patrols）整体存为单行 JSON，
账号密码以 SHA-256+salt 哈希存储在 users 表，会话 token 存 sessions 表。

运行：python server.py           （默认 http://127.0.0.1:8420）
环境变量：DHU_OPS_PORT 端口；DHU_OPS_DB 数据库文件路径
"""
import base64
import csv
import hashlib
import io
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import time
from functools import wraps
from urllib.parse import quote

from flask import Flask, Response, abort, jsonify, request, send_from_directory

# PyInstaller 打包后，静态资源在 sys._MEIPASS 临时目录；数据库落到可写的 ProgramData
if getattr(sys, 'frozen', False):
    ROOT = sys._MEIPASS
    CONFIG_DIR = os.path.dirname(os.path.abspath(sys.executable))
    _DEFAULT_DB = os.path.join(os.environ.get('ProgramData', r'C:\ProgramData'), 'DHU-Ops', 'dhu_ops.db')
else:
    ROOT = os.path.dirname(os.path.abspath(__file__))
    CONFIG_DIR = ROOT
    _DEFAULT_DB = os.path.join(ROOT, 'data', 'dhu_ops.db')
DB = os.environ.get('DHU_OPS_DB', _DEFAULT_DB)


def _read_port_file():
    """安装时选择的端口写在程序目录 port.txt，便于安装脚本自定义端口。"""
    try:
        with open(os.path.join(CONFIG_DIR, 'port.txt'), 'r') as f:
            return int(f.read().strip().lstrip('\ufeff'))
    except Exception:
        return None


def _read_access_file():
    """读取安装器写入的访问范围：lan=允许局域网，local=仅本机；文件缺失返回 None。

    该文件由安装程序写入程序目录（打包运行时即 exe 所在目录），服务启动时读取，
    避免「安装时选了仅本机，服务却仍监听 0.0.0.0」的不一致。
    """
    try:
        with open(os.path.join(CONFIG_DIR, 'access.txt'), 'r', encoding='utf-8-sig') as f:
            v = f.read().strip().lower()
        if v in ('lan', '1', 'true', 'yes', 'on'):
            return 'lan'
        if v in ('local', '0', 'false', 'no', 'off'):
            return 'local'
    except Exception:
        pass
    return None


def _default_host():
    """监听地址优先级：DHU_OPS_HOST > access.txt > 升级兼容 > 新装仅本机。

    - 有 access.txt：按安装时的选择；
    - 无 access.txt 且数据库已存在：视为旧部署升级，保持原来的 0.0.0.0 行为，
      避免升级后同事突然无法访问；
    - 无 access.txt 且是全新安装：默认 127.0.0.1，只有本机可访问。
    """
    mode = _read_access_file()
    if mode == 'lan':
        return '0.0.0.0'
    if mode == 'local':
        return '127.0.0.1'
    return '0.0.0.0' if os.path.exists(DB) else '127.0.0.1'


# 端口优先级：DHU_OPS_PORT > IIS HttpPlatformHandler 注入的 HTTP_PLATFORM_PORT > port.txt > 8420
PORT = int(os.environ.get('DHU_OPS_PORT') or os.environ.get('HTTP_PLATFORM_PORT') or _read_port_file() or '8420')
# 监听地址默认仅本机；安装时勾选「允许局域网访问」后由 access.txt 切换为 0.0.0.0
HOST = os.environ.get('DHU_OPS_HOST') or _default_host()


def _read_version():
    """读取随包发布的版本号（assets/version.json）。"""
    try:
        with open(os.path.join(ROOT, 'assets', 'version.json'), 'r', encoding='utf-8') as f:
            return json.load(f).get('version', '0.0.0')
    except Exception:
        return '0.0.0'


VERSION = _read_version()

app = Flask(__name__, static_folder=None)


# ---------- 统一错误响应：/api/ 下所有错误一律返回 JSON ----------
@app.errorhandler(400)
def _err_400(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '请求参数不正确'}), 400
    return e


@app.errorhandler(401)
def _err_401(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '未登录或会话已过期'}), 401
    return e


@app.errorhandler(403)
def _err_403(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '没有权限执行该操作'}), 403
    return e


@app.errorhandler(404)
def _err_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '接口不存在'}), 404
    return e


@app.errorhandler(405)
def _err_405(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '请求方法不允许'}), 405
    return e


@app.errorhandler(500)
def _err_500(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': '服务器内部错误，请稍后重试'}), 500
    return e


@app.errorhandler(Exception)
def _err_unexpected(e):
    # 兜底：未捕获异常记录日志；API 返回统一 JSON，页面请求交给 Flask 默认处理
    import traceback
    traceback.print_exc()
    if request.path.startswith('/api/'):
        return jsonify({'error': '服务器内部错误，请稍后重试'}), 500
    raise e


# ---------- 数据库 ----------
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- 初始口令与密码策略 ----------
INITIAL_PWD_FILENAME = '初始管理员密码.txt'
PWD_MIN_LEN = 10
PWD_MAX_LEN = 64


def generate_initial_password():
    """生成 12 位随机初始密码（排除 0/O、1/I/l 等易混淆字符）。"""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(12))


def validate_password(pwd, name):
    """校验密码策略，返回错误文案；空字符串表示通过。"""
    pwd = pwd or ''
    if len(pwd) < PWD_MIN_LEN:
        return '密码至少 %d 位' % PWD_MIN_LEN
    if len(pwd) > PWD_MAX_LEN:
        return '密码不能超过 %d 位' % PWD_MAX_LEN
    if pwd.lower() == str(name or '').lower():
        return '密码不能与登录名相同'
    if pwd.strip() != pwd:
        return '密码首尾不能包含空格'
    return ''


def _initial_pwd_path():
    return os.path.join(os.path.dirname(DB), INITIAL_PWD_FILENAME)


def _write_initial_password(pwd):
    """把首次登录用的初始密码写入数据目录的一次性文件（修改密码后删除）。"""
    path = _initial_pwd_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = ('东华大学多媒体教室运维系统 · 初始管理员密码\r\n'
            '用户名：admin\r\n'
            '初始密码：%s\r\n'
            '首次登录后必须修改密码；修改成功后本文件会自动删除。\r\n' % pwd)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(text)
    return path


def _remove_initial_pwd_file():
    try:
        os.remove(_initial_pwd_path())
    except OSError:
        pass


def init_db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute('CREATE TABLE IF NOT EXISTS state ('
              'id INTEGER PRIMARY KEY CHECK (id = 1), '
              'json TEXT NOT NULL, '
              'updated_at TEXT NOT NULL)')
    c.execute('CREATE TABLE IF NOT EXISTS users ('
              'name TEXT PRIMARY KEY, '
              'pwd_hash TEXT NOT NULL, '
              'salt TEXT NOT NULL, '
              'role TEXT NOT NULL)')
    c.execute('CREATE TABLE IF NOT EXISTS sessions ('
              'token TEXT PRIMARY KEY, '
              'name TEXT NOT NULL, '
              'created_at TEXT NOT NULL, '
              'expires_at INTEGER NOT NULL DEFAULT 0)')
    # 升级：为已有 sessions 表补 expires_at（旧会话无过期时间，升级后视为已过期，需重新登录）
    sess_cols = [r[1] for r in c.execute('PRAGMA table_info(sessions)').fetchall()]
    if 'expires_at' not in sess_cols:
        c.execute('ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0')
    # 审计日志表：登录、页面访问与各项业务操作（仅管理员可查询）
    c.execute('CREATE TABLE IF NOT EXISTS audit_logs ('
              'id INTEGER PRIMARY KEY AUTOINCREMENT, '
              'ts TEXT NOT NULL, '
              'user TEXT NOT NULL, '
              'category TEXT NOT NULL, '
              'action TEXT NOT NULL, '
              'target TEXT, '
              'detail TEXT, '
              'ip TEXT, '
              'ua TEXT)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts)')
    # 权限系统相关表
    c.execute('CREATE TABLE IF NOT EXISTS user_groups ('
              'id INTEGER PRIMARY KEY AUTOINCREMENT, '
              'name TEXT NOT NULL UNIQUE, '
              'created_at TEXT NOT NULL)')
    c.execute('CREATE TABLE IF NOT EXISTS group_members ('
              'group_id INTEGER NOT NULL, '
              'user_name TEXT NOT NULL, '
              'PRIMARY KEY (group_id, user_name))')
    c.execute('CREATE TABLE IF NOT EXISTS user_permissions ('
              'user_name TEXT NOT NULL, '
              'permission TEXT NOT NULL, '
              'PRIMARY KEY (user_name, permission))')
    c.execute('CREATE TABLE IF NOT EXISTS group_permissions ('
              'group_id INTEGER NOT NULL, '
              'permission TEXT NOT NULL, '
              'PRIMARY KEY (group_id, permission))')
    # 升级：为已有 users 表增加 is_admin 列与 active 列
    cols = [r[1] for r in c.execute('PRAGMA table_info(users)').fetchall()]
    if 'is_admin' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
    if 'active' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
    if 'display_name' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
    # 升级：首次登录强制改密标记（老用户默认 0，不强制全站改密）
    if 'must_change_pwd' not in cols:
        c.execute('ALTER TABLE users ADD COLUMN must_change_pwd INTEGER NOT NULL DEFAULT 0')
    # 升级：state 表增加 rev 列（乐观锁版本号，防多端并发保存互相覆盖）
    state_cols = [r[1] for r in c.execute('PRAGMA table_info(state)').fetchall()]
    if 'rev' not in state_cols:
        c.execute('ALTER TABLE state ADD COLUMN rev INTEGER NOT NULL DEFAULT 0')
    if not c.execute('SELECT COUNT(*) FROM users').fetchone()[0]:
        # 首次启动初始化管理员账号：随机初始密码写入一次性文件，首次登录必须修改。
        # DHU_OPS_INITIAL_ADMIN_PWD 用于自动化测试/离线引导：明确指定已知初始口令时
        # 视为已完成口令交付，不再强制改密；正常安装始终走随机口令 + 强制改密。
        env_pwd = os.environ.get('DHU_OPS_INITIAL_ADMIN_PWD')
        initial_pwd = env_pwd or generate_initial_password()
        salt = secrets.token_hex(16)
        c.execute('INSERT INTO users (name, pwd_hash, salt, role, is_admin, active, display_name, must_change_pwd) '
                  'VALUES (?,?,?,?,1,1,?,?)',
                  ('admin', hash_pwd(salt, initial_pwd), salt, '管理员', '管理员', 0 if env_pwd else 1))
        conn.commit()
        if not env_pwd:
            try:
                pwd_file = _write_initial_password(initial_pwd)
                if not getattr(sys, 'frozen', False):
                    print('[init] 初始管理员密码已写入：%s' % pwd_file)
            except Exception as e:
                sys.stderr.write('[init] 初始密码文件写入失败：%s\n' % e)
    else:
        # 老系统管理员升级：内置 admin 账号固定为超级管理员
        c.execute("UPDATE users SET is_admin=1 WHERE name='admin'")
    # 系统只允许一个超级管理员：除内置 admin 外一律不是超管
    c.execute("UPDATE users SET is_admin=0 WHERE name <> 'admin' AND is_admin <> 0")
    # 显示名兜底：admin 固定为「管理员」，其他缺省用登录名
    c.execute("UPDATE users SET display_name='管理员' WHERE name='admin' AND (display_name IS NULL OR display_name='')")
    c.execute("UPDATE users SET display_name=name WHERE display_name IS NULL OR display_name=''")
    # ---- 数据仓库 mart 表：把 state JSON 中的核心实体拆出来，做 SQL 聚合 ----
    c.execute('CREATE TABLE IF NOT EXISTS tickets_mart ('
              'id TEXT PRIMARY KEY, '
              'created_at TEXT, caller TEXT, phone TEXT, '
              'room TEXT, building TEXT, device TEXT, devices TEXT, '
              'fault TEXT, urgency TEXT, status TEXT, source TEXT, '
              'period TEXT, stage TEXT, log_type TEXT, '
              'assignee TEXT, assigned_at TEXT, accepted_at TEXT, arrived_at TEXT, '
              'resolved_at TEXT, closed_at TEXT, duration_min INTEGER, '
              'solved INTEGER, satisfaction REAL, parts TEXT, helpers TEXT, remark TEXT, '
              'updated_at TEXT)')
    c.execute('CREATE TABLE IF NOT EXISTS patrols_mart ('
              'id TEXT PRIMARY KEY, '
              'date TEXT, period TEXT, name TEXT, plan TEXT, '
              'assignee TEXT, status TEXT, at TEXT, by TEXT, remark TEXT, '
              'abnormal TEXT, log_no TEXT, repair_no TEXT, '
              'fail_count INTEGER, total_count INTEGER, results_json TEXT, '
              'updated_at TEXT)')
    c.execute('CREATE TABLE IF NOT EXISTS devices_mart ('
              'id TEXT PRIMARY KEY, '
              'name TEXT, category TEXT, brand TEXT, sn TEXT, '
              'room TEXT, building TEXT, bought_at TEXT, warranty_to TEXT, '
              'repair_count INTEGER, status TEXT, note TEXT, created_at TEXT, updated_at TEXT)')
    # state_meta 记录 mart 表的数据来源版本（做幂等迁移）
    c.execute('CREATE TABLE IF NOT EXISTS state_meta ('
              'key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)')
    # 为报表查询加索引
    for idx_sql in [
        'CREATE INDEX IF NOT EXISTS idx_tm_created ON tickets_mart(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_tm_status ON tickets_mart(status)',
        'CREATE INDEX IF NOT EXISTS idx_tm_room ON tickets_mart(room)',
        'CREATE INDEX IF NOT EXISTS idx_tm_fault ON tickets_mart(fault)',
        'CREATE INDEX IF NOT EXISTS idx_tm_assignee ON tickets_mart(assignee)',
        'CREATE INDEX IF NOT EXISTS idx_tm_urgency ON tickets_mart(urgency)',
        'CREATE INDEX IF NOT EXISTS idx_tm_stage ON tickets_mart(stage)',
        'CREATE INDEX IF NOT EXISTS idx_pm_date ON patrols_mart(date)',
        'CREATE INDEX IF NOT EXISTS idx_pm_status ON patrols_mart(status)',
        'CREATE INDEX IF NOT EXISTS idx_dm_room ON devices_mart(room)',
        'CREATE INDEX IF NOT EXISTS idx_dm_category ON devices_mart(category)',
        'CREATE INDEX IF NOT EXISTS idx_dm_status ON devices_mart(status)',
        'CREATE INDEX IF NOT EXISTS idx_dm_warranty ON devices_mart(warranty_to)',
    ]:
        c.execute(idx_sql)
    conn.commit()
    conn.close()


# ---------- 数据仓库同步：从 state JSON blob 增量/全量同步到 mart 表 ----------

def _now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def _count_results(results):
    """巡视 results{} 字典：返回 (fail_count, total_count)"""
    if not isinstance(results, dict):
        return 0, 0
    total = len(results)
    fail = sum(1 for v in results.values() if v not in ('pass', True, None, ''))
    return fail, total


def mart_sync(conn, state_obj):
    """把前端传上来的完整 state 对象同步到 mart 表（幂等，用 INSERT OR REPLACE）。"""
    now = _now_iso()
    c = conn.cursor()
    # 1) tickets
    tickets = state_obj.get('tickets') if isinstance(state_obj, dict) else None
    if isinstance(tickets, list):
        c.execute('DELETE FROM tickets_mart')
        rows = []
        for t in tickets:
            rows.append((
                t.get('no', ''), t.get('createdAt', ''), t.get('caller', ''), t.get('phone', ''),
                t.get('room', ''), t.get('building', ''), t.get('device', ''), t.get('devices', '') or t.get('device', ''),
                t.get('fault', ''), t.get('urgency', ''), t.get('status', ''), t.get('source', ''),
                t.get('period', ''), t.get('stage', ''), t.get('logType', ''),
                t.get('assignee', ''), t.get('assignedAt', ''), t.get('acceptedAt', ''), t.get('arrivedAt', ''),
                t.get('resolvedAt', ''), t.get('closedAt', ''), t.get('durationMin') or 0,
                1 if t.get('solved') is True else (0 if t.get('solved') is False else None),
                t.get('satisfaction') or None, t.get('parts', ''), t.get('helpers', ''), t.get('remark', ''),
                now,
            ))
        if rows:
            c.executemany(
                'INSERT OR REPLACE INTO tickets_mart VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                rows)
    # 2) patrols
    patrols = state_obj.get('patrols') if isinstance(state_obj, dict) else None
    if isinstance(patrols, list):
        c.execute('DELETE FROM patrols_mart')
        rows = []
        for p in patrols:
            fc, tc = _count_results(p.get('results'))
            rows.append((
                p.get('id', ''), p.get('date', ''), p.get('period', ''), p.get('name', ''), p.get('plan', ''),
                p.get('assignee', ''), p.get('status', ''), p.get('at', ''), p.get('by', ''), p.get('remark', ''),
                p.get('abnormal', ''), p.get('logNo', ''), p.get('repairNo', ''),
                fc, tc, json.dumps(p.get('results') or {}, ensure_ascii=False),
                now,
            ))
        if rows:
            c.executemany(
                'INSERT OR REPLACE INTO patrols_mart VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                rows)
    # 3) devices
    assets = state_obj.get('assets') if isinstance(state_obj, dict) else None
    devices = assets.get('devices') if isinstance(assets, dict) else None
    if isinstance(devices, list):
        c.execute('DELETE FROM devices_mart')
        rows = []
        for d in devices:
            rows.append((
                d.get('id', ''), d.get('name', ''), d.get('category', ''), d.get('brand', ''), d.get('sn', ''),
                d.get('room', ''), d.get('building', ''), d.get('boughtAt', ''), d.get('warrantyTo', ''),
                d.get('repairCount') or 0, d.get('status', ''), d.get('note', ''), d.get('createdAt', ''), now,
            ))
        if rows:
            c.executemany(
                'INSERT OR REPLACE INTO devices_mart VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                rows)
    # 记录 mart 最后一次同步时间，便于诊断
    c.execute('INSERT OR REPLACE INTO state_meta VALUES (?,?,?)', ('mart_synced_at', now, now))
    # 事务由调用方统一提交：state JSON 与 mart 表必须同成同败


def mart_backfill():
    """服务启动时执行：如果 state JSON 里有数据但 mart 表为空，则做一次全量回填（幂等）。"""
    try:
        conn = get_db()
        row = conn.execute('SELECT json FROM state WHERE id = 1').fetchone()
        if not row or not row['json']:
            conn.close()
            return False
        try:
            obj = json.loads(row['json'])
        except Exception:
            conn.close()
            return False
        t_count = conn.execute('SELECT COUNT(*) FROM tickets_mart').fetchone()[0]
        p_count = conn.execute('SELECT COUNT(*) FROM patrols_mart').fetchone()[0]
        d_count = conn.execute('SELECT COUNT(*) FROM devices_mart').fetchone()[0]
        # 只要 state JSON 有数据且 mart 有任一表空，就同步
        s_t = len(obj.get('tickets', []) or []) if isinstance(obj, dict) else 0
        s_p = len(obj.get('patrols', []) or []) if isinstance(obj, dict) else 0
        s_d = len((obj.get('assets') or {}).get('devices', []) or []) if isinstance(obj, dict) else 0
        if (s_t > 0 and t_count == 0) or (s_p > 0 and p_count == 0) or (s_d > 0 and d_count == 0):
            mart_sync(conn, obj)
            conn.commit()
            conn.close()
            return True
        conn.close()
        return False
    except Exception as e:
        print('mart_backfill warn:', e)
        return False


# 可用权限点（与左侧菜单项一一对应；用户管理仅管理员可见，不进入勾选列表）
PERMISSIONS = [
    {'key': 'dashboard', 'name': '工作台'},
    {'key': 'intake', 'name': '来电登记'},
    {'key': 'daily-log', 'name': '每日工作日志'},
    {'key': 'log-entry', 'name': '单条日志录入'},
    {'key': 'patrol', 'name': '巡视管理'},
    {'key': 'tickets', 'name': '日志查询'},
    {'key': 'reports', 'name': '统计报表'},
    {'key': 'assets', 'name': '教室/设备档案'},
    {'key': 'kb', 'name': '知识库'},
    {'key': 'data', 'name': '导入 / 导出'},
    {'key': 'settings', 'name': '基础配置'},
    {'key': 'help', 'name': '使用说明'},
]
PERMISSION_KEYS = [p['key'] for p in PERMISSIONS]
PERMISSION_NAMES = dict((p['key'], p['name']) for p in PERMISSIONS)

# ---------- 服务端权限校验（补上「12 个权限点只在前端菜单生效」的缺口） ----------
# state 是一次性整体覆盖写入，给接口挂固定权限点会误伤只改自己模块的普通用户。
# 因此按「本次提交中发生变化的顶层域」动态校验：只拦无对应菜单权限的那部分，
# 未改动的字段原样带回不受影响；元数据字段（v/createdAt/rev）不参与校验。
STATE_FIELD_PERMS = {
    'tickets':  ('intake', 'daily-log', 'log-entry', 'tickets', 'patrol'),
    'patrols':  ('patrol', 'daily-log'),
    'assets':   ('assets', 'settings'),
    'settings': ('settings', 'assets'),
    'kb':       ('kb',),
}
STATE_FIELD_LABELS = {
    'tickets': '工作日志', 'patrols': '巡视管理', 'assets': '教室/设备档案',
    'settings': '基础配置', 'kb': '知识库',
}


def require_perm(*keys):
    """要求登录用户至少具备一个指定权限点；管理员恒放行。须放在 @require_auth 之下。"""
    def deco(fn):
        @wraps(fn)
        def wrapper(user, *args, **kwargs):
            if is_admin_user(user):
                return fn(user, *args, **kwargs)
            if not set(effective_permissions(user)).intersection(keys):
                return jsonify({'error': '没有权限执行该操作：需要「%s」' %
                                PERMISSION_NAMES.get(keys[0], keys[0])}), 403
            return fn(user, *args, **kwargs)
        return wrapper
    return deco


def denied_state_fields(user, old, new, has_old=True):
    """返回用户无权修改的顶层域中文名列表；管理员与首次写入恒为空。"""
    if not has_old or is_admin_user(user):
        return []
    perms = set(effective_permissions(user))
    denied = []
    for field, needed in STATE_FIELD_PERMS.items():
        if old.get(field) == new.get(field):
            continue
        if not perms.intersection(needed):
            denied.append(STATE_FIELD_LABELS.get(field, field))
    return sorted(set(denied))


def perm_names(keys):
    """权限点转成菜单名称，避免审计日志出现英文标识。"""
    return [PERMISSION_NAMES.get(k, k) for k in (keys or [])]


def perm_change_text(before, after):
    """生成权限调整说明：新增/收回哪些页面，以及调整后的可访问清单。"""
    b, a = set(before or []), set(after or [])
    added = [k for k in (after or []) if k not in b]
    removed = [k for k in (before or []) if k not in a]
    parts = []
    if added:
        parts.append('新增「' + '」「'.join(perm_names(added)) + '」')
    if removed:
        parts.append('收回「' + '」「'.join(perm_names(removed)) + '」')
    head = '、'.join(parts) if parts else '可访问页面未变化'
    if after:
        return head + '；当前可访问 ' + str(len(a)) + ' 项：' + '、'.join(perm_names(after))
    return head + '；当前无任何菜单权限'


def is_admin_user(name):
    """判断指定账号是否为管理员。"""
    try:
        conn = get_db()
        row = conn.execute('SELECT is_admin FROM users WHERE name=?', (name,)).fetchone()
        conn.close()
        return bool(row and row['is_admin'])
    except Exception:
        return False


def effective_permissions(name):
    """计算用户有效权限：用户自身权限 ∪ 所在用户组的权限；管理员返回全部。"""
    if is_admin_user(name):
        return list(PERMISSION_KEYS)
    conn = get_db()
    perms = set()
    for r in conn.execute('SELECT permission FROM user_permissions WHERE user_name=?', (name,)):
        if r['permission'] in PERMISSION_KEYS:
            perms.add(r['permission'])
    for r in conn.execute(
            'SELECT gp.permission FROM group_permissions gp '
            'JOIN group_members gm ON gm.group_id=gp.group_id '
            'WHERE gm.user_name=?', (name,)):
        if r['permission'] in PERMISSION_KEYS:
            perms.add(r['permission'])
    conn.close()
    return sorted(perms)


def safe_user_row(row):
    """去除敏感字段后的用户信息。"""
    return {
        'name': row['name'],
        'display_name': row['display_name'] or row['name'],
        'role': row['role'],
        'is_admin': bool(row['is_admin']),
        'active': bool(row['active'])
    }


def valid_login_name(name):
    """登录名仅允许英文、数字、点、下划线、短横。"""
    import re
    return bool(re.match(r'^[A-Za-z0-9_.\-]{1,32}$', name or ''))


PWD_ITERATIONS = 200000   # PBKDF2-HMAC-SHA256 迭代次数
SESSION_TTL_SEC = 24 * 3600  # 会话有效期：24 小时

# 登录失败限流：同一「用户名 + 来源 IP」5 分钟内失败 5 次，锁定 5 分钟
LOGIN_MAX_FAILS = 5
LOGIN_WINDOW_SEC = 300
_login_guard = {}


def hash_pwd(salt, pwd):
    """口令慢哈希：PBKDF2-HMAC-SHA256，格式 pbkdf2_sha256$<迭代数>$<hex>。"""
    dk = hashlib.pbkdf2_hmac('sha256', pwd.encode('utf-8'), salt.encode('utf-8'), PWD_ITERATIONS)
    return 'pbkdf2_sha256$%d$%s' % (PWD_ITERATIONS, dk.hex())


def verify_pwd(salt, pwd, stored):
    """校验口令，返回 (是否正确, 是否为旧版单轮 SHA-256 哈希)。

    旧哈希在登录成功后由调用方就地升级为 PBKDF2，避免存量账号无法登录。
    """
    stored = stored or ''
    if stored.startswith('pbkdf2_sha256$'):
        try:
            _, iters, hexdig = stored.split('$', 2)
            dk = hashlib.pbkdf2_hmac('sha256', pwd.encode('utf-8'), salt.encode('utf-8'), int(iters))
            return secrets.compare_digest(dk.hex(), hexdig), False
        except (TypeError, ValueError):
            return False, False
    legacy = hashlib.sha256((salt + pwd).encode('utf-8')).hexdigest()
    return secrets.compare_digest(legacy, stored), True


def _login_key(name):
    return '%s|%s' % ((name or '').lower()[:64], request.remote_addr or '')


def _login_lock_left(key):
    """返回剩余锁定秒数，0 表示未锁定。"""
    rec = _login_guard.get(key)
    if not rec:
        return 0
    left = rec.get('locked_until', 0) - time.time()
    return int(left) + 1 if left > 0 else 0


def _login_fail(key):
    """记录一次失败；达到阈值后锁定，返回锁定剩余秒数。"""
    now = time.time()
    if len(_login_guard) > 2000:  # 防止字典无限增长
        for k in [k for k, v in _login_guard.items()
                  if v.get('locked_until', 0) < now and not [t for t in v.get('fails', []) if now - t < LOGIN_WINDOW_SEC]]:
            _login_guard.pop(k, None)
    rec = _login_guard.setdefault(key, {'fails': [], 'locked_until': 0})
    rec['fails'] = [t for t in rec['fails'] if now - t < LOGIN_WINDOW_SEC]
    rec['fails'].append(now)
    if len(rec['fails']) >= LOGIN_MAX_FAILS:
        rec['locked_until'] = now + LOGIN_WINDOW_SEC
        rec['fails'] = []
        return LOGIN_WINDOW_SEC
    return 0


# ---------- 鉴权 ----------
def bearer_token():
    h = request.headers.get('Authorization', '')
    if h.startswith('Bearer '):
        return h[7:].strip()
    return ''


def auth_user():
    """返回当前会话行（name/expires_at/must_change_pwd），无效或过期返回 None。"""
    token = bearer_token()
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        'SELECT s.name AS name, s.expires_at AS expires_at, '
        'COALESCE(u.must_change_pwd, 0) AS must_change_pwd '
        'FROM sessions s LEFT JOIN users u ON u.name = s.name WHERE s.token = ?',
        (token,)).fetchone()
    if not row:
        conn.close()
        return None
    try:
        expires_at = int(row['expires_at'] or 0)
    except (TypeError, ValueError):
        expires_at = 0
    # 过期会话（含升级前无过期字段的旧会话）一律失效并清理
    if expires_at <= time.time():
        conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
        conn.commit()
        conn.close()
        return None
    conn.close()
    return row


# 首次登录未改密时仍放行的接口：查身份、改密、退出；其余业务接口一律 403
MUST_CHANGE_ALLOWED = ('/api/login', '/api/logout', '/api/me', '/api/change-password',
                       '/api/health', '/api/license')


def _must_change_block(row):
    """强制改密中间件：返回 403 响应或 None。"""
    try:
        if int(row['must_change_pwd'] or 0) and request.path not in MUST_CHANGE_ALLOWED:
            return jsonify({'error': '首次登录需先修改初始密码',
                            'code': 'must_change_password'}), 403
    except (KeyError, TypeError, ValueError):
        pass
    return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        row = auth_user()
        if not row:
            abort(401)
        blocked = _must_change_block(row)
        if blocked is not None:
            return blocked
        return fn(row['name'], *args, **kwargs)
    return wrapper


# ---------- 授权（License） ----------
import license_key  # noqa: E402

_LIC_DIR = os.path.dirname(DB) or CONFIG_DIR
_lic_cache = {'ts': 0, 'st': None}


def license_status(force=False):
    now = time.time()
    if force or not _lic_cache['st'] or now - _lic_cache['ts'] > 3:
        try:
            _lic_cache['st'] = license_key.load_status(_LIC_DIR)
        except Exception as e:
            _lic_cache['st'] = {'state': 'invalid', 'reason': '授权模块异常：%s' % e,
                                'machine': '', 'org': '', 'edition': '', 'expires': '',
                                'days_left': 0, 'trial': False, 'max_users': 0, 'modules': []}
        _lic_cache['ts'] = now
    return _lic_cache['st']


@app.before_request
def _license_gate():
    p = request.path
    if not p.startswith('/api/'):
        return None
    # 这几个接口任何授权状态都放行：登录页/退出/健康检查/授权读写（导入后即可恢复）
    if p in ('/api/login', '/api/logout', '/api/health', '/api/me', '/api/license'):
        return None
    st = license_status()
    if st['state'] == 'expired':
        return jsonify({'error': '授权已过期，系统已停止服务。请联系厂商续期后重新导入授权。',
                        'license': st, 'locked': True}), 403
    if request.method in ('POST', 'PUT', 'DELETE', 'PATCH') and not license_key.can_write(st):
        return jsonify({'error': (st.get('reason') or '授权异常，当前为只读模式'),
                        'readonly': True, 'license': st}), 403
    return None


# ---------- 授权功能位 ----------
# 授权文件的 modules 字段声明可用业务模块；字段缺失、为空或含 all 时全部放行（兼容升级前的存量授权）。
_MODULE_PATHS = (
    ('/api/report', 'report'),
    ('/api/audit', 'audit'),
)
_MODULE_LABELS = {'report': '统计报表', 'audit': '审计日志', 'kb': '知识库', 'device': '教室/设备档案'}


def module_enabled(mod):
    mods = license_status().get('modules') or []
    return (not mods) or ('all' in mods) or (mod in mods)


@app.before_request
def _module_gate():
    p = request.path
    for prefix, mod in _MODULE_PATHS:
        if p == prefix or p.startswith(prefix + '/'):
            if not module_enabled(mod):
                return jsonify({'error': '当前授权未包含「%s」模块，请联系厂商升级授权'
                                         % _MODULE_LABELS.get(mod, mod),
                                'module': mod, 'license': license_status()}), 403
    return None


@app.route('/api/license', methods=['GET'])
def api_license_get():
    return jsonify(license_status(force=True))


@app.route('/api/license', methods=['POST'])
@require_auth
def api_license_post(user):
    if not is_admin_user(user):
        return jsonify({'error': '仅管理员可导入授权'}), 403
    data = request.get_json(force=True, silent=True) or {}
    text = data.get('license')
    if isinstance(text, dict):
        text = json.dumps(text, ensure_ascii=False)
    text = (text or '').strip()
    if not text:
        return jsonify({'error': '授权内容为空'}), 400
    ok, res = license_key.import_license(_LIC_DIR, text)
    _lic_cache['st'] = None
    if not ok:
        return jsonify({'error': res}), 400
    return jsonify({'ok': True, 'license': res})


@app.route('/api/report/pdf', methods=['POST'])
@require_auth
@require_perm('reports')
def api_report_pdf(user):
    data = request.get_json(force=True, silent=True) or {}
    try:
        import report_pdf
        pdf = report_pdf.build_report_pdf(data)
    except Exception as e:
        return jsonify({'error': 'PDF 生成失败：%s' % e}), 500
    fname = '东华大学运维统计报告_%s_%s.pdf' % (data.get('from') or '', data.get('to') or '')
    resp = Response(pdf, mimetype='application/pdf')
    resp.headers['Content-Disposition'] = "attachment; filename*=UTF-8''%s" % quote(fname)
    resp.headers['Cache-Control'] = 'no-store'
    return resp


# ---------- 静态文件 ----------
@app.route('/')
def index():
    resp = send_from_directory(ROOT, 'index.html')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/<path:path>')
def static_files(path):
    # 只暴露前端需要的静态资源白名单；源码、备份、数据库、密钥等一律 404，
    # 避免「源码方式启动」时被直接下载（打包运行下 ROOT 只含打包资源，同样适用）
    if not (path == 'index.html' or path.startswith('assets/') or path.startswith('vendor/')):
        abort(404)
    resp = send_from_directory(ROOT, path)
    # JS/CSS/HTML 不缓存，避免升级后浏览器沿用旧脚本
    if path.endswith(('.js', '.css', '.html')):
        resp.headers['Cache-Control'] = 'no-store'
    return resp


# ---------- API ----------
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get('name', '')).strip()
    pwd = str(data.get('pwd', ''))
    guard_key = _login_key(name)
    # 先看限流：已锁定直接拒绝，避免继续尝试爆破
    left = _login_lock_left(guard_key)
    if left:
        audit_write(name or '匿名', '登录', '登录失败', name, '尝试过于频繁，已临时锁定')
        return jsonify({'error': '尝试次数过多，请在 %d 秒后重试' % left}), 429
    conn = get_db()
    row = conn.execute('SELECT pwd_hash, salt, role, is_admin, active, display_name, must_change_pwd '
                       'FROM users WHERE name = ?', (name,)).fetchone()
    ok, legacy = verify_pwd(row['salt'], pwd, row['pwd_hash']) if row else (False, False)
    if not row or not ok:
        conn.close()
        locked = _login_fail(guard_key)
        audit_write(name or '匿名', '登录', '登录失败', name, '用户名或密码错误')
        if locked:
            return jsonify({'error': '尝试次数过多，请在 %d 秒后重试' % locked}), 429
        return jsonify({'error': '用户名或密码错误'}), 401
    if not row['active']:
        conn.close()
        audit_write(name, '登录', '登录失败', name, '账号已停用')
        return jsonify({'error': '该账号已停用，请联系管理员'}), 403
    # 旧版单轮 SHA-256 哈希在登录成功时就地升级为 PBKDF2
    if legacy:
        salt = secrets.token_hex(16)
        conn.execute('UPDATE users SET salt=?, pwd_hash=? WHERE name=?', (salt, hash_pwd(salt, pwd), name))
    token = secrets.token_urlsafe(32)
    # 同一账号只保留最新会话：新登录顶掉之前登录的会话
    conn.execute('DELETE FROM sessions WHERE name = ?', (name,))
    conn.execute('INSERT INTO sessions (token, name, created_at, expires_at) VALUES (?,?,?,?)',
                 (token, name, time.strftime('%Y-%m-%dT%H:%M:%S'), int(time.time()) + SESSION_TTL_SEC))
    conn.commit()
    conn.close()
    _login_guard.pop(guard_key, None)
    audit_write(name, '登录', '登录成功', name, '以「' + (str(row['role'] or '').strip() or '普通用户') + '」角色登录')
    return jsonify({'token': token, 'name': name, 'role': row['role'],
                    'display_name': row['display_name'] or name,
                    'is_admin': bool(row['is_admin']),
                    'must_change_pwd': bool(row['must_change_pwd']),
                    'permissions': effective_permissions(name)})


@app.route('/api/logout', methods=['POST'])
def logout():
    token = bearer_token()
    if token:
        conn = get_db()
        row = conn.execute('SELECT name FROM sessions WHERE token = ?', (token,)).fetchone()
        conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
        conn.commit()
        conn.close()
        if row:
            audit_write(row['name'], '登录', '退出登录', row['name'], '')
    return jsonify({'ok': True})


@app.route('/api/health')
def health():
    # 调试/部署自检：浏览器直接打开应返回 {"ok": true}
    return jsonify({'ok': True, 'port': PORT, 'host': HOST, 'version': VERSION})


@app.route('/api/me')
@require_auth
def me(user):
    conn = get_db()
    row = conn.execute('SELECT role, is_admin, display_name, must_change_pwd '
                       'FROM users WHERE name = ?', (user,)).fetchone()
    conn.close()
    return jsonify({'name': user, 'role': row['role'] if row else '',
                    'display_name': (row['display_name'] or user) if row else user,
                    'is_admin': bool(row and row['is_admin']),
                    'must_change_pwd': bool(row and row['must_change_pwd']),
                    'permissions': effective_permissions(user)})


@app.route('/api/change-password', methods=['POST'])
@require_auth
def change_password(user):
    """首次登录/主动修改密码：校验原密码与新密码策略，成功后清除强制改密标记。"""
    data = request.get_json(force=True, silent=True) or {}
    old_pwd = str(data.get('old_pwd', ''))
    new_pwd = str(data.get('new_pwd', ''))
    confirm = str(data.get('confirm_pwd', ''))
    conn = get_db()
    row = conn.execute('SELECT pwd_hash, salt FROM users WHERE name = ?', (user,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '账号不存在'}), 404
    ok, _legacy = verify_pwd(row['salt'], old_pwd, row['pwd_hash'])
    if not ok:
        conn.close()
        return jsonify({'error': '原密码不正确'}), 400
    if confirm and new_pwd != confirm:
        conn.close()
        return jsonify({'error': '两次输入的新密码不一致'}), 400
    err = validate_password(new_pwd, user)
    if err:
        conn.close()
        return jsonify({'error': err}), 400
    if verify_pwd(row['salt'], new_pwd, row['pwd_hash'])[0]:
        conn.close()
        return jsonify({'error': '新密码不能与原密码相同'}), 400
    salt = secrets.token_hex(16)
    conn.execute('UPDATE users SET salt=?, pwd_hash=?, must_change_pwd=0 WHERE name=?',
                 (salt, hash_pwd(salt, new_pwd), user))
    # 改密后踢掉该账号的其他会话，只保留当前这一个
    current = bearer_token()
    conn.execute('DELETE FROM sessions WHERE name=? AND token<>?', (user, current or ''))
    conn.commit()
    conn.close()
    _remove_initial_pwd_file()
    audit_write(user, '登录', '修改密码', user, '密码已更新，强制改密标记已清除')
    return jsonify({'ok': True})


@app.route('/api/state', methods=['GET'])
@require_auth
def get_state(user):
    conn = get_db()
    row = conn.execute('SELECT json, rev FROM state WHERE id = 1').fetchone()
    conn.close()
    if not row:
        return jsonify({'rev': 0})  # 首次为空，前端走演示数据种子逻辑后回写
    try:
        obj = json.loads(row['json'])
        if not isinstance(obj, dict):
            obj = {}
    except (ValueError, TypeError):
        obj = {}
    obj['rev'] = row['rev']  # 版本号随状态下发，前端保存时原样带回
    return jsonify(obj)


@app.route('/api/state', methods=['POST'])
@require_auth
def put_state(user):
    raw = request.get_data(as_text=True)
    try:
        obj = json.loads(raw)
        if not isinstance(obj, dict) or not isinstance(obj.get('tickets'), list):
            raise ValueError('bad shape')
    except (ValueError, TypeError):
        return jsonify({'error': '状态数据格式不正确'}), 400
    # 乐观锁：客户端携带 baseRev 时校验版本，过期写入返回 409 并附最新状态；
    # 不携带 baseRev 的旧客户端保持原有覆盖行为（向后兼容）
    base_rev = obj.pop('baseRev', None)
    rev_out = obj.pop('rev', None)
    if rev_out is not None and not isinstance(rev_out, int):
        return jsonify({'error': '状态数据格式不正确'}), 400
    raw = json.dumps(obj, ensure_ascii=False)
    conn = get_db()
    try:
        row = conn.execute('SELECT json, rev FROM state WHERE id = 1').fetchone()
        cur_rev = row['rev'] if row else 0
        # 服务端权限校验：按本次实际发生变化的顶层域检查菜单权限点。
        # 首次写入（无历史 state）放行，避免新部署初始化被卡住。
        old_obj = {}
        if row and row['json']:
            try:
                old_obj = json.loads(row['json'])
                if not isinstance(old_obj, dict):
                    old_obj = {}
            except (ValueError, TypeError):
                old_obj = {}
        denied = denied_state_fields(user, old_obj, obj, has_old=bool(row))
        if denied:
            return jsonify({'error': '没有权限修改「%s」，请联系管理员开通对应菜单权限'
                                     % '、'.join(denied), 'denied': denied}), 403
        if base_rev is not None:
            if not isinstance(base_rev, int) or base_rev < 0:
                return jsonify({'error': '状态数据格式不正确'}), 400
            if base_rev != cur_rev:
                latest = conn.execute('SELECT json, rev FROM state WHERE id = 1').fetchone()
                try:
                    latest_obj = json.loads(latest['json']) if latest else {}
                    if not isinstance(latest_obj, dict):
                        latest_obj = {}
                except (ValueError, TypeError):
                    latest_obj = {}
                latest_obj['rev'] = latest['rev'] if latest else 0
                return jsonify({'error': '数据已被其他客户端更新，请刷新后重试',
                                'conflict': True, 'rev': cur_rev, 'state': latest_obj}), 409
        new_rev = cur_rev + 1
        conn.execute('INSERT INTO state (id, json, updated_at, rev) VALUES (1, ?, ?, ?) '
                     'ON CONFLICT(id) DO UPDATE SET json = excluded.json, '
                     'updated_at = excluded.updated_at, rev = excluded.rev',
                     (raw, time.strftime('%Y-%m-%dT%H:%M:%S'), new_rev))
        # state JSON 与 mart 表在同一事务中提交：任一步失败就整体回滚，
        # 不能出现「接口返回成功、数据实际没保存」的静默丢数据。
        try:
            mart_sync(conn, obj)
            conn.commit()
        except Exception as e:
            conn.rollback()
            import sys as _sys
            print('mart_sync fail:', e, file=_sys.stderr)
            return jsonify({'error': '保存失败：数据仓库同步未完成，本次修改未生效，请重试'}), 500
    finally:
        conn.close()
    return jsonify({'ok': True, 'rev': new_rev})


# ---------- CSV 导出（服务端按 GB18030 生成，Excel 双击打开不乱码） ----------
@app.route('/api/export/csv', methods=['POST'])
@require_auth
@require_perm('data', 'tickets', 'reports')
def export_csv(user):
    data = request.get_json(force=True, silent=True) or {}
    rows = data.get('rows')
    if not isinstance(rows, list):
        return jsonify({'error': '导出数据格式不正确'}), 400
    if len(rows) > 20000:
        return jsonify({'error': '导出数据过大，请缩小时间范围后重试'}), 400
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator='\r\n')
    for row in rows:
        if not isinstance(row, (list, tuple)):
            return jsonify({'error': '导出数据格式不正确'}), 400
        writer.writerow(['' if c is None else str(c)[:10000] for c in row])
    body = buf.getvalue().encode('gb18030', errors='replace')
    filename = str(data.get('filename') or 'export.csv')
    resp = Response(body, mimetype='text/csv')
    resp.headers['Content-Type'] = 'text/csv; charset=gb18030'
    resp.headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + quote(filename)
    return resp


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        row = auth_user()
        if not row:
            abort(401)
        blocked = _must_change_block(row)
        if blocked is not None:
            return blocked
        user = row['name']
        if not is_admin_user(user):
            return jsonify({'error': '仅管理员可执行此操作'}), 403
        return fn(user, *args, **kwargs)
    return wrapper


# ---------- 数据备份 / 恢复（仅管理员） ----------
BACKUP_DIR = os.path.join(os.path.dirname(DB), 'backups')
MAX_BACKUPS = 20          # 服务器端保留的最近自动备份份数（滚动清理）
SQLITE_MAGIC = b'SQLite format 3\x00'


# ---------- 审计日志 ----------
MAX_AUDIT_ROWS = 200000   # 超过后自动清理最旧的记录，避免数据库无限增长
# 客户端只能写入其业务权限范围内的审计类别；用户/系统/登录类仅管理员可写（登录日志由服务端产生）
AUDIT_CATEGORY_PERMS = {
    '页面': (),
    '登录': None,
    '日志': ('intake', 'daily-log', 'log-entry', 'tickets', 'patrol'),
    '工单': ('intake', 'daily-log', 'tickets', 'patrol'),
    '巡视': ('patrol', 'daily-log'),
    '配置': ('settings', 'assets'),
    '数据': ('data',),
    '知识库': ('kb',),
    '用户': None,
    '系统': None,
}
AUDIT_CATEGORIES = ['登录', '页面', '日志', '工单', '巡视', '配置', '数据', '知识库', '用户', '系统']


def _audit_ip():
    raw = request.headers.get('X-Forwarded-For') or request.remote_addr or ''
    return str(raw).split(',')[0].strip()[:64]


def audit_write(user, category, action, target='', detail=''):
    """写入一条审计记录（任何异常都不影响主流程）。"""
    try:
        conn = get_db()
        conn.execute('INSERT INTO audit_logs (ts, user, category, action, target, detail, ip, ua) '
                     'VALUES (?,?,?,?,?,?,?,?)',
                     (time.strftime('%Y-%m-%dT%H:%M:%S'), str(user or '匿名')[:64],
                      str(category or '系统')[:16], str(action or '')[:64],
                      str(target or '')[:200], str(detail or '')[:2000],
                      _audit_ip(), str(request.headers.get('User-Agent', ''))[:300]))
        cnt = conn.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0]
        if cnt > MAX_AUDIT_ROWS:
            conn.execute('DELETE FROM audit_logs WHERE id IN '
                         '(SELECT id FROM audit_logs ORDER BY id ASC LIMIT ?)', (cnt - MAX_AUDIT_ROWS,))
        conn.commit()
        conn.close()
    except Exception:
        pass


def _write_backup(dest_path):
    """用 SQLite 在线备份 API 生成一致性快照（备份期间不阻塞读写）。"""
    src = sqlite3.connect(DB)
    try:
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _backup_files():
    """返回备份目录内的备份文件（新的在前）。"""
    try:
        names = [n for n in os.listdir(BACKUP_DIR)
                 if n.endswith('.db') and (n.startswith('dhu_ops_backup_') or n.startswith('pre_restore_'))]
    except OSError:
        return []
    items = []
    for n in names:
        p = os.path.join(BACKUP_DIR, n)
        try:
            st = os.stat(p)
        except OSError:
            continue
        items.append({'name': n, 'size': st.st_size,
                      'time': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.st_mtime)),
                      'auto': n.startswith('pre_restore_')})
    items.sort(key=lambda x: x['name'], reverse=True)
    return items


@app.route('/api/backups')
@require_admin
def list_backups(_admin):
    return jsonify({'dir': BACKUP_DIR, 'files': _backup_files()})


@app.route('/api/backup', methods=['POST'])
@require_admin
def create_backup(_admin):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    fname = 'dhu_ops_backup_%s.db' % time.strftime('%Y%m%d_%H%M%S')
    fpath = os.path.join(BACKUP_DIR, fname)
    try:
        _write_backup(fpath)
    except Exception as e:
        return jsonify({'error': '备份失败：%s' % e}), 500
    # 滚动清理：手动备份只保留最近 MAX_BACKUPS 份（恢复前自动备份 pre_restore_* 不清理）
    manuals = [f for f in _backup_files() if not f['auto']]
    for old in manuals[MAX_BACKUPS:]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old['name']))
        except OSError:
            pass
    with open(fpath, 'rb') as f:
        body = f.read()
    resp = Response(body, mimetype='application/octet-stream')
    resp.headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + quote(fname)
    resp.headers['X-Backup-Name'] = quote(fname)
    resp.headers['X-Backup-Path'] = quote(fpath)
    resp.headers['Access-Control-Expose-Headers'] = 'X-Backup-Name, X-Backup-Path'
    audit_write(_admin, '数据', '创建数据库备份', fname, '生成数据库完整快照，可用于故障恢复')
    return resp


@app.route('/api/backup/restore', methods=['POST'])
@require_admin
def restore_backup(_admin):
    f = request.files.get('file')
    if not f:
        return jsonify({'error': '请选择要恢复的备份文件（.db）'}), 400
    data = f.read()
    if len(data) < 512 or not data.startswith(SQLITE_MAGIC):
        return jsonify({'error': '文件不是有效的 SQLite 数据库备份'}), 400
    tmp = DB + '.restore_tmp'
    with open(tmp, 'wb') as out:
        out.write(data)
    # 校验关键表结构，避免恢复到不相关的数据库文件
    try:
        conn = sqlite3.connect(tmp)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
        if 'state' not in tables or 'users' not in tables:
            raise ValueError('缺少 state / users 表')
    except Exception as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return jsonify({'error': '备份文件校验失败：%s' % e}), 400
    # 恢复前自动为当前数据留一份兜底备份
    os.makedirs(BACKUP_DIR, exist_ok=True)
    safety = os.path.join(BACKUP_DIR, 'pre_restore_%s.db' % time.strftime('%Y%m%d_%H%M%S'))
    try:
        _write_backup(safety)
    except Exception:
        pass
    try:
        os.replace(tmp, DB)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return jsonify({'error': '替换数据库失败：%s' % e}), 500
    init_db()  # 兼容旧版本备份：补齐缺失的表 / 列
    audit_write(_admin, '数据', '恢复数据库备份', str(f.filename or ''), '从备份文件恢复数据库；恢复前已自动备份当前数据为「' + os.path.basename(safety) + '」')
    return jsonify({'ok': True, 'safety': safety,
                    'message': '恢复完成。当前所有登录会话已失效，请使用备份中的账号重新登录。'})


def _user_permissions_map(conn):
    m = {}
    for r in conn.execute('SELECT user_name, permission FROM user_permissions'):
        m.setdefault(r['user_name'], []).append(r['permission'])
    return m


def _user_groups_map(conn):
    m = {}
    for r in conn.execute('SELECT gm.user_name, g.id, g.name '
                          'FROM group_members gm JOIN user_groups g ON g.id = gm.group_id'):
        m.setdefault(r['user_name'], []).append({'id': r['id'], 'name': r['name']})
    return m


def _group_permissions_map(conn):
    m = {}
    for r in conn.execute('SELECT group_id, permission FROM group_permissions'):
        m.setdefault(r['group_id'], []).append(r['permission'])
    return m


@app.route('/api/permissions')
@require_auth
def list_permissions(_user):
    return jsonify({'permissions': PERMISSIONS})


def _engineer_names():
    """基础配置 · 工程师名单中的姓名集合（账号用户名的合法取值来源）。"""
    conn = get_db()
    row = conn.execute('SELECT json FROM state WHERE id = 1').fetchone()
    conn.close()
    if not row:
        return set()
    try:
        engs = (json.loads(row['json']).get('settings') or {}).get('engineers') or []
    except Exception:
        return set()
    return set(str(e.get('name', '')).strip() for e in engs
               if isinstance(e, dict) and str(e.get('name', '')).strip())


@app.route('/api/users')
@require_admin
def list_users(_admin):
    conn = get_db()
    rows = conn.execute('SELECT name, display_name, role, is_admin, active FROM users ORDER BY name').fetchall()
    perm_map = _user_permissions_map(conn)
    group_map = _user_groups_map(conn)
    out = []
    for r in rows:
        u = safe_user_row(r)
        u['permissions'] = sorted(perm_map.get(r['name'], []))
        u['groups'] = group_map.get(r['name'], [])
        out.append(u)
    conn.close()
    return jsonify({'users': out})


@app.route('/api/users', methods=['POST'])
@require_admin
def create_user(_admin):
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get('name', '')).strip()
    pwd = str(data.get('pwd', ''))
    role = str(data.get('role', '')).strip() or '工程师'
    display_name = str(data.get('display_name', '')).strip() or name
    if not name or not pwd:
        return jsonify({'error': '登录名和密码不能为空'}), 400
    if not valid_login_name(name):
        return jsonify({'error': '登录名只能使用英文、数字、点、下划线或短横（不超过32字符）'}), 400
    if len(display_name) > 32:
        return jsonify({'error': '用户名过长'}), 400
    err = validate_password(pwd, name)
    if err:
        return jsonify({'error': err}), 400
    # 用户名必须取自「基础配置 · 工程师名单」，账号数量与工程师一一对应
    if display_name not in _engineer_names():
        return jsonify({'error': '用户名必须是「基础配置 · 工程师名单」中的姓名，请先添加该工程师'}), 400
    conn = get_db()
    if conn.execute('SELECT 1 FROM users WHERE name=?', (name,)).fetchone():
        conn.close()
        return jsonify({'error': '登录名已存在'}), 400
    if conn.execute('SELECT 1 FROM users WHERE display_name=?', (display_name,)).fetchone():
        conn.close()
        return jsonify({'error': '「%s」已有登录账号，请直接编辑该账号' % display_name}), 400
    salt = secrets.token_hex(16)
    conn.execute('INSERT INTO users (name, pwd_hash, salt, role, is_admin, active, display_name) '
                 'VALUES (?,?,?,?,0,1,?)', (name, hash_pwd(salt, pwd), salt, role, display_name))
    conn.commit()
    conn.close()
    audit_write(_admin, '用户', '新增用户', name, '用户名 ' + display_name + '；角色 ' + role + '；初始密码已设置')
    return jsonify({'ok': True, 'name': name})


@app.route('/api/users/<name>', methods=['PUT'])
@require_admin
def update_user(_admin, name):
    data = request.get_json(force=True, silent=True) or {}
    conn = get_db()
    row = conn.execute('SELECT role, display_name, active, is_admin FROM users WHERE name=?', (name,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    fields = []
    values = []
    if 'role' in data:
        fields.append('role=?'); values.append(str(data['role']).strip() or '工程师')
    if 'display_name' in data:
        dn = str(data['display_name']).strip()
        if not dn or len(dn) > 32:
            conn.close()
            return jsonify({'error': '用户名不能为空且不超过32字符'}), 400
        # 不改动用户名时放行（兼容工程师已从名单移除的存量账号）；改动则必须取自工程师名单
        if name != 'admin' and dn != (row['display_name'] or ''):
            if dn not in _engineer_names():
                conn.close()
                return jsonify({'error': '用户名必须是「基础配置 · 工程师名单」中的姓名，请先添加该工程师'}), 400
            if conn.execute('SELECT 1 FROM users WHERE display_name=? AND name<>?',
                            (dn, name)).fetchone():
                conn.close()
                return jsonify({'error': '「%s」已有登录账号，请直接编辑该账号' % dn}), 400
        fields.append('display_name=?'); values.append(dn)
    if 'active' in data:
        fields.append('active=?'); values.append(1 if data['active'] else 0)
    if 'is_admin' in data and name != 'admin':
        conn.close()
        return jsonify({'error': '系统只允许一个超级管理员（内置 admin），其他账号不能设置管理员标记'}), 400
    if data.get('pwd'):
        new_pwd = str(data['pwd'])
        err = validate_password(new_pwd, name)
        if err:
            conn.close()
            return jsonify({'error': err}), 400
        salt = secrets.token_hex(16)
        fields.append('salt=?'); values.append(salt)
        fields.append('pwd_hash=?'); values.append(hash_pwd(salt, new_pwd))
        # 管理员重置他人密码：下次登录强制改密；重置自己则保持当前会话不被踢
        fields.append('must_change_pwd=?'); values.append(0 if name == _admin else 1)
    # 禁止把自己降级为非管理员，避免把自己锁在门外
    if name == _admin and 'is_admin' in data and not data['is_admin']:
        conn.close()
        return jsonify({'error': '不能取消自己的管理员权限'}), 400
    if fields:
        values.append(name)
        conn.execute('UPDATE users SET ' + ','.join(fields) + ' WHERE name=?', values)
        if data.get('pwd'):
            # 密码被重置后旧会话立即失效（重置自己时保留当前会话）
            if name == _admin:
                conn.execute('DELETE FROM sessions WHERE name=? AND token<>?', (name, bearer_token() or ''))
            else:
                conn.execute('DELETE FROM sessions WHERE name=?', (name,))
        conn.commit()
    conn.close()
    changes = []
    if 'role' in data:
        new_role = str(data['role']).strip() or '工程师'
        if (row['role'] or '') != new_role:
            changes.append('角色 ' + (row['role'] or '未设置') + ' → ' + new_role)
    if 'display_name' in data:
        new_dn = str(data['display_name']).strip()
        if (row['display_name'] or '') != new_dn:
            changes.append('用户名 ' + (row['display_name'] or row['name']) + ' → ' + new_dn)
    if 'active' in data and bool(row['active']) != bool(data['active']):
        changes.append('账号状态 ' + ('启用' if row['active'] else '停用') + ' → ' + ('启用' if data['active'] else '停用'))
    if 'is_admin' in data and name != 'admin' and bool(row['is_admin']) != bool(data['is_admin']):
        changes.append('账号类型 ' + ('管理员' if row['is_admin'] else '普通用户') + ' → ' + ('管理员' if data['is_admin'] else '普通用户'))
    if data.get('pwd'):
        changes.append('已重置登录密码')
    audit_write(_admin, '用户', '修改用户', name, '；'.join(changes) if changes else '账号资料未发生变化')
    return jsonify({'ok': True})


@app.route('/api/users/<name>', methods=['DELETE'])
@require_admin
def delete_user(_admin, name):
    if name == _admin:
        return jsonify({'error': '不能删除自己'}), 400
    if name == 'admin':
        return jsonify({'error': '不能删除内置管理员账号'}), 400
    conn = get_db()
    conn.execute('DELETE FROM users WHERE name=?', (name,))
    conn.execute('DELETE FROM user_permissions WHERE user_name=?', (name,))
    conn.execute('DELETE FROM group_members WHERE user_name=?', (name,))
    conn.execute('DELETE FROM sessions WHERE name=?', (name,))
    conn.commit()
    conn.close()
    audit_write(_admin, '用户', '删除用户', name, '已清除该账号的菜单权限、用户组归属与登录状态')
    return jsonify({'ok': True})


@app.route('/api/users/<name>/permissions', methods=['PUT'])
@require_admin
def set_user_permissions(_admin, name):
    data = request.get_json(force=True, silent=True) or {}
    perms = data.get('permissions', [])
    if not isinstance(perms, list):
        return jsonify({'error': '权限格式不正确'}), 400
    perms = [p for p in perms if p in PERMISSION_KEYS]
    conn = get_db()
    if not conn.execute('SELECT 1 FROM users WHERE name=?', (name,)).fetchone():
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    old_perms = [r[0] for r in conn.execute('SELECT permission FROM user_permissions WHERE user_name=?', (name,)).fetchall()]
    conn.execute('DELETE FROM user_permissions WHERE user_name=?', (name,))
    conn.executemany('INSERT INTO user_permissions (user_name, permission) VALUES (?,?)',
                     [(name, p) for p in perms])
    conn.commit()
    conn.close()
    audit_write(_admin, '用户', '修改用户权限', name, perm_change_text(old_perms, perms))
    return jsonify({'ok': True, 'permissions': perms})


@app.route('/api/users/<name>/groups', methods=['PUT'])
@require_admin
def set_user_groups(_admin, name):
    data = request.get_json(force=True, silent=True) or {}
    gids = data.get('group_ids', [])
    if not isinstance(gids, list):
        return jsonify({'error': '用户组格式不正确'}), 400
    conn = get_db()
    if not conn.execute('SELECT 1 FROM users WHERE name=?', (name,)).fetchone():
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    old_gids = [r[0] for r in conn.execute('SELECT group_id FROM group_members WHERE user_name=?', (name,)).fetchall()]
    gmap = dict((r[0], r[1]) for r in conn.execute('SELECT id, name FROM user_groups').fetchall())
    old_names = [gmap[g] for g in old_gids if g in gmap]
    conn.execute('DELETE FROM group_members WHERE user_name=?', (name,))
    gids = [g for g in gids if g in gmap]
    conn.executemany('INSERT INTO group_members (group_id, user_name) VALUES (?,?)',
                     [(g, name) for g in gids])
    conn.commit()
    conn.close()
    new_names = [gmap[g] for g in gids if g in gmap]
    added = [n for n in new_names if n not in old_names]
    removed = [n for n in old_names if n not in new_names]
    detail = '所属用户组：' + ('、'.join(new_names) if new_names else '无')
    if added:
        detail += '；新增「' + '」「'.join(added) + '」'
    if removed:
        detail += '；移出「' + '」「'.join(removed) + '」'
    audit_write(_admin, '用户', '修改用户组', name, detail)
    return jsonify({'ok': True})


# ---------- 用户组 ----------
@app.route('/api/groups')
@require_admin
def list_groups(_admin):
    conn = get_db()
    groups = conn.execute('SELECT id, name, created_at FROM user_groups ORDER BY id').fetchall()
    perm_map = _group_permissions_map(conn)
    members_map = {}
    for r in conn.execute('SELECT group_id, user_name FROM group_members'):
        members_map.setdefault(r['group_id'], []).append(r['user_name'])
    out = []
    for g in groups:
        out.append({
            'id': g['id'], 'name': g['name'], 'created_at': g['created_at'],
            'permissions': sorted(perm_map.get(g['id'], [])),
            'members': members_map.get(g['id'], [])
        })
    conn.close()
    return jsonify({'groups': out})


@app.route('/api/groups', methods=['POST'])
@require_admin
def create_group(_admin):
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get('name', '')).strip()
    if not name:
        return jsonify({'error': '用户组名称不能为空'}), 400
    conn = get_db()
    if conn.execute('SELECT 1 FROM user_groups WHERE name=?', (name,)).fetchone():
        conn.close()
        return jsonify({'error': '用户组名称已存在'}), 400
    cur = conn.execute('INSERT INTO user_groups (name, created_at) VALUES (?,?)',
                       (name, time.strftime('%Y-%m-%dT%H:%M:%S')))
    conn.commit()
    gid = cur.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': gid})


@app.route('/api/groups/<int:gid>', methods=['PUT'])
@require_admin
def update_group(_admin, gid):
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get('name', '')).strip()
    if not name:
        return jsonify({'error': '用户组名称不能为空'}), 400
    conn = get_db()
    if conn.execute('SELECT 1 FROM user_groups WHERE name=? AND id<>?', (name, gid)).fetchone():
        conn.close()
        return jsonify({'error': '用户组名称已存在'}), 400
    conn.execute('UPDATE user_groups SET name=? WHERE id=?', (name, gid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/groups/<int:gid>', methods=['DELETE'])
@require_admin
def delete_group(_admin, gid):
    conn = get_db()
    conn.execute('DELETE FROM user_groups WHERE id=?', (gid,))
    conn.execute('DELETE FROM group_members WHERE group_id=?', (gid,))
    conn.execute('DELETE FROM group_permissions WHERE group_id=?', (gid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/groups/<int:gid>/permissions', methods=['PUT'])
@require_admin
def set_group_permissions(_admin, gid):
    data = request.get_json(force=True, silent=True) or {}
    perms = data.get('permissions', [])
    if not isinstance(perms, list):
        return jsonify({'error': '权限格式不正确'}), 400
    perms = [p for p in perms if p in PERMISSION_KEYS]
    conn = get_db()
    group = conn.execute('SELECT name FROM user_groups WHERE id=?', (gid,)).fetchone()
    if not group:
        conn.close()
        return jsonify({'error': '用户组不存在'}), 404
    old_perms = [r[0] for r in conn.execute('SELECT permission FROM group_permissions WHERE group_id=?', (gid,)).fetchall()]
    conn.execute('DELETE FROM group_permissions WHERE group_id=?', (gid,))
    conn.executemany('INSERT INTO group_permissions (group_id, permission) VALUES (?,?)',
                     [(gid, p) for p in perms])
    conn.commit()
    conn.close()
    audit_write(_admin, '用户', '修改用户组权限', group['name'], perm_change_text(old_perms, perms))
    return jsonify({'ok': True, 'permissions': perms})


@app.route('/api/groups/<int:gid>/members', methods=['PUT'])
@require_admin
def set_group_members(_admin, gid):
    data = request.get_json(force=True, silent=True) or {}
    members = data.get('members', [])
    if not isinstance(members, list):
        return jsonify({'error': '成员格式不正确'}), 400
    conn = get_db()
    valid = set(r[0] for r in conn.execute('SELECT name FROM users').fetchall())
    members = [m for m in members if m in valid]
    conn.execute('DELETE FROM group_members WHERE group_id=?', (gid,))
    conn.executemany('INSERT INTO group_members (group_id, user_name) VALUES (?,?)',
                     [(gid, m) for m in members])
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ---------- 审计日志接口 ----------
@app.route('/api/audit', methods=['POST'])
@require_auth
def post_audit(user):
    data = request.get_json(force=True, silent=True) or {}
    category = str(data.get('category') or '系统')
    if category not in AUDIT_CATEGORIES:
        category = '系统'
    # 审计写入也必须受权限约束，否则任意登录用户都能伪造“删除用户”等记录
    if not is_admin_user(user):
        allowed = AUDIT_CATEGORY_PERMS.get(category)
        # None=仅管理员；空元组=所有登录用户可写（页面访问）
        if allowed is None or (allowed and not set(effective_permissions(user)).intersection(allowed)):
            return jsonify({'error': '没有权限写入该类审计日志'}), 403
    action = str(data.get('action') or '').strip()[:100]
    if not action:
        return jsonify({'error': '缺少操作名称'}), 400
    target = str(data.get('target') or '')[:500]
    detail = str(data.get('detail') or '')[:2000]
    audit_write(user, category, action, target, detail)
    return jsonify({'ok': True})


@app.route('/api/audit')
@require_admin
def list_audit(_admin):
    from_date = str(request.args.get('from') or '').strip()
    to_date = str(request.args.get('to') or '').strip()
    who = str(request.args.get('user') or '').strip()
    category = str(request.args.get('category') or '').strip()
    keyword = str(request.args.get('q') or '').strip()
    try:
        page = max(1, int(request.args.get('page') or 1))
    except ValueError:
        page = 1
    try:
        size = min(5000, max(1, int(request.args.get('size') or 20)))
    except ValueError:
        size = 20

    where, params = [], []
    if from_date:
        where.append('substr(ts,1,10) >= ?'); params.append(from_date)
    if to_date:
        where.append('substr(ts,1,10) <= ?'); params.append(to_date)
    if who:
        where.append('user = ?'); params.append(who)
    if category:
        where.append('category = ?'); params.append(category)
    if keyword:
        where.append('(action LIKE ? OR target LIKE ? OR detail LIKE ?)')
        like = '%' + keyword + '%'
        params += [like, like, like]
    clause = (' WHERE ' + ' AND '.join(where)) if where else ''

    conn = get_db()
    total = conn.execute('SELECT COUNT(*) FROM audit_logs' + clause, params).fetchone()[0]
    rows = conn.execute('SELECT id, ts, user, category, action, target, detail, ip FROM audit_logs'
                        + clause + ' ORDER BY id DESC LIMIT ? OFFSET ?',
                        params + [size, (page - 1) * size]).fetchall()
    users = [r[0] for r in conn.execute(
        'SELECT DISTINCT user FROM audit_logs ORDER BY user').fetchall()]
    conn.close()
    return jsonify({'total': total, 'page': page, 'size': size, 'users': users,
                    'categories': AUDIT_CATEGORIES,
                    'items': [dict(r) for r in rows]})


# ---------- 桌面快捷方式：本机直接生成 .lnk，局域网其他电脑降级为下载 .url ----------

SHORTCUT_NAME = '东华大学多媒体教室运维系统'


def _ps_str(text):
    """PowerShell 单引号字符串转义。"""
    return "'" + str(text).replace("'", "''") + "'"


def _local_ips():
    """本机所有 IPv4 地址，用于判断请求是否来自服务器这台机器。"""
    ips = set()
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            ips.add(ip)
    except Exception:
        pass
    return ips


def _is_local_call():
    """判断请求是否来自服务器本机（含 127.0.0.1 与本机局域网 IP）。"""
    addr = (request.remote_addr or '').strip()
    if addr in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
        return True
    return addr in _local_ips()


def _shortcut_icon():
    """快捷方式图标：安装目录优先，其次静态资源目录。"""
    for p in (os.path.join(CONFIG_DIR, 'dhu-ops.ico'),
              os.path.join(ROOT, 'assets', 'dhu-ops.ico')):
        if os.path.exists(p):
            return p
    return ''


def _browser_exe():
    """返回可用的 Edge / Chrome 可执行文件路径，都没有返回空串。"""
    pf = os.environ.get('ProgramFiles', r'C:\Program Files')
    pf86 = os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')
    local = os.environ.get('LOCALAPPDATA', '')
    cands = [os.path.join(pf86, r'Microsoft\Edge\Application\msedge.exe'),
             os.path.join(pf, r'Microsoft\Edge\Application\msedge.exe'),
             os.path.join(local, r'Microsoft\Edge\Application\msedge.exe') if local else '',
             os.path.join(pf, r'Google\Chrome\Application\chrome.exe'),
             os.path.join(pf86, r'Google\Chrome\Application\chrome.exe')]
    for p in cands:
        if p and os.path.exists(p):
            return p
    return ''


def _writable_dir(path):
    """目录是否可写（用临时文件探针，避免依赖 ACL 解析）。"""
    if not os.path.isdir(path):
        return False
    probe = os.path.join(path, '.dhu_write_test')
    try:
        with open(probe, 'w') as f:
            f.write('x')
        os.remove(probe)
        return True
    except Exception:
        return False


def _desktop_dirs():
    """快捷方式候选目录：公共桌面优先（该机所有账户可见），其次当前进程用户桌面。"""
    out = [os.path.join(os.environ.get('PUBLIC') or r'C:\Users\Public', 'Desktop')]
    home = os.path.expanduser('~')
    # 服务以 SYSTEM 运行时 home 是 systemprofile，那不是真实桌面，跳过
    if home and 'systemprofile' not in home.lower():
        out.append(os.path.join(home, 'Desktop'))
    return out


def _make_desktop_shortcut():
    """创建指向本机服务的桌面快捷方式，成功返回 .lnk 路径，失败返回空串。"""
    if os.name != 'nt':
        return ''
    url = 'http://127.0.0.1:%d/' % PORT
    icon = _shortcut_icon()
    launcher = os.path.join(CONFIG_DIR, 'DHU-Ops-Launcher.exe')
    exe = '' if os.path.exists(launcher) else _browser_exe()
    if not os.path.exists(launcher) and not exe:
        return ''
    for desktop in _desktop_dirs():
        if not _writable_dir(desktop):
            continue
        lnk = os.path.join(desktop, SHORTCUT_NAME + '.lnk')
        lines = ['$ErrorActionPreference = "Stop"',
                 '$w = New-Object -ComObject WScript.Shell',
                 '$s = $w.CreateShortcut(%s)' % _ps_str(lnk)]
        if os.path.exists(launcher):
            # 指向启动器：双击时先确保服务在运行，再用应用窗口打开页面
            lines.append('$s.TargetPath = %s' % _ps_str(launcher))
            lines.append('$s.WorkingDirectory = %s' % _ps_str(CONFIG_DIR))
        else:
            lines.append('$s.TargetPath = %s' % _ps_str(exe))
            lines.append('$s.Arguments = %s' % _ps_str('--app=' + url))
        if icon:
            lines.append('$s.IconLocation = %s' % _ps_str(icon + ',0'))
        lines.append('$s.Description = %s' % _ps_str('双击直接打开 ' + SHORTCUT_NAME))
        lines.append('$s.Save()')
        # 用 EncodedCommand 传入，避免中文路径与引号转义问题
        enc = base64.b64encode('\r\n'.join(lines).encode('utf-16-le')).decode('ascii')
        try:
            subprocess.call(['powershell', '-NoProfile', '-NonInteractive',
                             '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=0x08000000)
        except Exception as e:
            print('shortcut fail:', e, file=sys.stderr)
            continue
        if os.path.exists(lnk):
            return lnk
    return ''


@app.route('/api/desktop/shortcut', methods=['POST'])
@require_auth
def desktop_shortcut(user):
    """本机：直接在公共桌面生成 .lnk；局域网其他电脑：返回降级标记，由前端下载 .url。"""
    if not _is_local_call():
        return jsonify({'ok': False, 'mode': 'download', 'reason': 'remote'})
    path = _make_desktop_shortcut()
    if not path:
        return jsonify({'ok': False, 'mode': 'download', 'reason': 'failed'})
    try:
        audit_write(user, '系统', '创建桌面快捷方式', path, '在公共桌面生成快捷方式')
    except Exception:
        pass
    return jsonify({'ok': True, 'mode': 'lnk', 'path': path})


# ---------- 统计报表（基于 mart 表，SQL 聚合） ----------

def _dt_minutes(start, end):
    """两个 ISO 时间串之间的分钟数，任一缺失返回 None。"""
    if not start or not end:
        return None
    try:
        import datetime
        a = datetime.datetime.fromisoformat(start)
        b = datetime.datetime.fromisoformat(end)
        if b < a:
            return None
        return int((b - a).total_seconds() / 60)
    except Exception:
        return None


def _ticket_base_where(from_date, to_date, stage):
    """构造 tickets_mart 基础过滤 WHERE 子句。"""
    where, params = [], []
    if from_date:
        where.append('substr(created_at,1,10) >= ?'); params.append(from_date)
    if to_date:
        where.append('substr(created_at,1,10) <= ?'); params.append(to_date)
    if stage == '__none__':
        where.append('(stage IS NULL OR stage = "")')
    elif stage:
        where.append('stage = ?'); params.append(stage)
    # 无条件时返回 WHERE 1=1，保证调用方统一用 clause + ' AND ...' 拼接不出语法错误
    clause = (' WHERE ' + ' AND '.join(where)) if where else ' WHERE 1=1'
    return clause, params


@app.route('/api/report/summary')
@require_auth
@require_perm('reports')
def report_summary(_user):
    """核心汇总：总量、状态分布、故障 TOP、楼栋、工程师工作量、时效指标。"""
    from_date = str(request.args.get('from') or '').strip()
    to_date = str(request.args.get('to') or '').strip()
    stage = str(request.args.get('stage') or '').strip()
    clause, params = _ticket_base_where(from_date, to_date, stage)

    conn = get_db()
    # 基础计数
    total = conn.execute('SELECT COUNT(*) FROM tickets_mart' + clause, params).fetchone()[0]
    by_status = dict((k, 0) for k in ['new', 'assigned', 'processing', 'waiting', 'resolved', 'closed', 'cancelled'])
    for r in conn.execute('SELECT status, COUNT(*) FROM tickets_mart' + clause + ' GROUP BY status', params):
        if r[0] in by_status:
            by_status[r[0]] = r[1]

    # 故障 TOP
    type_list = [dict(r) for r in conn.execute(
        'SELECT fault AS name, COUNT(*) AS count FROM tickets_mart' + clause +
        ' AND fault IS NOT NULL AND fault != "" GROUP BY fault ORDER BY count DESC LIMIT 20', params)]

    # 楼栋分布
    building_list = [dict(r) for r in conn.execute(
        'SELECT building AS name, COUNT(*) AS count FROM tickets_mart' + clause +
        ' AND building IS NOT NULL AND building != "" GROUP BY building ORDER BY count DESC', params)]

    # TOP 教室
    room_list = [dict(r) for r in conn.execute(
        'SELECT room AS name, COUNT(*) AS count FROM tickets_mart' + clause +
        ' AND room IS NOT NULL AND room != "" GROUP BY room ORDER BY count DESC LIMIT 10', params)]

    # 紧急度
    by_urg = dict((r[0], r[1]) for r in conn.execute(
        'SELECT urgency, COUNT(*) FROM tickets_mart' + clause +
        ' AND urgency IS NOT NULL AND urgency != "" GROUP BY urgency', params))

    # 时效指标（需全量拉取在 Python 里算：SQLite 对时间差处理比较麻烦）
    rows = conn.execute(
        'SELECT created_at, assigned_at, accepted_at, arrived_at, resolved_at, closed_at, '
        'assignee, urgency, status, satisfaction FROM tickets_mart' + clause, params).fetchall()

    import datetime as _dt
    def _avg(vals):
        return round(sum(vals) / len(vals), 1) if vals else None

    dispatch, arrive, handle, close, sats, sla_ok, sla_base = [], [], [], [], [], 0, 0
    by_eng = {}
    for r in rows:
        dm = _dt_minutes(r['created_at'], r['assigned_at'])
        if dm is not None: dispatch.append(dm)
        am = _dt_minutes(r['created_at'], r['arrived_at'])
        if am is not None: arrive.append(am)
        hm = _dt_minutes(r['arrived_at'], r['resolved_at'])
        if hm is not None: handle.append(hm)
        cm = _dt_minutes(r['created_at'], r['closed_at'])
        if cm is not None and r['status'] == 'closed': close.append(cm)
        if r['satisfaction'] and r['satisfaction'] > 0: sats.append(r['satisfaction'])
        # SLA
        if r['arrived_at']:
            sla_base += 1
            limit = {'紧急': 120, '常规': 480, '低': 1440}.get(r['urgency'] or '常规', 480)
            if am is not None and am <= limit: sla_ok += 1
        # 工程师
        eng = r['assignee']
        if eng:
            e = by_eng.get(eng)
            if e is None:
                e = {'name': eng, 'total': 0, 'resolved': 0, 'closed': 0, 'handle': [], 'sat': []}
                by_eng[eng] = e
            e['total'] += 1
            if r['status'] in ('resolved', 'closed'): e['resolved'] += 1
            if r['status'] == 'closed': e['closed'] += 1
            if hm is not None: e['handle'].append(hm)
            if r['satisfaction'] and r['satisfaction'] > 0: e['sat'].append(r['satisfaction'])

    engineers = []
    for eng, e in sorted(by_eng.items(), key=lambda kv: -kv[1]['total']):
        sat_avg = round(sum(e['sat']) / len(e['sat']), 1) if e['sat'] else None
        engineers.append({
            'name': e['name'], 'total': e['total'], 'resolved': e['resolved'], 'closed': e['closed'],
            'handleAvg': _avg(e['handle']), 'sat': sat_avg
        })

    conn.close()
    urgent = by_urg.get('紧急', 0)
    return jsonify({
        'total': total,
        'byStatus': by_status,
        'closed': by_status.get('closed', 0),
        'open': total - by_status.get('closed', 0) - by_status.get('cancelled', 0),
        'cancelled': by_status.get('cancelled', 0),
        'urgent': urgent,
        'byUrg': by_urg,
        'typeList': type_list,
        'buildingList': building_list,
        'roomList': room_list,
        'avgDispatch': _avg(dispatch),
        'avgArrive': _avg(arrive),
        'avgHandle': _avg(handle),
        'avgClose': _avg(close),
        'satisfaction': round(sum(sats) / len(sats), 2) if sats else None,
        'slaRate': round(sla_ok / sla_base * 100, 1) if sla_base else None,
        'engineers': engineers,
        'days': None  # 前端自己算
    })


@app.route('/api/report/trend')
@require_auth
@require_perm('reports')
def report_trend(_user):
    """逐日 / 逐周 / 逐月工单量。"""
    from_date = str(request.args.get('from') or '').strip()
    to_date = str(request.args.get('to') or '').strip()
    stage = str(request.args.get('stage') or '').strip()
    group = str(request.args.get('group') or 'day').strip() or 'day'

    clause, params = _ticket_base_where(from_date, to_date, stage)
    conn = get_db()

    if group == 'day':
        rows = conn.execute(
            'SELECT substr(created_at,1,10) AS label, COUNT(*) AS value FROM tickets_mart' +
            clause + ' GROUP BY substr(created_at,1,10) ORDER BY label', params).fetchall()
    elif group == 'week':
        # SQLite ISO 周计算：strftime('%Y-W%W', created_at)
        rows = conn.execute(
            "SELECT strftime('%Y-W%W', created_at) AS label, COUNT(*) AS value FROM tickets_mart" +
            clause + " GROUP BY strftime('%Y-W%W', created_at) ORDER BY label", params).fetchall()
    else:  # month
        rows = conn.execute(
            "SELECT strftime('%Y-%m', created_at) AS label, COUNT(*) AS value FROM tickets_mart" +
            clause + " GROUP BY strftime('%Y-%m', created_at) ORDER BY label", params).fetchall()

    conn.close()
    return jsonify({'group': group, 'series': [dict(r) for r in rows]})


@app.route('/api/report/patrol')
@require_auth
@require_perm('reports')
def report_patrol(_user):
    """巡视统计：完成率、异常 TOP、参与人、异常 vs 工单关联。"""
    from_date = str(request.args.get('from') or '').strip()
    to_date = str(request.args.get('to') or '').strip()

    where, params = [], []
    if from_date:
        where.append('date >= ?'); params.append(from_date)
    if to_date:
        where.append('date <= ?'); params.append(to_date)
    clause = (' WHERE ' + ' AND '.join(where)) if where else ' WHERE 1=1'

    conn = get_db()
    total = conn.execute('SELECT COUNT(*) FROM patrols_mart' + clause, params).fetchone()[0]
    by_status = dict((r[0], r[1]) for r in conn.execute(
        'SELECT status, COUNT(*) FROM patrols_mart' + clause + ' GROUP BY status', params))

    # 按日期统计（含完成/异常数）
    daily = [dict(r) for r in conn.execute(
        'SELECT date AS label, COUNT(*) AS total, '
        'SUM(CASE WHEN status="done" THEN 1 ELSE 0 END) AS done, '
        'SUM(CASE WHEN fail_count > 0 THEN 1 ELSE 0 END) AS has_abnormal, '
        'SUM(fail_count) AS fail_total '
        'FROM patrols_mart' + clause + ' GROUP BY date ORDER BY date', params)]

    # 参与人工作量
    by_person = [dict(r) for r in conn.execute(
        'SELECT by AS name, COUNT(*) AS done_count, '
        'SUM(fail_count) AS fail_found '
        'FROM patrols_mart' + clause + ' AND status="done" AND by IS NOT NULL AND by != "" '
        'GROUP BY by ORDER BY done_count DESC', params)]

    # 异常总览
    abnormal_rows = conn.execute(
        'SELECT date, period, name, assignee, by, fail_count, abnormal FROM patrols_mart' +
        clause + ' AND (fail_count > 0 OR (abnormal IS NOT NULL AND abnormal != "")) '
        'ORDER BY date DESC LIMIT 50', params).fetchall()

    # 关联工单数：巡视记录有异常字段、或有 repair_no 的
    # 注意：OR 条件必须整体加括号，否则会绕过前面的日期/楼栋过滤
    linked = conn.execute(
        'SELECT COUNT(*) FROM patrols_mart' + clause +
        ' AND ((abnormal IS NOT NULL AND abnormal != "") OR (log_no IS NOT NULL AND log_no != "") '
        '   OR (repair_no IS NOT NULL AND repair_no != ""))', params).fetchone()[0]

    conn.close()
    done = by_status.get('done', 0)
    miss = by_status.get('missed', 0)
    pending = by_status.get('pending', 0)
    completion_rate = round(done / total * 100, 1) if total else None
    return jsonify({
        'total': total, 'done': done, 'missed': miss, 'pending': pending,
        'completionRate': completion_rate,
        'daily': daily,
        'byPerson': by_person,
        'abnormal': [dict(r) for r in abnormal_rows],
        'linkedTickets': linked
    })


@app.route('/api/report/device/summary')
@require_auth
@require_perm('reports')
def report_device_summary(_user):
    """设备台账概览：状态分布、保修预警、按类别。"""
    conn = get_db()
    total = conn.execute('SELECT COUNT(*) FROM devices_mart').fetchone()[0]
    by_status = dict((r[0], r[1]) for r in conn.execute(
        'SELECT status, COUNT(*) FROM devices_mart WHERE status IS NOT NULL AND status != "" GROUP BY status'))
    by_category = [dict(r) for r in conn.execute(
        'SELECT category AS name, COUNT(*) AS count FROM devices_mart'
        ' WHERE category IS NOT NULL AND category != "" GROUP BY category ORDER BY count DESC')]
    by_room = [dict(r) for r in conn.execute(
        'SELECT room AS name, COUNT(*) AS count FROM devices_mart'
        ' WHERE room IS NOT NULL AND room != "" GROUP BY room ORDER BY count DESC LIMIT 15')]
    by_building = [dict(r) for r in conn.execute(
        'SELECT building AS name, COUNT(*) AS count FROM devices_mart'
        ' WHERE building IS NOT NULL AND building != "" GROUP BY building ORDER BY count DESC')]

    # 保修状态统计（now vs warranty_to）
    today = time.strftime('%Y-%m-%d')
    soon_limit = time.strftime('%Y-%m-%d', time.localtime(time.time() + 90 * 86400))
    warranty = dict((r[0], r[1]) for r in conn.execute(
        "SELECT CASE "
        " WHEN warranty_to IS NULL OR warranty_to = '' THEN '未登记' "
        " WHEN warranty_to < ? THEN '已过保' "
        " WHEN warranty_to <= ? THEN '90天内到期' "
        " ELSE '在保' END AS level, COUNT(*) "
        "FROM devices_mart GROUP BY level", (today, soon_limit)))

    repairing_rooms = [dict(r) for r in conn.execute(
        "SELECT room AS name, COUNT(*) AS count FROM devices_mart WHERE status = '维修中' "
        "GROUP BY room ORDER BY count DESC")]

    conn.close()
    return jsonify({
        'total': total,
        'byStatus': by_status,
        'byCategory': by_category,
        'byRoom': by_room,
        'byBuilding': by_building,
        'warranty': warranty,
        'repairingRooms': repairing_rooms,
        'soonLimit': soon_limit,
        'today': today
    })


@app.route('/api/report/device/warranty')
@require_auth
@require_perm('reports')
def report_device_warranty(_user):
    """保修预警列表（按到期时间升序）。"""
    limit = int(request.args.get('limit') or 50)
    limit = min(200, max(1, limit))
    days = int(request.args.get('days') or 90)
    conn = get_db()
    rows = conn.execute(
        "SELECT id, name, category, brand, sn, room, building, warranty_to, status "
        "FROM devices_mart "
        "WHERE warranty_to IS NOT NULL AND warranty_to != '' AND status != '报废' "
        "AND warranty_to <= ? "
        "ORDER BY warranty_to ASC LIMIT ?",
        (time.strftime('%Y-%m-%d', time.localtime(time.time() + days * 86400)), limit)).fetchall()
    conn.close()
    return jsonify({'limitDays': days, 'items': [dict(r) for r in rows]})


@app.route('/api/report/compare')
@require_auth
@require_perm('reports')
def report_compare(_user):
    """两个时间段的关键指标对比。from/to 为主区间，from2/to2 为对比区间（可选）。"""
    from1 = str(request.args.get('from') or '').strip()
    to1 = str(request.args.get('to') or '').strip()
    from2 = str(request.args.get('from2') or '').strip()
    to2 = str(request.args.get('to2') or '').strip()
    stage = str(request.args.get('stage') or '').strip()
    if not (from2 and to2):
        # 自动推断上一个等长区间
        try:
            import datetime as _dt
            d1 = _dt.date.fromisoformat(from1)
            d2 = _dt.date.fromisoformat(to1)
            span = (d2 - d1).days
            to2d = d1 - _dt.timedelta(days=1)
            from2d = to2d - _dt.timedelta(days=span)
            from2, to2 = from2d.isoformat(), to2d.isoformat()
        except Exception:
            return jsonify({'error': '缺少对比区间'}), 400

    def _fetch_summary(f, t):
        conn = get_db()
        clause, params = _ticket_base_where(f, t, stage)
        total = conn.execute('SELECT COUNT(*) FROM tickets_mart' + clause, params).fetchone()[0]
        closed = conn.execute("SELECT COUNT(*) FROM tickets_mart" + clause + " AND status='closed'", params).fetchone()[0]
        conn.close()
        return {'total': total, 'closed': closed, 'days': None}

    # 复用 summary API 的核心指标（简化版）
    def _full(f, t):
        conn = get_db()
        clause, params = _ticket_base_where(f, t, stage)
        rows = conn.execute(
            'SELECT created_at, assigned_at, accepted_at, arrived_at, resolved_at, closed_at, '
            'urgency, status, satisfaction FROM tickets_mart' + clause, params).fetchall()
        import datetime as _dt
        def _avg(v): return round(sum(v) / len(v), 1) if v else None
        dispatch, arrive, handle, sats, sla_ok, sla_base = [], [], [], [], 0, 0
        for r in rows:
            dm = _dt_minutes(r['created_at'], r['assigned_at'])
            if dm is not None: dispatch.append(dm)
            am = _dt_minutes(r['created_at'], r['arrived_at'])
            if am is not None: arrive.append(am)
            hm = _dt_minutes(r['arrived_at'], r['resolved_at'])
            if hm is not None: handle.append(hm)
            if r['satisfaction'] and r['satisfaction'] > 0: sats.append(r['satisfaction'])
            if r['arrived_at']:
                sla_base += 1
                limit = {'紧急': 120, '常规': 480, '低': 1440}.get(r['urgency'] or '常规', 480)
                if am is not None and am <= limit: sla_ok += 1
        # 巡视完成率
        p_where, p_params = [], []
        if f: p_where.append('date >= ?'); p_params.append(f)
        if t: p_where.append('date <= ?'); p_params.append(t)
        p_clause = (' WHERE ' + ' AND '.join(p_where)) if p_where else ' WHERE 1=1'
        p_total = conn.execute('SELECT COUNT(*) FROM patrols_mart' + p_clause, p_params).fetchone()[0]
        p_done = conn.execute("SELECT COUNT(*) FROM patrols_mart" + p_clause + " AND status='done'", p_params).fetchone()[0]
        conn.close()
        return {
            'total': len(rows),
            'closed': sum(1 for r in rows if r['status'] == 'closed'),
            'open': sum(1 for r in rows if r['status'] in ('new', 'assigned', 'processing', 'waiting')),
            'avgArrive': _avg(arrive),
            'avgHandle': _avg(handle),
            'slaRate': round(sla_ok / sla_base * 100, 1) if sla_base else None,
            'satisfaction': round(sum(sats) / len(sats), 2) if sats else None,
            'patrolTotal': p_total, 'patrolDone': p_done,
            'patrolRate': round(p_done / p_total * 100, 1) if p_total else None
        }

    s1 = _full(from1, to1)
    s2 = _full(from2, to2)
    def _delta(a, b):
        """返回对比文本：上升 x% / 下降 x% / 持平"""
        if a is None and b is None: return ''
        if b is None or b == 0: return ''
        if a is None: return ''
        diff = a - b
        pct = round(diff / b * 100, 1)
        if diff == 0: return '持平'
        return ('上升' if diff > 0 else '下降') + str(abs(pct)) + '%'

    return jsonify({
        'primary': {'from': from1, 'to': to1, **s1},
        'compare': {'from': from2, 'to': to2, **s2},
        'deltas': {
            'total': _delta(s1['total'], s2['total']),
            'closed': _delta(s1['closed'], s2['closed']),
            'open': _delta(s1['open'], s2['open']),
            'avgArrive': _delta(s1['avgArrive'], s2['avgArrive']),
            'avgHandle': _delta(s1['avgHandle'], s2['avgHandle']),
            'slaRate': _delta(s1['slaRate'], s2['slaRate']),
            'satisfaction': _delta(s1['satisfaction'], s2['satisfaction']),
            'patrolRate': _delta(s1['patrolRate'], s2['patrolRate']),
        }
    })


@app.errorhandler(401)
def unauthorized(_):
    return jsonify({'error': '未登录或会话已过期'}), 401


if __name__ == '__main__':
    # PyInstaller --noconsole 模式下 stdout/stderr 为 None，需兜底避免 print/werkzeug 日志崩溃
    # 打包模式下 stderr 重定向到日志文件，便于排查启动崩溃；stdout 丢弃（werkzeug 访问日志量大）
    if getattr(sys, 'frozen', False):
        if sys.stdout is None:
            sys.stdout = open(os.devnull, 'w')
        # 日志路径回退：数据目录 → 程序目录 → TEMP，确保总有地方可写
        _log_candidates = [
            os.path.join(os.path.dirname(DB), 'server.err.log'),
            os.path.join(CONFIG_DIR, 'server.err.log'),
            os.path.join(os.environ.get('TEMP', os.path.dirname(DB)), 'server.err.log'),
        ]
        _log_ok = False
        for _log_path in _log_candidates:
            try:
                os.makedirs(os.path.dirname(_log_path), exist_ok=True)
                sys.stderr = open(_log_path, 'a', encoding='utf-8')
                sys.stderr.write('\n===== server start %s (log: %s) =====\n' % (
                    time.strftime('%Y-%m-%d %H:%M:%S'), _log_path))
                sys.stderr.flush()
                _log_ok = True
                break
            except Exception:
                continue
        if not _log_ok and sys.stderr is None:
            sys.stderr = open(os.devnull, 'w')
    else:
        if sys.stdout is None:
            sys.stdout = open(os.devnull, 'w')
        if sys.stderr is None:
            sys.stderr = open(os.devnull, 'w')
    init_db()
    # 离线兜底：忘记管理员密码时在服务器上执行 `server.exe --reset-admin`，
    # 生成新的随机初始密码并写回数据目录的一次性文件，不依赖任何在线服务。
    if '--reset-admin' in sys.argv:
        new_pwd = os.environ.get('DHU_OPS_INITIAL_ADMIN_PWD') or generate_initial_password()
        salt = secrets.token_hex(16)
        conn = get_db()
        conn.execute("UPDATE users SET pwd_hash=?, salt=?, must_change_pwd=1, active=1 WHERE name='admin'",
                     (hash_pwd(salt, new_pwd), salt))
        conn.execute("DELETE FROM sessions WHERE name='admin'")
        conn.commit()
        conn.close()
        path = _write_initial_password(new_pwd)
        print('[reset-admin] 管理员密码已重置，新初始密码：%s' % path)
        sys.exit(0)
    # 启动时把 state JSON blob 里的存量数据回填到 mart 表（幂等）
    backfilled = mart_backfill()
    if backfilled:
        print('[mart] 已从 state JSON 回填数据仓库表')
    print('东华大学多媒体教室运维系统 · 监听 %s:%d' % (HOST, PORT))
    print('本机访问：http://127.0.0.1:%d' % PORT)
    if HOST == '0.0.0.0':
        print('局域网访问：已开启（安装时勾选或 access.txt=lan）')
    else:
        print('局域网访问：未开启；如需同事访问，请在安装时勾选「允许局域网访问」')
    print('数据库：%s' % DB)
    app.run(host=HOST, port=PORT, threaded=True)
