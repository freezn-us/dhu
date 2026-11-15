# -*- coding: utf-8 -*-
"""前端资源压缩：把 assets 下的自研 JS/CSS 压缩为发布产物。

设计要点：
  1. 只处理 assets（自研资源）；vendor 目录的第三方 min 库不进本流程，原样打包。
  2. 源文件保持可读，构建产物输出到 build/assets，源码与发布件分离。
  3. 每个产物头部注入版权 banner，作为发布件的权属标识。
  4. 输出 manifest.json 记录压缩前后体积与 SHA-256，供构建脚本断言与事后审计。
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

import rcssmin
import rjsmin

BANNER_JS = ('/*! {product} · {name} | v{version} | {copyright}\n'
             ' * 本文件受著作权法保护，未经书面许可不得复制、传播、反编译或用于其他项目。\n'
             ' */\n')
BANNER_CSS = BANNER_JS


def walk(src):
    """按稳定顺序遍历源目录，返回 (绝对路径, 相对路径)。"""
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for fn in sorted(files):
            p = os.path.join(root, fn)
            yield p, os.path.relpath(p, src).replace('\\', '/')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description='压缩前端资源并注入版权 banner')
    ap.add_argument('--src', required=True, help='源目录，例如 assets')
    ap.add_argument('--out', required=True, help='输出目录，例如 build/assets')
    ap.add_argument('--version', required=True)
    ap.add_argument('--copyright', default='© 2026 东华大学信息中心 版权所有')
    ap.add_argument('--product', default='东华大学多媒体教室运维系统')
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    out = os.path.abspath(args.out)
    if not os.path.isdir(src):
        print('[错误] 源目录不存在：%s' % src)
        return 2

    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    manifest = {}
    total_orig = 0
    total_min = 0
    count = 0

    for path, rel in walk(src):
        dst = os.path.join(out, rel.replace('/', os.sep))
        os.makedirs(os.path.dirname(dst) or out, exist_ok=True)
        ext = os.path.splitext(rel)[1].lower()
        orig_size = os.path.getsize(path)
        banner = BANNER_JS.format(product=args.product, name=rel,
                                  version=args.version, copyright=args.copyright)

        # 非 JS/CSS 直接复制；极小文件（如自动生成的 version.js）压缩收益为负，也原样保留
        if ext not in ('.js', '.css') or orig_size < 1024:
            shutil.copy2(path, dst)
            manifest[rel] = {'orig': orig_size, 'min': orig_size, 'sha256': sha256(dst), 'copied': True}
            total_orig += orig_size
            total_min += orig_size
            count += 1
            continue

        if ext == '.js':
            with open(path, 'r', encoding='utf-8-sig') as f:
                code = f.read()
            mini = rjsmin.jsmin(code)
            if not mini.strip():
                print('[错误] 压缩结果为空：%s' % rel)
                return 3
            with open(dst, 'w', encoding='utf-8', newline='\n') as f:
                f.write(banner + mini)
        elif ext == '.css':
            with open(path, 'r', encoding='utf-8-sig') as f:
                code = f.read()
            mini = rcssmin.cssmin(code)
            if not mini.strip():
                print('[错误] 压缩结果为空：%s' % rel)
                return 3
            with open(dst, 'w', encoding='utf-8', newline='\n') as f:
                f.write(BANNER_CSS.format(product=args.product, name=rel,
                                         version=args.version, copyright=args.copyright) + mini)
        else:
            shutil.copy2(path, dst)
            manifest[rel] = {'orig': orig_size, 'min': orig_size, 'sha256': sha256(dst), 'copied': True}
            total_orig += orig_size
            total_min += orig_size
            count += 1
            continue

        min_size = os.path.getsize(dst)
        # 压缩比下限：避免异常情况下把文件压成空壳
        if min_size < orig_size * 0.15:
            print('[错误] 压缩异常（体积过小）：%s %d -> %d' % (rel, orig_size, min_size))
            return 4
        manifest[rel] = {'orig': orig_size, 'min': min_size, 'sha256': sha256(dst), 'copied': False}
        total_orig += orig_size
        total_min += min_size
        count += 1

    if count == 0:
        print('[错误] 源目录中没有可发布的资源')
        return 5

    mf_path = os.path.join(out, '..', 'assets-manifest.json')
    with open(mf_path, 'w', encoding='utf-8') as f:
        json.dump({'version': args.version, 'files': manifest,
                   'total_orig': total_orig, 'total_min': total_min}, f,
                  ensure_ascii=False, indent=2, sort_keys=True)

    saved = 100.0 * (1 - float(total_min) / total_orig) if total_orig else 0
    print('[前端压缩] %d 个文件  %.1f KB -> %.1f KB  节省 %.1f%%'
          % (count, total_orig / 1024.0, total_min / 1024.0, saved))

    # 构建产物关键文件断言：缺任何一个都说明压缩流程异常
    for must in ('store.js', 'app.js', 'ui.js', 'styles.css'):
        if not os.path.exists(os.path.join(out, must)):
            print('[错误] 产物缺少 %s' % must)
            return 6
    return 0


if __name__ == '__main__':
    sys.exit(main())
