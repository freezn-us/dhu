# -*- coding: utf-8 -*-
"""东华大学多媒体教室运维系统 · 图形化安装程序

双击运行（会自动请求管理员权限），可选择安装目录与端口，一键完成：
停止旧实例 -> 复制程序 -> 写端口/访问范围配置 -> 注册开机自启 -> 按需放行私网防火墙 -> 启动服务。
默认仅本机访问；勾选「允许局域网访问」后才监听 0.0.0.0 并放行专用网络。
不依赖 cmd 批处理与 PowerShell 脚本，避免系统策略拦截。

命令行模式（供排查/自动化）：
  DHU-Ops-Setup.exe --selftest                  仅做环境自检，不做任何修改
  DHU-Ops-Setup.exe --install-cli 目录 端口 [lan|local]  无界面安装
"""
import base64
import ctypes
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

APP_TITLE = '东华大学多媒体教室运维系统'


def _bundled_file(name):
    """定位随安装程序打包的资源（onefile 时位于 sys._MEIPASS）。"""
    for base in (getattr(sys, '_MEIPASS', ''), os.path.dirname(os.path.abspath(__file__))):
        if not base:
            continue
        p = os.path.join(base, name)
        if os.path.exists(p):
            return p
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), name)


def _read_build_info():
    """读取随包 version.json，得到版本号与构建时间。"""
    try:
        with open(_bundled_file('version.json'), 'r', encoding='utf-8') as f:
            d = json.load(f)
            return d.get('version', '0.0.0'), d.get('buildTime', ''), d.get('notes', '')
    except Exception:
        return '0.0.0', '', ''


APP_VERSION, BUILD_TIME, BUILD_NOTES = _read_build_info()
TASK_NAME = 'DHU-Ops-Server'
EXE_NAME = 'dhu-ops-server.exe'
LAUNCHER_NAME = 'DHU-Ops-Launcher.exe'
ICON_NAME = 'dhu-ops.ico'
SHORTCUT_NAME = APP_TITLE
DEFAULT_DIR = r'C:\dhu-ops'
DEFAULT_PORT = 8420
DATA_DIR = os.path.join(os.environ.get('ProgramData', r'C:\ProgramData'), 'DHU-Ops')
RULE_PORT = 'DHU-Ops-Port'
RULE_PROG = 'DHU-Ops-Program'
RULE_OLD = 'DHU-Ops-8420'
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
MUTEX_NAME = 'DHU-Ops-Setup-SingleInstance'
_mutex_handle = None


def acquire_single_instance():
    """用命名互斥量保证只运行一个安装程序实例，返回 True 表示当前是首个实例。"""
    global _mutex_handle
    if os.name != 'nt':
        return True
    try:
        _mutex_handle = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        # ERROR_ALREADY_EXISTS = 183
        return ctypes.windll.kernel32.GetLastError() != 183
    except Exception:
        return True


def is_admin():
    if os.name != 'nt':
        return True
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def bundled_exe():
    """获取随安装程序打包的服务端 exe 路径。"""
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, EXE_NAME)


def run(args):
    """执行系统命令，返回 (退出码, 输出)。"""
    try:
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             creationflags=NO_WINDOW)
        out = p.communicate(timeout=60)[0] or b''
        try:
            text = out.decode('gbk', 'ignore')
        except Exception:
            text = str(out)
        return p.returncode, text.strip()
    except Exception as e:
        return -1, str(e)


def port_is_free(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('0.0.0.0', port))
        return True, ''
    except OSError:
        return False, '端口已被占用'
    finally:
        s.close()


def local_ips():
    ips = []
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith('127.') and not ip.startswith('169.254.'):
                ips.append(ip)
    except Exception:
        pass
    return ips


def wait_http(port, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            r = urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=2)
            if r.status == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def stop_old(log=print):
    log('停止旧服务实例...')
    run(['schtasks', '/end', '/tn', TASK_NAME])
    run(['taskkill', '/f', '/im', EXE_NAME])
    time.sleep(1.5)


