"""东华大学多媒体教室运维系统 · 授权签发工具（厂商专用，图形界面）

功能：
  - 填写授权单位、机器码、有效期、用户数、版本名称，一键生成授权文件 license.json
  - 自动校验机器码格式（支持带/不带横线输入，自动规范为 XXXX-XXXX-XXXX-XXXX）
  - 生成后可直接「复制授权文本」发给客户，或把 license.json 文件发给客户

打包为 exe（私钥已移出项目目录，位于项目同级 dhu-keys\\）：
  python -m PyInstaller --noconfirm --clean --onefile --windowed --name DHU-License-Maker ^
      --icon assets\\dhu-ops.ico --distpath tools --specpath tools ^
      --add-data "..\\dhu-keys\\license_private.pem;." tools\\make_license_gui.py
  打包后 exe 从内嵌资源读取私钥；也可直接运行脚本，此时从 dhu-keys\\ 或 DHU_KEYS_DIR 读取。

注意：license_private.pem 为厂商私钥，务必妥善保管，切勿外发。
  已打包的 DHU-License-Maker.exe 内嵌了同一把私钥，等同私钥材料，同样切勿外发。
"""
import base64
import datetime
import json
import os
import re
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


# ---------- 签发逻辑 ----------

def resource_dir():
    """打包后从 _MEIPASS 读取资源，脚本运行时用脚本所在目录。"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def _key_candidates():
    """私钥查找顺序：内嵌资源(打包版) > DHU_KEYS_DIR 环境变量 > 项目同级 dhu-keys\\ > 脚本同目录（兼容旧布局）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    dirs = []
    if getattr(sys, 'frozen', False):
        dirs.append(sys._MEIPASS)  # 打包版内嵌私钥
    if os.environ.get('DHU_KEYS_DIR'):
        dirs.append(os.environ['DHU_KEYS_DIR'])
    dirs.append(os.path.normpath(os.path.join(here, '..', '..', 'dhu-keys')))
    dirs.append(here)
    return [os.path.join(d, 'license_private.pem') for d in dirs]


def load_private_key():
    """加载厂商私钥。私钥已移出项目目录，默认从项目同级 dhu-keys\\ 读取。"""
    for pem in _key_candidates():
        if os.path.exists(pem):
            with open(pem, 'rb') as f:
                return serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())
    raise FileNotFoundError(
        '找不到私钥文件 license_private.pem。请把它放在项目同级的 dhu-keys\\ 目录下，'
        '或用环境变量 DHU_KEYS_DIR 指定该目录的绝对路径。')


def normalize_machine(raw):
    """规范机器码：去掉所有非字母数字，16 位十六进制则自动加横线。"""
    t = ''.join(ch for ch in (raw or '').upper() if ch.isalnum())
    if len(t) == 16 and re.fullmatch(r'[0-9A-F]{16}', t):
        return '-'.join(t[i:i + 4] for i in range(0, 16, 4))
    return (raw or '').strip().upper()


def build_license(org, machine, expires, users, edition, key=None):
    """构造并签名授权字典。expires 为 YYYY-MM-DD 字符串。"""
    if not (org or '').strip():
        raise ValueError('授权单位不能为空')
    machine = normalize_machine(machine)
    if not machine:
        raise ValueError('机器码不能为空')
    try:
        users = int(users)
        if users < 1:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError('用户数必须是不小于 1 的整数')
    edition = (edition or '').strip() or '标准版'
    try:
        exp_date = datetime.date(*(int(x) for x in expires.split('-')))
    except Exception:
        raise ValueError('到期日格式应为 YYYY-MM-DD，例如 2027-11-13')
    if exp_date < datetime.date.today():
        raise ValueError('到期日不能早于今天（%s）' % datetime.date.today().isoformat())

    today = datetime.date.today().isoformat()
    payload = {
        'v': 1,
        'trial': False,
        'org': org.strip(),
        'edition': edition,
        'issued': today,
        'expires': exp_date.isoformat(),
        'machine': machine,
        'max_users': users,
        'modules': ['all'],
    }
    data = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    key = key or load_private_key()
    sig = base64.b64encode(key.sign(data, padding.PKCS1v15(), hashes.SHA256())).decode('ascii')
    rec = dict(payload)
    rec['sig'] = sig
    return rec


# ---------- 图形界面 ----------

