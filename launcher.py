# -*- coding: utf-8 -*-
"""东华大学多媒体教室运维系统 · 桌面启动器

双击桌面图标后：
  1. 读取同目录 port.txt 得到服务端口（默认 8420）
  2. 探测服务是否在运行；未运行则先尝试计划任务，再直接启动同目录服务端
  3. 用 Edge / Chrome 的「应用窗口」方式打开系统页面（无地址栏，像独立软件）；
     两者都没有时退回系统默认浏览器

命令行：
  DHU-Ops-Launcher.exe --check   仅打印诊断信息，不启动服务、不打开页面
"""
import ctypes
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser

APP_TITLE = '东华大学多媒体教室运维系统'
TASK_NAME = 'DHU-Ops-Server'
SERVER_EXE = 'dhu-ops-server.exe'
DEFAULT_PORT = 8420
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0


def base_dir():
    """启动器所在目录（打包后为 exe 目录，开发时为脚本目录）。"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def read_port():
    """返回 (端口, 来源说明)。"""
    for key in ('DHU_OPS_PORT', 'HTTP_PLATFORM_PORT'):
        v = (os.environ.get(key) or '').strip()
        if v.isdigit():
            return int(v), '环境变量 ' + key
    try:
        with open(os.path.join(base_dir(), 'port.txt'), 'r') as f:
            v = f.read().strip().lstrip('\ufeff')
        if v.isdigit():
            return int(v), 'port.txt'
    except Exception:
        pass
    return DEFAULT_PORT, '默认值'


def alive(port):
    try:
        r = urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=2)
        return r.status == 200
    except Exception:
        return False


def wait_alive(port, timeout):
    end = time.time() + timeout
    while time.time() < end:
        if alive(port):
            return True
        time.sleep(0.8)
    return False


def start_service(port):
    """确保服务可用；返回是否成功。"""
    if alive(port):
        return True
    # 1) 已注册的开机自启任务（以 SYSTEM 身份运行，不新增进程副本）
    try:
        subprocess.call(['schtasks', '/run', '/tn', TASK_NAME],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        creationflags=NO_WINDOW)
    except Exception:
        pass
    if wait_alive(port, 12):
        return True
    # 2) 直接启动同目录服务端（计划任务被禁用/未注册时兜底）
    exe = os.path.join(base_dir(), SERVER_EXE)
    if os.path.exists(exe):
        try:
            subprocess.Popen([exe], cwd=base_dir(), close_fds=True, creationflags=NO_WINDOW)
        except Exception:
            pass
        if wait_alive(port, 25):
            return True
    return alive(port)


def browser_candidates():
    pf = os.environ.get('ProgramFiles', r'C:\Program Files')
    pf86 = os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')
    local = os.environ.get('LOCALAPPDATA', '')
    names = [
        os.path.join(pf86, r'Microsoft\Edge\Application\msedge.exe'),
        os.path.join(pf, r'Microsoft\Edge\Application\msedge.exe'),
        os.path.join(local, r'Microsoft\Edge\Application\msedge.exe') if local else '',
        os.path.join(pf, r'Google\Chrome\Application\chrome.exe'),
        os.path.join(pf86, r'Google\Chrome\Application\chrome.exe'),
        os.path.join(local, r'Google\Chrome\Application\chrome.exe') if local else '',
    ]
    return [p for p in names if p and os.path.exists(p)]


def open_page(url):
    """优先用浏览器的应用窗口方式打开，返回打开方式说明。"""
    exes = browser_candidates()
    if exes:
        try:
            subprocess.Popen([exes[0], '--app=' + url], close_fds=True)
            return '应用窗口（%s）' % os.path.basename(exes[0])
        except Exception:
            pass
    webbrowser.open(url)
    return '默认浏览器'


def show_error(text):
    try:
        ctypes.windll.user32.MessageBoxW(None, text, APP_TITLE, 0x10 | 0x40000)
    except Exception:
        pass


def main():
    port, source = read_port()
    url = 'http://127.0.0.1:%d/' % port

    if '--check' in sys.argv:
        print('程序目录  : %s' % base_dir())
        print('端口      : %d（%s）' % (port, source))
        print('服务状态  : %s' % ('运行中' if alive(port) else '未运行'))
        print('访问地址  : %s' % url)
        exes = browser_candidates()
        print('打开方式  : %s' % ('应用窗口 ' + exes[0] if exes else '默认浏览器'))
        return 0

    if start_service(port):
        open_page(url)
        return 0

    show_error('未能启动运维系统服务。\n\n'
               '请检查：\n'
               '1. 安装目录下是否存在 %s\n'
               '2. 端口 %d 是否被其他程序占用\n'
               '3. 是否被安全软件拦截\n\n'
               '如仍无法打开，请运行安装程序并点击「开始安装」重新部署。' % (SERVER_EXE, port))
    return 1


if __name__ == '__main__':
    sys.exit(main())
