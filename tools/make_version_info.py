# -*- coding: utf-8 -*-
"""生成 PyInstaller 的 Windows 版本资源文件（VSVersionInfo）。

作用：让三个 exe 的属性面板显示正式的公司名、产品名、版权与版本号，
而不是 PyInstaller 默认的空值或 "Python Software Foundation"。

用法：python tools/make_version_info.py --version 1.3.13 --out build/version
输出：server.txt / launcher.txt / setup.txt 三个版本资源文件。
"""
import argparse
import os
import re
import sys

TEMPLATE = '''VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=({v0}, {v1}, {v2}, 0),
    prodvers=({v0}, {v1}, {v2}, 0),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '080404b0',
        [StringStruct('CompanyName', '{company}'),
         StringStruct('FileDescription', '{desc}'),
         StringStruct('FileVersion', '{filever}'),
         StringStruct('InternalName', '{internal}'),
         StringStruct('LegalCopyright', '{copyright}'),
         StringStruct('OriginalFilename', '{filename}'),
         StringStruct('ProductName', '{product}'),
         StringStruct('ProductVersion', '{ver}'),
         StringStruct('Comments', '{comments}')])
    ]),
    VarFileInfo([VarStruct('Translation', [2052, 1200])])
  ]
)
'''

TARGETS = [
    ('server.txt', 'dhu-ops-server.exe', 'DHU-Ops-Server', '东华大学多媒体教室运维系统 服务端'),
    ('launcher.txt', 'DHU-Ops-Launcher.exe', 'DHU-Ops-Launcher', '东华大学多媒体教室运维系统 桌面启动器'),
    ('setup.txt', 'DHU-Ops-Setup.exe', 'DHU-Ops-Setup', '东华大学多媒体教室运维系统 安装程序'),
]


def main():
    ap = argparse.ArgumentParser(description='生成 exe 版本资源文件')
    ap.add_argument('--version', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--company', default='东华大学信息中心')
    ap.add_argument('--product', default='东华大学多媒体教室运维系统')
    ap.add_argument('--copyright', default='© 2026 东华大学信息中心 版权所有')
    args = ap.parse_args()

    m = re.match(r'^(\d+)\.(\d+)\.(\d+)', args.version)
    if not m:
        print('[错误] 版本号格式不合法（需以 x.y.z 开头）：%s' % args.version)
        return 2
    v0, v1, v2 = [int(x) for x in m.groups()]
    filever = '%d.%d.%d.0' % (v0, v1, v2)

    os.makedirs(args.out, exist_ok=True)
    for fname, exe, internal, desc in TARGETS:
        text = TEMPLATE.format(
            v0=v0, v1=v1, v2=v2, ver=args.version, filever=filever,
            company=args.company, product=args.product,
            copyright=args.copyright, desc=desc, internal=internal,
            filename=exe, comments='东华大学多媒体教室运维系统 v%s' % args.version,
        )
        path = os.path.join(args.out, fname)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('[版本资源] %s -> %s' % (fname, os.path.basename(path)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
