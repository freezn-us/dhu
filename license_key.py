"""授权（License）校验模块

设计要点：
  1. 正式授权由厂商用 RSA 私钥签发（私钥只在 tools/license_private.pem，不进安装包），
     客户端内嵌公钥校验，改任意字段都会导致签名失效。
  2. 授权文件与机器码绑定，换机器需重新签发。
  3. 无授权文件时自动生成 30 天试用授权（本地 HMAC 保护，防误改）。
  4. 到期后 7 天为宽限期（只读），超过宽限期禁止登录。
"""
import base64
import hashlib
import json
import os
import platform
import sys
import uuid
import datetime

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2t5webmZaeVpQhJ/RHC3
uNzzfXm8dDT7MZ3bGARzvgHk2NKVXjFlf4zX8ITZMrC4Yfq1+iXht0PWhghroPaS
Q1snYhrIBHF4frdS9wbP8n+hlcJCgu+c59i1ci0Q7hzsQ0r33Mg+5kX4v+VNEHx5
Yj31Xa8dG4YUrf1REpeaSc73r7Bxw+oXyUna8OPVDGmqlACqxkGwYBv6t75lb83w
AwIOgefHEKl3/HewQV+x902Z9IfV/sz4hdkoYmtSgH2YGXqnjnhxb2zWZJ08kylz
AMU5qyv1l7Q3ok5IQ+au739G5LB2+0MK9cbKaI+22+gtWWD9B9OelZLcvt1zw6kl
mwIDAQAB
-----END PUBLIC KEY-----
"""

TRIAL_DAYS = 30
GRACE_DAYS = 7


def _today():
    return datetime.date.today()


def _parse_date(s):
    try:
        return datetime.date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
    except Exception:
        return None


def machine_code():
    """机器指纹：Windows MachineGuid + 网卡 MAC，取 16 位十六进制，形如 A1B2-C3D4-E5F6-7890。"""
    parts = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                            r'SOFTWARE\Microsoft\Cryptography', 0,
                            winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
            parts.append(str(winreg.QueryValueEx(k, 'MachineGuid')[0]))
    except Exception:
        pass
    parts.append(str(uuid.getnode()))
    parts.append(platform.node())
    h = hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest().upper()[:16]
    return '-'.join(h[i:i + 4] for i in range(0, 16, 4))


def _canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def _verify_rsa(payload, sig_b64):
    try:
        pub = serialization.load_pem_public_key(PUBLIC_KEY_PEM, backend=default_backend())
        pub.verify(base64.b64decode(sig_b64), _canonical(payload),
                   padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False


def _trial_key():
    return hashlib.sha256(('DHU-Ops-Trial-v1|' + machine_code()).encode('utf-8')).digest()


def _trial_sig(payload):
    import hmac
    return base64.b64encode(hmac.new(_trial_key(), _canonical(payload), hashlib.sha256).digest()).decode('ascii')


def _verify_trial(payload, sig_b64):
    try:
        return _trial_sig(payload) == sig_b64
    except Exception:
        return False


_RESOLVED_DIR = {}


def _dir(base_dir):
    """授权文件目录；若程序目录不可写（如 ProgramData 权限受限），回落到用户目录。"""
    if base_dir in _RESOLVED_DIR:
        return _RESOLVED_DIR[base_dir]
    d = base_dir
    try:
        os.makedirs(d, exist_ok=True)
        t = os.path.join(d, '.wtest')
        with open(t, 'w') as f:
            f.write('1')
        os.remove(t)
    except Exception:
        d = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'DHU-Ops')
        try:
            os.makedirs(d, exist_ok=True)
        except Exception:
            pass
    _RESOLVED_DIR[base_dir] = d
    return d


def _license_path(base_dir):
    return os.path.join(base_dir, 'license.json')


def _state_path(base_dir):
    return os.path.join(base_dir, 'license.state')


def _read_last_seen(base_dir):
    try:
        with open(_state_path(base_dir), 'r', encoding='utf-8') as f:
            return float(json.load(f).get('last_seen') or 0)
    except Exception:
        return 0.0


def _write_last_seen(base_dir, ts):
    try:
        with open(_state_path(base_dir), 'w', encoding='utf-8') as f:
            json.dump({'last_seen': ts}, f)
    except Exception:
        pass


def _make_trial(base_dir):
    """首次运行生成 30 天试用授权。"""
    issued = _today()
    payload = {
        'v': 1,
        'trial': True,
        'org': '东华大学信息中心',
        'edition': '标准版',
        'issued': issued.isoformat(),
        'expires': (issued + datetime.timedelta(days=TRIAL_DAYS)).isoformat(),
        'machine': machine_code(),
        'max_users': 50,
        'modules': ['all'],
    }
    rec = dict(payload)
    rec['sig'] = _trial_sig(payload)
    try:
        with open(_license_path(base_dir), 'w', encoding='utf-8') as f:
            json.dump(rec, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return rec


def _read_file(base_dir):
    p = _license_path(base_dir)
    if not os.path.exists(p):
        return None
    try:
        with open(p, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _blank_status():
    return {
        'state': 'invalid',
        'org': '',
        'edition': '',
        'issued': '',
        'expires': '',
        'max_users': 0,
        'modules': [],
        'trial': False,
        'machine': machine_code(),
        'days_left': 0,
        'reason': '',
    }


def load_status(base_dir, allow_trial=None):
    """读取并校验授权，返回状态字典（同时做防改时间的最后运行时间记录）。

    allow_trial=False 时不会自动生成试用授权（打包版默认如此，避免删除
    license.json 后重新获得 30 天）；源码运行/测试仍可显式打开。
    """
    base_dir = _dir(base_dir)
    rec = _read_file(base_dir)
    if not rec:
        if allow_trial is None:
            allow_trial = (not getattr(sys, 'frozen', False)
                            and os.environ.get('DHU_OPS_ALLOW_TRIAL', '1') != '0')
        if not allow_trial:
            status = _blank_status()
            status['reason'] = '未找到授权文件，请导入正式授权或使用带通用授权的安装包'
            return status
        rec = _make_trial(base_dir)

    status = _blank_status()
    status.update({
        'org': rec.get('org') or '',
        'edition': rec.get('edition') or '',
        'issued': rec.get('issued') or '',
        'expires': rec.get('expires') or '',
        'max_users': rec.get('max_users') or 0,
        'modules': rec.get('modules') or [],
        'trial': bool(rec.get('trial')),
    })

    payload = {k: v for k, v in rec.items() if k != 'sig'}
    sig = rec.get('sig') or ''
    ok = _verify_trial(payload, sig) if payload.get('trial') else _verify_rsa(payload, sig)
    if not ok:
        status['state'] = 'invalid'
        status['reason'] = '授权文件签名校验失败，请联系厂商重新签发'
        return status

    lic_machine = (payload.get('machine') or '').strip()
    # "*" 表示通用授权：不绑定机器，但到期日固定，换机/重装都不会续期。
    if lic_machine and lic_machine != '*' and lic_machine != status['machine']:
        status['state'] = 'invalid'
        status['reason'] = '授权文件与本机机器码不匹配，请提供机器码重新签发'
        return status

    exp = _parse_date(status['expires'])
    if not exp:
        status['state'] = 'invalid'
        status['reason'] = '授权到期日格式错误'
        return status

    today = _today()
    days_left = (exp - today).days
    status['days_left'] = days_left

    # 防系统时间回拨：若当前时间明显早于上次运行时间，判定异常
    import time
    last_seen = _read_last_seen(base_dir)
    now_ts = time.time()
    if last_seen and now_ts < last_seen - 86400:
        status['state'] = 'invalid'
        status['reason'] = '检测到系统时间被回拨，请校正系统时间后重试'
        return status
    _write_last_seen(base_dir, now_ts)

    if days_left >= 0:
        status['state'] = 'trial' if payload.get('trial') else 'valid'
    elif abs(days_left) <= GRACE_DAYS:
        status['state'] = 'grace'
        status['reason'] = '授权已到期，处于 %d 天宽限期（只读）' % (GRACE_DAYS - abs(days_left))
    else:
        status['state'] = 'expired'
        status['reason'] = '授权已过期，系统已停止服务'

    # trial 状态不向前端暴露"试用"字样：隐藏 org/edition 里的"试用版"标识
    if status['state'] == 'trial':
        if '试用' in (status.get('org') or ''):
            status['org'] = '东华大学信息中心'
        if '试用' in (status.get('edition') or ''):
            status['edition'] = '标准版'

    return status


def import_license(base_dir, text):
    """导入正式授权文本，校验通过后落盘。返回 (ok, message_or_status)。"""
    base_dir = _dir(base_dir)
    try:
        rec = json.loads(text)
    except Exception:
        return False, '授权内容不是合法的 JSON'
    payload = {k: v for k, v in rec.items() if k != 'sig'}
    if payload.get('trial'):
        return False, '试用授权不需要手工导入'
    if not _verify_rsa(payload, rec.get('sig') or ''):
        return False, '签名校验失败：这不是本系统签发的授权文件'
    lic_machine = (payload.get('machine') or '').strip()
    if lic_machine != '*' and lic_machine != machine_code():
        return False, '机器码不匹配：授权文件绑定的机器码是 %s，本机是 %s' % (payload.get('machine'), machine_code())
    exp = _parse_date(payload.get('expires') or '')
    if not exp or exp < _today():
        return False, '授权已过期（%s），请签发新的授权' % (payload.get('expires') or '')
    try:
        with open(_license_path(base_dir), 'w', encoding='utf-8') as f:
            json.dump(rec, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return False, '写入授权文件失败：%s' % e
    return True, load_status(base_dir)


def can_write(status):
    """宽限期只读：仅 valid / trial 允许写入。"""
    return status.get('state') in ('valid', 'trial')


def can_login(status):
    return status.get('state') != 'expired'
