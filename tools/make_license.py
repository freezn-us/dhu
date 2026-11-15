"""厂商授权签发工具（私有工具，勿随安装包分发）

用法：
  python tools/make_license.py --org "东华大学" --machine A1B2-C3D4-E5F6-7890 --days 365
  python tools/make_license.py --org "东华大学" --machine A1B2-... --expires 2027-12-31 --users 80 --edition 标准版

生成 license.json 后，发给客户在「基础配置 → 授权信息」中导入即可。
"""
import argparse
import base64
import datetime
import json
import os
import sys

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

HERE = os.path.dirname(os.path.abspath(__file__))
# 厂商私钥已移出项目目录，存放于项目同级的 dhu-keys\（避免随项目打包/分发而泄露）。
# 换机器时把 dhu-keys\ 一并拷到相同相对位置，或用环境变量 DHU_KEYS_DIR 指定绝对路径。
KEYS_DIR = os.environ.get('DHU_KEYS_DIR') or os.path.normpath(os.path.join(HERE, '..', '..', 'dhu-keys'))
PRIV = os.path.join(KEYS_DIR, 'license_private.pem')


def main():
    ap = argparse.ArgumentParser(description='签发东华运维系统授权文件')
    ap.add_argument('--org', required=True, help='授权单位名称')
    ap.add_argument('--machine', required=True, help='客户提供的机器码，如 A1B2-C3D4-E5F6-7890')
    ap.add_argument('--days', type=int, default=365, help='有效天数（与 --expires 二选一）')
    ap.add_argument('--expires', default='', help='到期日 YYYY-MM-DD，优先于 --days')
    ap.add_argument('--users', type=int, default=50, help='最大用户数')
    ap.add_argument('--edition', default='标准版', help='版本名称')
    ap.add_argument('--out', default='license.json', help='输出文件名')
    a = ap.parse_args()

    if not os.path.exists(PRIV):
        print('找不到私钥 %s' % PRIV, file=sys.stderr)
        print('私钥已移出项目目录，存放于 dhu-keys\\license_private.pem；', file=sys.stderr)
        print('请确认该目录存在，或用环境变量 DHU_KEYS_DIR 指定其绝对路径。', file=sys.stderr)
        return 2

    today = datetime.date.today()
    expires = a.expires or (today + datetime.timedelta(days=a.days)).isoformat()
    if not a.expires:
        expires = (today + datetime.timedelta(days=a.days)).isoformat()

    payload = {
        'v': 1,
        'trial': False,
        'org': a.org,
        'edition': a.edition,
        'issued': today.isoformat(),
        'expires': expires,
        'machine': a.machine.strip().upper(),
        'max_users': a.users,
        'modules': ['all'],
    }
    data = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    with open(PRIV, 'rb') as f:
        key = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())
    sig = base64.b64encode(key.sign(data, padding.PKCS1v15(), hashes.SHA256())).decode('ascii')
    rec = dict(payload)
    rec['sig'] = sig
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(rec, f, ensure_ascii=False, indent=2)
    print('已生成授权：%s' % os.path.abspath(a.out))
    print('  授权单位：%s' % a.org)
    print('  版本：%s · 用户数：%d' % (a.edition, a.users))
    print('  机器码：%s' % rec['machine'])
    print('  有效期：%s ~ %s' % (rec['issued'], rec['expires']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
