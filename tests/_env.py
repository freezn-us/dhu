# -*- coding: utf-8 -*-
"""测试环境公共配置：路径相对项目根解析、浏览器自动探测，换机/换目录零修改。"""
import os
from pathlib import Path

# tests/_env.py -> 项目根
PROJECT_ROOT = Path(__file__).resolve().parents[1]
INDEX_URL = PROJECT_ROOT.joinpath('index.html').as_uri()

_EDGE_CANDIDATES = (
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
)


def launch_browser(p, headless=True):
    """优先本机 Chrome，其次 Edge，最后 Playwright 自带 Chromium。"""
    try:
        return p.chromium.launch(channel='chrome', headless=headless)
    except Exception:
        pass
    for exe in _EDGE_CANDIDATES:
        if os.path.exists(exe):
            return p.chromium.launch(executable_path=exe, headless=headless)
    return p.chromium.launch(headless=headless)