APP_TITLE = '东华运维系统 · 授权签发工具'
BG = '#f4f6fa'
CARD = '#ffffff'
BLUE = '#1677ff'
TEXT = '#1f2329'
MUTED = '#646a73'


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry('560x600')
        self.resizable(False, False)
        self.configure(bg=BG)
        self._build()
        # 预填默认到期日 = 今天 + 365 天
        self.var_date.set((datetime.date.today() + datetime.timedelta(days=365)).isoformat())
        self.var_days.set('365')
        if '--markertest' in sys.argv:
            # 测试模式：窗口构建完成后写标记，供自动化验证
            try:
                here = os.path.dirname(os.path.abspath(sys.argv[0])) or os.getcwd()
                with open(os.path.join(here, 'gui_ready.marker'), 'w', encoding='utf-8') as f:
                    f.write(datetime.datetime.now().isoformat())
            except Exception:
                pass

    def _row(self, parent, label):
        fr = tk.Frame(parent, bg=CARD)
        fr.pack(fill='x', padx=18, pady=(8, 0))
        tk.Label(fr, text=label, bg=CARD, fg=MUTED, font=('Microsoft YaHei', 10)).pack(anchor='w')
        return fr

    def _entry(self, parent, textvariable=None, **kw):
        e = tk.Entry(parent, textvariable=textvariable, font=('Consolas', 11),
                     relief='solid', bd=1, highlightthickness=1,
                     highlightbackground='#d9d9d9', highlightcolor=BLUE, **kw)
        e.pack(fill='x', ipady=5, pady=(3, 0))
        return e

    def _build(self):
        head = tk.Frame(self, bg=BLUE)
        head.pack(fill='x')
        tk.Label(head, text=APP_TITLE, bg=BLUE, fg='white',
                 font=('Microsoft YaHei', 13, 'bold')).pack(anchor='w', padx=18, pady=12)
        tk.Label(head, text='填好后点「生成授权文件」，把 license.json 或授权文本发给客户',
                 bg=BLUE, fg='#dbeafe', font=('Microsoft YaHei', 9)).pack(anchor='w', padx=18, pady=(0, 10))

        card = tk.Frame(self, bg=CARD)
        card.pack(fill='both', expand=True, padx=14, pady=14)

        fr = self._row(card, '授权单位（客户名称）')
        self.var_org = tk.StringVar()
        self._entry(fr, self.var_org)

        fr = self._row(card, '客户机器码（客户在「基础配置 → 授权信息」里复制）')
        self.var_machine = tk.StringVar()
        self._entry(fr, self.var_machine)
        tk.Label(fr, text='支持带或不带横线，如 DE96-01AF-735F-0F88 或 DE9601AF735F0F88',
                 bg=CARD, fg='#8f959e', font=('Microsoft YaHei', 9)).pack(anchor='w', pady=(2, 0))

        fr = self._row(card, '有效期方式')
        row = tk.Frame(fr, bg=CARD)
        row.pack(fill='x', pady=(3, 0))
        self.mode = tk.StringVar(value='days')
        rb_days = tk.Radiobutton(row, text='按天数', variable=self.mode, value='days',
                                 bg=CARD, font=('Microsoft YaHei', 10), command=self._sync_date)
        rb_days.pack(side='left')
        self.var_days = tk.StringVar(value='365')
        self.sp_days = tk.Spinbox(row, from_=1, to=3650, textvariable=self.var_days, width=7,
                                  font=('Consolas', 11), relief='solid', bd=1)
        self.sp_days.pack(side='left', padx=(4, 14))
        rb_date = tk.Radiobutton(row, text='指定到期日', variable=self.mode, value='date',
                                 bg=CARD, font=('Microsoft YaHei', 10), command=self._sync_date)
        rb_date.pack(side='left')
        self.var_date = tk.StringVar()
        self.en_date = tk.Entry(row, textvariable=self.var_date, width=12, font=('Consolas', 11),
                                relief='solid', bd=1, state='disabled')
        self.en_date.pack(side='left', padx=4)

        fr = self._row(card, '最大用户数')
        self.var_users = tk.StringVar(value='50')
        self.sp_users = tk.Spinbox(fr, from_=1, to=9999, textvariable=self.var_users, width=7,
                                   font=('Consolas', 11), relief='solid', bd=1)
        self.sp_users.pack(anchor='w', ipady=3, pady=(3, 0))

        fr = self._row(card, '版本名称')
        self.var_edition = tk.StringVar(value='标准版')
        self._entry(fr, self.var_edition)

        btns = tk.Frame(card, bg=CARD)
        btns.pack(fill='x', padx=18, pady=14)
        self.btn_make = tk.Button(btns, text='生成授权文件', bg=BLUE, fg='white', activebackground='#0d5bdd',
                                  activeforeground='white', relief='flat', font=('Microsoft YaHei', 11, 'bold'),
                                  padx=18, pady=6, cursor='hand2', command=self.on_make)
        self.btn_make.pack(side='left')
        self.btn_copy = tk.Button(btns, text='复制授权文本', bg='white', fg=BLUE, activebackground='#e8f1ff',
                                  relief='solid', bd=1, font=('Microsoft YaHei', 10),
                                  padx=14, pady=6, cursor='hand2', state='disabled', command=self.on_copy)
        self.btn_copy.pack(side='left', padx=10)
        self.btn_save = tk.Button(btns, text='另存为...', bg='white', fg=BLUE, activebackground='#e8f1ff',
                                  relief='solid', bd=1, font=('Microsoft YaHei', 10),
                                  padx=14, pady=6, cursor='hand2', state='disabled', command=self.on_save)
        self.btn_save.pack(side='left')

        self.txt = tk.Text(card, height=9, font=('Consolas', 9), relief='solid', bd=1,
                           bg='#fafbfc', fg=TEXT, state='disabled', wrap='none')
        self.txt.pack(fill='both', expand=True, padx=18, pady=(0, 4))

        self.status = tk.Label(self, text='就绪', bg=BG, fg=MUTED, font=('Microsoft YaHei', 9), anchor='w')
        self.status.pack(fill='x', padx=18, pady=(0, 8))

    def _sync_date(self):
        if self.mode.get() == 'days':
            self.sp_days.config(state='normal')
            self.en_date.config(state='disabled')
        else:
            self.sp_days.config(state='disabled')
            self.en_date.config(state='normal')

    def _expires(self):
        if self.mode.get() == 'days':
            try:
                d = int(self.var_days.get())
                if d < 1:
                    raise ValueError
            except ValueError:
                raise ValueError('有效天数必须是正整数')
            return (datetime.date.today() + datetime.timedelta(days=d)).isoformat()
        return self.var_date.get().strip()

    def on_make(self):
        try:
            rec = build_license(self.var_org.get(), self.var_machine.get(), self._expires(),
                                self.var_users.get(), self.var_edition.get())
        except FileNotFoundError as e:
            messagebox.showerror(APP_TITLE, str(e))
            return
        except ValueError as e:
            messagebox.showwarning(APP_TITLE, str(e))
            return

        self._record = rec
        text = json.dumps(rec, ensure_ascii=False, indent=2)
        self.txt.config(state='normal')
        self.txt.delete('1.0', 'end')
        self.txt.insert('1.0', text)
        self.txt.config(state='disabled')
        self.btn_copy.config(state='normal')
        self.btn_save.config(state='normal')
        self.status.config(text='已生成：%s · %s · %d 用户 · %s ~ %s · 机器码 %s'
                           % (rec['org'], rec['edition'], rec['max_users'], rec['issued'], rec['expires'], rec['machine']),
                           fg='#389e0d')

        # 默认保存到工具目录旁的 license.json
        try:
            default_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False)
                                                          else os.path.abspath(__file__)))
            out = os.path.join(default_dir, 'license.json')
            with open(out, 'w', encoding='utf-8') as f:
                json.dump(rec, f, ensure_ascii=False, indent=2)
            self._last_file = out
            self.status.config(text=self.status.cget('text') + '　→ 已保存 ' + out)
        except Exception:
            self._last_file = None

    def on_copy(self):
        if not getattr(self, '_record', None):
            return
        text = json.dumps(self._record, ensure_ascii=False, indent=2)
        self.clipboard_clear()
        self.clipboard_append(text)
        self.status.config(text='授权文本已复制到剪贴板，可直接粘贴发给客户', fg=BLUE)

    def on_save(self):
        if not getattr(self, '_record', None):
            return
        path = filedialog.asksaveasfilename(title='保存授权文件',
                                            defaultextension='.json', initialfile='license.json',
                                            filetypes=[('授权文件', '*.json'), ('全部文件', '*.*')])
        if not path:
            return
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(self._record, f, ensure_ascii=False, indent=2)
        self._last_file = path
        self.status.config(text='已保存到 ' + path, fg='#389e0d')