def stop_system(log=print):
    """关闭系统：停止任务与服务进程，并禁用开机自启（再次「开始安装」会自动恢复）。"""
    log('正在关闭系统服务...')
    run(['schtasks', '/end', '/tn', TASK_NAME])
    time.sleep(1)
    run(['taskkill', '/f', '/im', EXE_NAME])
    run(['schtasks', '/change', '/tn', TASK_NAME, '/disable'])
    return True


ROLLBACK_BAT = '''@echo off
chcp 936 >nul
setlocal EnableExtensions
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 正在请求管理员权限...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1" %*
echo.
pause
'''


def installed_version(target):
    try:
        with open(os.path.join(target, 'version.json'), 'r', encoding='utf-8') as f:
            return json.load(f).get('version', '')
    except Exception:
        return ''


def snapshot_current(target, log=print):
    """升级安装前，把正在运行的旧版本 exe 备份到 versions/<旧版本>/，供回滚使用。"""
    exe = os.path.join(target, EXE_NAME)
    if not os.path.exists(exe):
        return
    old = installed_version(target) or 'unknown'
    if old == APP_VERSION:
        return
    vdir = os.path.join(target, 'versions', old)
    dst = os.path.join(vdir, EXE_NAME)
    if os.path.exists(dst):
        return
    try:
        os.makedirs(vdir, exist_ok=True)
        shutil.copy2(exe, dst)
        oldvf = os.path.join(target, 'version.json')
        if os.path.exists(oldvf):
            shutil.copy2(oldvf, os.path.join(vdir, 'version.json'))
        log('已备份旧版本 v%s，可随时回滚' % old)
    except Exception as e:
        log('[提醒] 旧版本备份失败：%s' % e)


def write_version_tools(target, log=print):
    """写入版本号文件与回滚工具（版本回滚.bat + rollback.ps1）。"""
    vf = _bundled_file('version.json')
    if os.path.exists(vf):
        shutil.copy2(vf, os.path.join(target, 'version.json'))
    rp = _bundled_file('rollback.ps1')
    if os.path.exists(rp):
        shutil.copy2(rp, os.path.join(target, 'rollback.ps1'))
    try:
        with open(os.path.join(target, '版本回滚.bat'), 'w', encoding='gbk') as f:
            f.write(ROLLBACK_BAT.replace('\n', '\r\n'))
    except Exception as e:
        log('[提醒] 写入回滚脚本失败：%s' % e)


def public_shortcut_paths():
    """公共桌面与公共开始菜单下的快捷方式路径。"""
    public = os.environ.get('PUBLIC') or r'C:\Users\Public'
    program_data = os.environ.get('ProgramData') or r'C:\ProgramData'
    desktop = os.path.join(public, 'Desktop')
    startmenu = os.path.join(program_data, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    return [os.path.join(desktop, SHORTCUT_NAME + '.lnk'),
            os.path.join(startmenu, SHORTCUT_NAME + '.lnk')]


def _ps_str(text):
    return "'" + text.replace("'", "''") + "'"


def create_shortcuts(target, log=print):
    """在公共桌面与开始菜单创建「一键打开」快捷方式（指向启动器）。"""
    launcher = os.path.join(target, LAUNCHER_NAME)
    if not os.path.exists(launcher):
        log('[提醒] 安装目录缺少启动器，跳过快捷方式创建')
        return []
    icon = os.path.join(target, ICON_NAME)
    if not os.path.exists(icon):
        icon = launcher
    lines = ['$ErrorActionPreference = "Stop"',
             '$w = New-Object -ComObject WScript.Shell']
    links = public_shortcut_paths()
    for lnk in links:
        lines.append('$s = $w.CreateShortcut(%s)' % _ps_str(lnk))
        lines.append('$s.TargetPath = %s' % _ps_str(launcher))
        lines.append('$s.WorkingDirectory = %s' % _ps_str(target))
        lines.append('$s.IconLocation = %s' % _ps_str(icon + ',0'))
        lines.append('$s.Description = %s' % _ps_str(APP_TITLE + ' · 双击直接打开'))
        lines.append('$s.Save()')
    # 用 EncodedCommand 传入，避免中文路径与引号转义问题
    enc = base64.b64encode('\r\n'.join(lines).encode('utf-16-le')).decode('ascii')
    run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
         '-EncodedCommand', enc])
    made = [p for p in links if os.path.exists(p)]
    if made:
        log('已创建快捷方式：%s' % '、'.join(made))
    else:
        log('[提醒] 快捷方式创建失败，可手动把 %s 发送到桌面' % launcher)
    return made


