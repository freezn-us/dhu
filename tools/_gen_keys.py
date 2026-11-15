"""一次性：生成 License 签名密钥对（私钥写入项目同级 dhu-keys\\，公钥内嵌到 license_key.py）

警告：重新生成密钥会使**所有已签发的授权文件立即失效**（客户端内嵌的是旧公钥），
      且需要同步替换 license_key.py 中的 PUBLIC_KEY_PEM 并重新打包发布。
      因此本脚本默认拒绝执行，仅在显式确认时才运行。
"""
import os
import sys

CONFIRM_FLAG = 'DHU_GEN_KEYS_CONFIRM'

if os.environ.get(CONFIRM_FLAG) != 'yes':
    sys.stderr.write(
        '已阻止：生成新密钥对会使所有已签发授权失效，并需同步替换 license_key.py 内嵌公钥后重新发布。\n'
        '如确实要重新生成（例如私钥泄露需换钥），请执行：\n'
        '    set %s=yes && python tools\\_gen_keys.py\n' % CONFIRM_FLAG)
    sys.exit(2)

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS_DIR = os.environ.get('DHU_KEYS_DIR') or os.path.normpath(os.path.join(HERE, '..', '..', 'dhu-keys'))
PRIV_PATH = os.path.join(KEYS_DIR, 'license_private.pem')
PUB_PATH = os.path.join(HERE, 'license_public.pem')

# 私钥绝不落回项目目录：目标已存在则拒绝覆盖
if os.path.exists(PRIV_PATH):
    sys.stderr.write('已阻止：私钥已存在于 %s，不覆盖。如需换钥请先手工归档旧私钥。\n' % PRIV_PATH)
    sys.exit(3)
os.makedirs(KEYS_DIR, exist_ok=True)

k = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
priv = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
pub = k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)

with open(PRIV_PATH, 'wb') as f:
    f.write(priv)
with open(PUB_PATH, 'wb') as f:
    f.write(pub)

print('私钥已写入（项目目录之外）：%s' % PRIV_PATH)
print('公钥已写入：%s' % PUB_PATH)
print('请把下面的公钥替换到 license_key.py 的 PUBLIC_KEY_PEM，然后重新打包发布：')
print(pub.decode('utf-8'))