def selftest():
    """无界面自测：--selftest 参数时执行，结果写入 selftest_result.json。"""
    out = {'ok': False}
    try:
        rec = build_license('自测单位', 'de9601af735f0f88', '2027-01-01', 10, '测试版')
        out['machine'] = rec['machine']
        out['expires'] = rec['expires']
        out['sig_len'] = len(rec['sig'])
        out['ok'] = (rec['machine'] == 'DE96-01AF-735F-0F88')
        here = os.path.dirname(os.path.abspath(sys.argv[0])) or os.getcwd()
        with open(os.path.join(here, 'selftest_result.json'), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
    except Exception as e:
        out['error'] = str(e)
        here = os.path.dirname(os.path.abspath(sys.argv[0])) or os.getcwd()
        with open(os.path.join(here, 'selftest_result.json'), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
    finally:
        try:
            root = tk.Tk()
            root.withdraw()
            root.destroy()
        except Exception:
            pass
        sys.exit(0 if out.get('ok') else 1)


if __name__ == '__main__':
    import traceback

    def _log(msg):
        try:
            here = os.path.dirname(os.path.abspath(sys.argv[0])) or os.getcwd()
            with open(os.path.join(here, 'lic_gui.log'), 'a', encoding='utf-8') as f:
                f.write(datetime.datetime.now().isoformat() + ' ' + msg + '\n')
        except Exception:
            pass

    try:
        _log('启动 argv=%r' % sys.argv)
        if '--selftest' in sys.argv:
            selftest()
        else:
            _log('创建主窗口')
            app = App()
            _log('窗口构建完成, 进入 mainloop')
            app.mainloop()
            _log('mainloop 正常退出（窗口被关闭）')
    except Exception:
        _log('异常:\n' + traceback.format_exc())
        raise