def remove_shortcuts(log=print):
    for lnk in public_shortcut_paths():
        try:
            if os.path.exists(lnk):
                os.remove(lnk)
                log('已删除快捷方式 %s' % lnk)
        except Exception as e:
            log('[提醒] 删除快捷方式失败：%s' % e)


def copy_launcher(target, log=print):
    """把启动器与图标复制到安装目录（桌面快捷方式指向启动器）。"""
    src = _bundled_file(LAUNCHER_NAME)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(target, LAUNCHER_NAME))
    else:
        log('[提醒] 安装包内缺少 %s，桌面快捷方式将不可用' % LAUNCHER_NAME)
    ico = _bundled_file(ICON_NAME)
    if os.path.exists(ico):
        shutil.copy2(ico, os.path.join(target, ICON_NAME))


def default_allow_lan(target=DEFAULT_DIR):
    """安装界面「允许局域网访问」的默认值。

    - 已有 access.txt：沿用上次选择；
    - 无 access.txt 但数据库已存在：旧版本升级，保持原来的局域网可访问行为；
    - 全新安装：默认仅本机。
    """
    path = os.path.join(target, 'access.txt')
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            v = f.read().strip().lower()
        if v in ('lan', '1', 'true', 'yes', 'on'):
            return True
        if v in ('local', '0', 'false', 'no', 'off'):
            return False
    except Exception:
        pass
    return os.path.exists(os.path.join(DATA_DIR, 'dhu_ops.db'))


