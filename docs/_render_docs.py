# -*- coding: utf-8 -*-
"""Render the two A4 handbooks from HTML to PDF with running header/footer."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\File\AI\dhu")
DOCS = ROOT / "docs"

DOCS = [
    {
        "html": DOCS / "开发功能文档_v1.5.4_内部.html",
        "pdf": DOCS / "东华大学多媒体教室运维系统_开发功能文档_v1.5.4_内部.pdf",
        "header": "东华大学多媒体教室运维系统 · 开发功能文档（内部）",
        "footer": "内部资料 · 请勿外传",
    },
    {
        "html": DOCS / "功能使用手册_v1.5.4.html",
        "pdf": DOCS / "东华大学多媒体教室运维系统_功能使用手册_v1.5.4.pdf",
        "header": "东华大学多媒体教室运维系统 · 功能使用手册",
        "footer": "东华大学信息中心 · 2026",
    },
]

HEADER = """<div style="font-family:'Microsoft YaHei',sans-serif;font-size:7.6pt;color:#8a94a6;width:100%;padding:0 16mm;display:flex;justify-content:space-between;letter-spacing:.02em;">
<span>{left}</span><span>v1.5.4</span></div>"""
FOOTER = """<div style="font-family:'Microsoft YaHei',sans-serif;font-size:7.6pt;color:#8a94a6;width:100%;padding:0 16mm;display:flex;justify-content:space-between;letter-spacing:.02em;">
<span>{left}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1200, "height": 1600})
        for doc in DOCS:
            page.goto(doc["html"].as_uri(), wait_until="load")
            page.wait_for_timeout(800)
            page.emulate_media(media="print")
            page.pdf(
                path=str(doc["pdf"]),
                format="A4",
                print_background=True,
                prefer_css_page_size=False,
                display_header_footer=True,
                header_template=HEADER.format(left=doc["header"]),
                footer_template=FOOTER.format(left=doc["footer"]),
                margin={"top": "14mm", "bottom": "13mm", "left": "0", "right": "0"},
            )
            print("written", doc["pdf"])
        browser.close()


if __name__ == "__main__":
    main()