def install(target, port, allow_lan=False, log=print):
    """执行安装，返回 True/False。allow_lan=False 时服务仅监听 127.0.0.1。"""
    src = bundled_exe()
    if not os.path.exists(src):
        log('[错误] 安装包内缺少 %s' % EXE_NAME)
        return False


    stop_old(log)

    log('安装版本：v%s' % APP_VERSION)
    log('复制程序到 %s' % target)
    os.makedirs(target, exist_ok=True)
    snapshot_current(target, log)
    dst = os.path.join(target, EXE_NAME)
    shutil.copy2(src, dst)
    copy_launcher(target, log)
    write_version_tools(target, log)
    with open(os.path.join(target, 'port.txt'), 'w') as f:
        f.write(str(port))
    # 访问范围写入程序目录：服务端启动时据此决定监听 0.0.0.0 还是 127.0.0.1
    with open(os.path.join(target, 'access.txt'), 'w', encoding='utf-8') as f:
        f.write('lan\n' if allow_lan else 'local\n')
    os.makedirs(DATA_DIR, exist_ok=True)
    # 授权本机用户读写数据目录：计划任务未运行时，启动器可直接拉起服务端
    run(['icacls', DATA_DIR, '/grant', '*S-1-5-32-545:(OI)(CI)M'])

    log('注册开机自启任务（%s）' % TASK_NAME)
    code, out = run(['schtasks', '/create', '/f', '/tn', TASK_NAME, '/tr', '"%s"' % dst,
                     '/sc', 'onstart', '/ru', 'SYSTEM', '/rl', 'HIGHEST'])
    if code != 0:
        log('[提醒] 计划任务注册失败（%s），将改为直接启动服务端' % out)

    log('配置防火墙（%s）' % ('放行私网 TCP %d' % port if allow_lan else '不开放入站'))
    for name in (RULE_OLD, RULE_PORT, RULE_PROG):
        run(['netsh', 'advfirewall', 'firewall', 'delete', 'rule', 'name=' + name])
    if allow_lan:
        # 只放行专用网络、且仅限本地子网，避免把服务暴露到公共网络
        run(['netsh', 'advfirewall', 'firewall', 'add', 'rule', 'name=' + RULE_PORT,
             'dir=in', 'action=allow', 'protocol=TCP', 'localport=%d' % port,
             'profile=private', 'remoteip=LocalSubnet'])
        run(['netsh', 'advfirewall', 'firewall', 'add', 'rule', 'name=' + RULE_PROG,
             'dir=in', 'action=allow', 'program=%s' % dst,
             'profile=private', 'remoteip=LocalSubnet'])

    log('启动服务...')
    code, out = run(['schtasks', '/run', '/tn', TASK_NAME])
    if code != 0:
        log('[提醒] 计划任务启动失败（%s），将直接启动服务端' % out)
    log('创建桌面与开始菜单快捷方式...')
    create_shortcuts(target, log)
    # 第一轮：等待计划任务拉起的服务（最多 15 秒）
    ok = wait_http(port, timeout=15)
    if not ok:
        # 兜底：计划任务可能因权限/任务计划服务等原因未拉起，直接启动 exe
        log('[提醒] 计划任务未拉起服务，尝试直接启动服务端...')
        try:
            subprocess.Popen([dst], cwd=target, close_fds=True, creationflags=NO_WINDOW)
        except Exception as e:
            log('[错误] 直接启动服务端失败：%s' % e)
        ok = wait_http(port, timeout=25)
    if ok:
        log('服务已启动：http://127.0.0.1:%d' % port)
    else:
        log('[错误] 服务在 40 秒内未能访问，请检查端口占用、安全软件拦截，'
            '或查看 %s 下的服务端日志。' % DATA_DIR)
    return ok


def uninstall(target, remove_data, log=print):
    log('停止并移除开机自启任务...')
    run(['schtasks', '/end', '/tn', TASK_NAME])
    run(['schtasks', '/delete', '/f', '/tn', TASK_NAME])
    run(['taskkill', '/f', '/im', EXE_NAME])

    log('移除防火墙规则...')
    for name in (RULE_OLD, RULE_PORT, RULE_PROG):
        run(['netsh', 'advfirewall', 'firewall', 'delete', 'rule', 'name=' + name])

    log('移除桌面与开始菜单快捷方式...')
    remove_shortcuts(log)

    if os.path.isdir(target):
        try:
            shutil.rmtree(target, ignore_errors=True)
            log('已删除 %s' % target)
        except Exception as e:
            log('[警告] 删除 %s 失败：%s' % (target, e))

    if remove_data and os.path.isdir(DATA_DIR):
        shutil.rmtree(DATA_DIR, ignore_errors=True)
        log('已删除运维数据 %s' % DATA_DIR)
    elif os.path.isdir(DATA_DIR):
        log('运维数据保留在 %s' % DATA_DIR)
    log('卸载完成。')
    return True


# ---------------- 托盘图标 ----------------
def make_tray_image():
    """生成托盘图标（蓝底 + 白色显示器），无需外部图片文件。"""
    from PIL import Image, ImageDraw
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, size - 1, size - 1], fill=(22, 119, 255, 255))
    d.rectangle([10, 12, size - 11, 40], fill=(255, 255, 255, 255))
    d.rectangle([14, 16, size - 15, 36], fill=(22, 119, 255, 255))
    d.rectangle([27, 44, 37, 50], fill=(255, 255, 255, 255))
    d.rectangle([19, 50, 45, 54], fill=(255, 255, 255, 255))
    return img


def setup_tray(root, on_open, on_quit):
    """创建右下角任务栏托盘图标；失败则返回 None（不影响主窗口使用）。"""
    try:
        import pystray
        from pystray import Menu, MenuItem
    except Exception:
        return None
    try:
        image = make_tray_image()
        menu = Menu(
            MenuItem('打开窗口', lambda: on_open(), default=True),
            MenuItem('退出', lambda: on_quit()),
        )
        icon = pystray.Icon('DHU-Ops-Setup', image, APP_TITLE + ' v' + APP_VERSION + ' · 安装程序', menu)
        icon.run_detached()
        return icon
    except Exception:
        return None


# ---------------- 命令行模式（便于自检与自动化） ----------------
def cli_selftest():
    print('=== 环境自检 ===')
    print('安装包版本 : v%s（构建于 %s）' % (APP_VERSION, BUILD_TIME or '未知'))
    print('管理员权限 :', '是' if is_admin() else '否（请右键以管理员身份运行）')
    print('随包 exe   :', bundled_exe(), '存在' if os.path.exists(bundled_exe()) else '缺失')
    lc = _bundled_file(LAUNCHER_NAME)
    print('随包启动器 :', lc, '存在' if os.path.exists(lc) else '缺失')
    print('图标文件   :', '存在' if os.path.exists(_bundled_file(ICON_NAME)) else '缺失')
    print('快捷方式   :', '、'.join(public_shortcut_paths()))
    print('默认目录   :', DEFAULT_DIR)
    print('默认端口   :', DEFAULT_PORT, '可用' if port_is_free(DEFAULT_PORT)[0] else '被占用')
    print('本机 IP    :', ', '.join(local_ips()) or '未获取到')
    return 0


def main():
    if '--gui-smoke' in sys.argv:
        # 打包后自检：确认 Tk 图形库与托盘图标可用
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        root.update()
        tray = setup_tray(root, lambda: None, lambda: None)
        print('tkinter ok; tray=' + ('ok' if tray else 'unavailable'))
        if tray:
            time.sleep(1)
            try:
                tray.stop()
            except Exception:
                pass
        root.destroy()
        return 0

    if '--selftest' in sys.argv:
        return cli_selftest()

    if '--stop-cli' in sys.argv:
        if not is_admin():
            print('需要管理员权限')
            return 1
        stop_system()
        print('系统已停止')
        return 0

    if '--install-cli' in sys.argv:
        i = sys.argv.index('--install-cli')
        target = sys.argv[i + 1] if len(sys.argv) > i + 1 else DEFAULT_DIR
        port = int(sys.argv[i + 2]) if len(sys.argv) > i + 2 else DEFAULT_PORT
        # 第三个可选参数：lan/local；缺省时沿用已有选择（全新安装默认仅本机）
        if len(sys.argv) > i + 3:
            allow_lan = sys.argv[i + 3].strip().lower() in ('lan', '1', 'true', 'yes', 'on')
        else:
            allow_lan = default_allow_lan(target)
        if not is_admin():
            print('需要管理员权限')
            return 1
        return 0 if install(target, port, allow_lan) else 1

    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox, scrolledtext

    # 单实例：已有实例在运行时只提示，不再新开窗口
    if not acquire_single_instance():
        r = tk.Tk()
        r.withdraw()
        r.attributes('-topmost', True)
        messagebox.showinfo(APP_TITLE,
                            '安装程序已经在运行，不会重复打开窗口。\n\n'
                            '请在屏幕右下角任务栏（通知区域）中找到本程序的图标，\n'
                            '单击或双击该图标即可还原窗口。')
        r.destroy()
        return 0

    if not is_admin():
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(APP_TITLE, '未获得管理员权限。\n请右键点击安装程序，选择「以管理员身份运行」。')
        return 1

    root = tk.Tk()
    root.title(APP_TITLE + ' v' + APP_VERSION + ' · 安装')
    root.geometry('660x540')
    root.minsize(620, 500)

    style = ttk.Style()
    try:
        style.theme_use('vista')
    except Exception:
        pass

    tk.Label(root, text=APP_TITLE, font=('Microsoft YaHei', 15, 'bold')).pack(pady=(14, 2))
    tk.Label(root, text='当前版本 v' + APP_VERSION + ' · 选择安装目录与服务端口，点击「开始安装」即可完成部署',
             fg='#666').pack()

    form = tk.Frame(root)
    form.pack(fill='x', padx=18, pady=12)

    tk.Label(form, text='安装目录').grid(row=0, column=0, sticky='w', pady=6)
    dir_var = tk.StringVar(value=DEFAULT_DIR)
    dir_entry = ttk.Entry(form, textvariable=dir_var, width=52)
    dir_entry.grid(row=0, column=1, sticky='we', padx=8)

    def browse():
        d = filedialog.askdirectory(title='选择安装目录')
        if d:
            dir_var.set(os.path.normpath(d))

    ttk.Button(form, text='浏览...', command=browse).grid(row=0, column=2)

    tk.Label(form, text='服务端口').grid(row=1, column=0, sticky='w', pady=6)
    port_var = tk.StringVar(value=str(DEFAULT_PORT))
    port_entry = ttk.Entry(form, textvariable=port_var, width=16)
    port_entry.grid(row=1, column=1, sticky='w', padx=8)
    port_hint = tk.Label(form, text='1024-65535，安装前会自动检测是否被占用', fg='#888')
    port_hint.grid(row=1, column=1, sticky='e', padx=8)

    lan_var = tk.BooleanVar(value=default_allow_lan(dir_var.get().strip() or DEFAULT_DIR))
    ttk.Checkbutton(form, text='允许局域网访问（同事可通过本机 IP 访问；仅放行专用网络）',
                    variable=lan_var).grid(row=2, column=0, columnspan=3, sticky='w', pady=4)
    form.columnconfigure(1, weight=1)

    btns = tk.Frame(root)
    btns.pack(fill='x', padx=18)
    install_btn = ttk.Button(btns, text='开始安装')
    install_btn.pack(side='left')

    def open_system():
        target = dir_var.get().strip().strip('"') or DEFAULT_DIR
        launcher = os.path.join(target, LAUNCHER_NAME)
        if os.path.exists(launcher):
            try:
                subprocess.Popen([launcher], close_fds=True)
                return
            except Exception:
                pass
        webbrowser.open('http://127.0.0.1:%s' % port_var.get())

    open_btn = ttk.Button(btns, text='打开系统', state='disabled', command=open_system)
    open_btn.pack(side='left', padx=8)
    close_btn = ttk.Button(btns, text='关闭系统')
    close_btn.pack(side='right', padx=8)
    ttk.Button(btns, text='卸载本系统', command=lambda: do_uninstall()).pack(side='right')

    log_box = scrolledtext.ScrolledText(root, height=15, font=('Consolas', 9))
    log_box.pack(fill='both', expand=True, padx=18, pady=10)
    log_box.insert('end', '就绪，点击「开始安装」开始部署。\n')
    log_box.configure(state='disabled')

    def log(msg):
        def _w():
            log_box.configure(state='normal')
            log_box.insert('end', msg + '\n')
            log_box.see('end')
            log_box.configure(state='disabled')
        root.after(0, _w)

    def valid_port():
        try:
            p = int(port_var.get().strip())
        except ValueError:
            messagebox.showerror(APP_TITLE, '端口必须是数字。')
            return None
        if p < 1024 or p > 65535:
            messagebox.showerror(APP_TITLE, '端口需在 1024-65535 之间。')
            return None
        return p

    def worker(target, port, allow_lan):
        ok = install(target, port, allow_lan, log)
        def done():
            install_btn.configure(state='normal')
            if ok:
                msg = '安装完成，服务已启动！\n\n本机访问：http://127.0.0.1:%d' % port
                if allow_lan:
                    for ip in local_ips():
                        msg += '\n局域网访问：http://%s:%d' % (ip, port)
                    msg += '\n（已放行专用网络与本地子网）'
                else:
                    msg += '\n当前仅本机可访问；如需同事访问，请重新安装并勾选「允许局域网访问」。'
                msg += ('\n\n初始管理员密码（一次性）：\n%s\n首次登录必须修改密码，修改成功后该文件自动删除。'
                        % os.path.join(DATA_DIR, '初始管理员密码.txt'))
                msg += '\n数据库：%s' % os.path.join(DATA_DIR, 'dhu_ops.db')
                msg += '\n\n桌面已生成「%s」图标，双击即可直接打开系统。' % SHORTCUT_NAME
                open_btn.configure(state='normal')
                messagebox.showinfo(APP_TITLE, msg)
            else:
                messagebox.showerror(APP_TITLE, '安装未完成，请查看下方日志。')
        root.after(0, done)

    def do_install():
        target = dir_var.get().strip().strip('"')
        if not target:
            messagebox.showerror(APP_TITLE, '请填写安装目录。')
            return
        port = valid_port()
        if port is None:
            return
        free, _ = port_is_free(port)
        if not free:
            # 可能是旧实例占着端口，提示后仍可继续（安装会先停旧实例）
            if not messagebox.askyesno(APP_TITLE,
                                       '端口 %d 当前被占用，可能是旧版本正在运行。\n'
                                       '继续安装会先停止旧实例，是否继续？' % port):
                return
        install_btn.configure(state='disabled')
        threading.Thread(target=worker, args=(target, port, bool(lan_var.get())), daemon=True).start()

    def do_uninstall():
        target = dir_var.get().strip().strip('"') or DEFAULT_DIR
        if not messagebox.askyesno(APP_TITLE, '确定卸载本系统？\n将停止服务并删除程序目录 %s。' % target):
            return
        remove_data = messagebox.askyesno(APP_TITLE, '是否同时删除全部运维数据？\n（选择「否」将保留数据，便于以后重装）')
        log('开始卸载...')
        uninstall(target, remove_data, log)
        messagebox.showinfo(APP_TITLE, '卸载完成。')

    install_btn.configure(command=do_install)

    def do_close_system():
        if not messagebox.askyesno(APP_TITLE,
                                   '确定关闭系统？\n\n将停止服务、关闭本窗口，并暂停开机自启。\n'
                                   '需要再次使用时，运行安装程序点「开始安装」即可恢复。'):
            return
        log('正在关闭系统服务...')
        stop_system(log)
        log('系统已停止，开机自启已暂停。')
        messagebox.showinfo(APP_TITLE, '系统已关闭，窗口即将退出。\n如需重新启动，请再次运行安装程序并点击「开始安装」。')
        quit_app()

    close_btn.configure(command=do_close_system)

    # ---------- 托盘：关闭/最小化都收起到右下角任务栏 ----------
    tray_state = {'icon': None, 'notified': False, 'quitting': False}

    def show_window():
        def _do():
            try:
                root.deiconify()
                root.state('normal')
                root.lift()
                root.focus_force()
            except Exception:
                pass
        root.after(0, _do)

    def quit_app():
        tray_state['quitting'] = True
        icon = tray_state['icon']
        if icon is not None:
            try:
                icon.stop()
            except Exception:
                pass
        try:
            root.after(0, root.destroy)
        except Exception:
            pass

    def hide_window():
        # 托盘不可用时关闭即退出，避免窗口无法恢复
        if tray_state['icon'] is None:
            quit_app()
            return
        root.withdraw()
        if not tray_state['notified']:
            tray_state['notified'] = True
            try:
                tray_state['icon'].notify('已最小化到右下角任务栏，单击图标可还原窗口。', APP_TITLE)
            except Exception:
                pass

    def on_unmap(_event):
        # 点击最小化按钮时同样收起到托盘
        if tray_state['quitting'] or tray_state['icon'] is None:
            return
        try:
            if root.state() == 'iconic':
                root.after(40, root.withdraw)
        except Exception:
            pass

    tray_state['icon'] = setup_tray(root, show_window, quit_app)
    root.protocol('WM_DELETE_WINDOW', hide_window)
    root.bind('<Unmap>', on_unmap)

    root.mainloop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
