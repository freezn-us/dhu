# -*- coding: utf-8 -*-
"""生成《东华大学多媒体教室运维系统 · 开发架构文档》PDF（v3：新增架构图 / 模块关系图 + 真实页码 + 书签）"""
import os, io, math

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable,
    PageBreak, HRFlowable, LongTable
)
from reportlab.platypus.doctemplate import BaseDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ================= 字体 =================
FONT, FONT_B = 'CJK', 'CJKB'

def _reg(name, paths):
    for p in paths:
        if not os.path.exists(p):
            continue
        try:
            if p.lower().endswith('.ttc'):
                pdfmetrics.registerFont(TTFont(name, p, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont(name, p))
            return True
        except Exception:
            continue
    return False

if not _reg(FONT, ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyh.ttf',
                   'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/simsun.ttc']):
    FONT = 'Helvetica'
if not _reg(FONT_B, ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyhbd.ttf',
                     'C:/Windows/Fonts/simhei.ttf']):
    FONT_B = FONT

# ================= 配色 =================
BRAND      = HexColor('#1677ff')
BRAND_DARK = HexColor('#0d3d86')
ACCENT     = HexColor('#722ed1')
TEXT       = HexColor('#1f2937')
TEXT_MUTED = HexColor('#5b6472')
TEXT_CAP   = HexColor('#98a1ad')
BORDER     = HexColor('#dbe2ea')
LINE       = HexColor('#b9c4d2')
TABLE_ALT  = HexColor('#f7faff')
SOFT_BLUE  = HexColor('#eff6ff')
CHIP_BLUE  = HexColor('#e6f4ff')
SOFT_PURP  = HexColor('#f6f2ff')
SOFT_GREEN = HexColor('#f0fbf0')

CW = 170 * mm          # 正文宽度 ≈ 482pt
PX_W = 482.0           # 图内坐标宽度

# ================= 文本样式 =================
S = {
    'title':    ParagraphStyle('T',  fontName=FONT_B, fontSize=25, leading=34, textColor=BRAND_DARK,
                               alignment=TA_CENTER, spaceAfter=2, wordWrap='CJK'),
    'subtitle': ParagraphStyle('ST', fontName=FONT,   fontSize=11.5, leading=19, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceAfter=2, wordWrap='CJK'),
    'h1':       ParagraphStyle('H1', fontName=FONT_B, fontSize=17, leading=25, textColor=BRAND_DARK,
                               spaceBefore=16, spaceAfter=8, wordWrap='CJK'),
    'h2':       ParagraphStyle('H2', fontName=FONT_B, fontSize=13, leading=20, textColor=BRAND,
                               spaceBefore=13, spaceAfter=6, wordWrap='CJK'),
    'body':     ParagraphStyle('B',  fontName=FONT,   fontSize=10, leading=16.5, textColor=TEXT,
                               spaceAfter=6, wordWrap='CJK'),
    'note':     ParagraphStyle('N',  fontName=FONT,   fontSize=9.5, leading=15.5, textColor=BRAND_DARK,
                               backColor=SOFT_BLUE, borderColor=HexColor('#bae0ff'), borderWidth=0.5,
                               borderPadding=(6, 8, 6, 8), spaceBefore=8, spaceAfter=10, wordWrap='CJK'),
    'cap':      ParagraphStyle('C',  fontName=FONT,   fontSize=8.5, leading=12, textColor=TEXT_CAP,
                               alignment=TA_CENTER, spaceAfter=8, wordWrap='CJK'),
    'fig':      ParagraphStyle('FG', fontName=FONT,   fontSize=8.5, leading=13, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceBefore=5, spaceAfter=10, wordWrap='CJK'),
    'bullet':   ParagraphStyle('BL', fontName=FONT,   fontSize=10, leading=16, textColor=TEXT,
                               leftIndent=12, spaceAfter=3, wordWrap='CJK'),
    'th':       ParagraphStyle('TH', fontName=FONT_B, fontSize=9.2, leading=13, textColor=white,
                               wordWrap='CJK'),
    'td':       ParagraphStyle('TD', fontName=FONT,   fontSize=9,   leading=13.5, textColor=TEXT,
                               wordWrap='CJK'),
    'td_c':     ParagraphStyle('TDC', fontName=FONT,  fontSize=9,   leading=13.5, textColor=TEXT,
                               alignment=TA_CENTER, wordWrap='CJK'),
    'td_key':   ParagraphStyle('TDK', fontName=FONT_B, fontSize=9,  leading=13.5, textColor=BRAND_DARK,
                               wordWrap='CJK'),
}

def _esc(t):
    return (str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('\n', '<br/>'))

def P(text, style='td'):
    return Paragraph(_esc(text), S[style])

def build_table(data, widths_mm, align_center_cols=()):
    rows = []
    for ri, raw in enumerate(data):
        cells = []
        for ci, cell in enumerate(raw):
            if isinstance(cell, Paragraph):
                cells.append(cell)
            elif ri == 0:
                cells.append(P(cell, 'th'))
            elif ci in align_center_cols:
                cells.append(P(cell, 'td_c'))
            else:
                cells.append(P(cell, 'td'))
        rows.append(cells)
    total = sum(widths_mm)
    scale = 170.0 / total if total > 170 else 1.0
    t = LongTable(rows, colWidths=[w * scale * mm for w in widths_mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0), BRAND),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, 0), 7),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
        ('TOPPADDING',    (0, 1), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
        ('GRID',          (0, 0), (-1, -1), 0.4, BORDER),
        ('BOX',           (0, 0), (-1, -1), 0.9, BRAND),
    ]))
    return t

def divider(color=BRAND, thickness=1.4):
    return HRFlowable(width=CW, thickness=thickness, color=color, spaceBefore=3, spaceAfter=9)

# ================= 绘图基础件（坐标为「从上方起算」） =================
def _rrect(c, H, x, ytop, w, h, fill, stroke, lw=0.8, r=3.5):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(lw)
    c.roundRect(x, H - ytop - h, w, h, r, stroke=1, fill=1)

def _ctext(c, H, x, ytop, w, h, text, fs=7.4, bold=False, color=TEXT, dy=0):
    c.setFillColor(color)
    c.setFont(FONT_B if bold else FONT, fs)
    c.drawCentredString(x + w / 2.0, H - ytop - h / 2.0 - fs * 0.36 + dy, text)

def _ltext(c, H, x, ytop, text, fs=7.5, bold=False, color=TEXT):
    c.setFillColor(color)
    c.setFont(FONT_B if bold else FONT, fs)
    c.drawString(x, H - ytop - fs * 0.85, text)

def chip(c, H, x, ytop, w, h, label, fill=white, stroke=BORDER, fs=7.2, color=TEXT):
    _rrect(c, H, x, ytop, w, h, fill, stroke, 0.7, 3)
    _ctext(c, H, x, ytop, w, h, label, fs=fs, color=color)

def card(c, H, x, ytop, w, h, title, sub=None, fill=white, stroke=BRAND, fs=7.8, tcolor=TEXT):
    _rrect(c, H, x, ytop, w, h, fill, stroke, 0.85, 4)
    if sub:
        c.setFillColor(tcolor)
        c.setFont(FONT_B, fs)
        c.drawCentredString(x + w / 2.0, H - ytop - h / 2.0 + 1.2, title)
        c.setFillColor(TEXT_MUTED)
        c.setFont(FONT, fs - 1.4)
        c.drawCentredString(x + w / 2.0, H - ytop - h / 2.0 - 8.0, sub)
    else:
        _ctext(c, H, x, ytop, w, h, title, fs=fs, bold=True, color=tcolor)

def band(c, H, ytop, h, title, sub=''):
    _rrect(c, H, 0, ytop, PX_W, h, SOFT_BLUE, BRAND, 0.9, 5)
    c.setFillColor(BRAND_DARK)
    c.setFont(FONT_B, 9)
    c.drawString(10, H - ytop - 14, title)
    if sub:
        c.setFillColor(TEXT_MUTED)
        c.setFont(FONT, 7.4)
        c.drawString(10 + c.stringWidth(title, FONT_B, 9) + 8, H - ytop - 14, sub)

def arrow(c, H, x1, y1, x2, y2, color=BRAND, dash=None, lw=1.0, head=4.6, both=False):
    X1, Y1, X2, Y2 = x1, H - y1, x2, H - y2
    dx, dy = X2 - X1, Y2 - Y1
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    px, py = -uy, ux
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    c.setDash(dash, 2.6) if dash else c.setDash()
    c.line(X1 + ux * (head if both else 0), Y1 + uy * (head if both else 0), X2 - ux * head, Y2 - uy * head)
    c.setDash()
    c.setFillColor(color)
    tips = [(X2, Y2, X2 - ux * head, Y2 - uy * head)]
    if both:
        tips.append((X1, Y1, X1 + ux * head, Y1 + uy * head))
    for tipx, tipy, bx, by in tips:
        p = c.beginPath()
        p.moveTo(tipx, tipy)
        p.lineTo(bx + px * 3.1, by + py * 3.1)
        p.lineTo(bx - px * 3.1, by - py * 3.1)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

class Diagram(Flowable):
    def __init__(self, height, painter):
        Flowable.__init__(self)
        self.width = CW
        self.height = height
        self.painter = painter
    def wrap(self, aw, ah):
        return (self.width, self.height)
    def draw(self):
        self.painter(self.canv, self.width, self.height)

# ================= 图 1：分层架构与数据流 =================
def paint_arch(c, W, H):
    c.setFillColor(white)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # ---- ① 前端视图层 ----
    band(c, H, 8, 86, '① 前端视图层', '原生 JS（IIFE 模块化）· 12 个功能页面 · 单 HTML 入口')
    pages1 = ['工作台', '每日日志', '来电登记', '日志录入', '日志查询', '巡视管理', '统计报表', '教室档案']
    for i, n in enumerate(pages1):
        chip(c, H, 10 + i * 58, 32, 54, 18, n,
             fill=CHIP_BLUE if n == '统计报表' else white,
             stroke=BRAND if n == '统计报表' else BORDER)
    pages2 = ['基础配置', '用户权限', '导入导出', '审计日志']
    for i, n in enumerate(pages2):
        chip(c, H, 10 + i * 58, 56, 54, 18, n)
    _ltext(c, H, 10, 79, '公共层：Store 状态管理 · UI 图表/模态 · App 路由 · window.Views.* 页面接口',
           fs=7.2, color=TEXT_MUTED)

    # ---- ② 后端 API 层 ----
    band(c, H, 118, 68, '② 后端 API 层', 'Flask · server.py 单文件 · 约 25 个路由')
    apis = [('登录鉴权', '3 个接口'), ('状态与备份', '6 个接口'), ('用户与权限', '8 个接口'),
            ('数据仓库报表', '6 个接口'), ('审计日志', '2 个接口')]
    for i, (t, s) in enumerate(apis):
        x = 10 + i * 91
        card(c, H, x, 144, 86, 22, t, s,
             fill=CHIP_BLUE if t == '数据仓库报表' else white,
             stroke=BRAND, fs=7.2)
    _ltext(c, H, 10, 171, '全部接口统一 @require_auth 鉴权；管理员接口再加 @require_admin 校验',
           fs=7, color=TEXT_MUTED)

    # ---- ③ 数据层 ----
    band(c, H, 210, 80, '③ 数据层', 'SQLite 单文件 · 主存储与数据仓库双写')
    card(c, H, 10, 234, 136, 38, '主存储', 'state 表 · JSON blob', fill=white, stroke=BRAND, fs=7.6)
    card(c, H, 156, 234, 180, 38, '数据仓库 mart 表',
         'tickets / patrols / devices · 13 个索引', fill=SOFT_PURP, stroke=ACCENT, fs=7.6)
    card(c, H, 346, 234, 124, 38, '账号权限表',
         'users / sessions / audit_logs', fill=white, stroke=BRAND, fs=7.6)
    _ltext(c, H, 10, 276, '同步策略：启动时 mart_backfill() 幂等回填 · 每次写 state 触发 mart_sync() · 失败不影响主写入',
           fs=7, color=TEXT_MUTED)

    # ---- ④ 部署层 ----
    band(c, H, 314, 60, '④ 部署打包层', 'PyInstaller · 三个 exe · 一键安装与回滚')
    exes = [('dhu-ops-server.exe', '8442 端口服务'), ('DHU-Ops-Launcher.exe', '桌面快捷启动'),
            ('DHU-Ops-Setup.exe', '安装与回滚')]
    for i, (t, s) in enumerate(exes):
        card(c, H, 10 + i * 157, 340, 146, 26, t, s, fill=white, stroke=BRAND, fs=7.2)

    # ---- 层间箭头 ----
    arrow(c, H, 241, 94, 241, 118, BRAND, lw=1.2, both=True)
    _ltext(c, H, 248, 110, 'HTTP JSON · Bearer Token', fs=7, color=BRAND)
    arrow(c, H, 241, 186, 241, 210, ACCENT, lw=1.2, both=True)
    _ltext(c, H, 248, 202, 'mart_sync() 双写同步', fs=7, color=ACCENT)
    arrow(c, H, 241, 290, 241, 314, LINE, lw=1.2)
    _ltext(c, H, 248, 306, 'PyInstaller 打包发布', fs=7, color=TEXT_MUTED)

# ================= 图 2：模块逻辑关系与业务闭环 =================
def paint_logic(c, W, H):
    c.setFillColor(white)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # 主链路
    main = [('来电登记', '接到报修诉求'), ('工单派单', '指派责任工程师'), ('现场处理', '到场处理与反馈'),
            ('日志归档', '补录工作内容'), ('统计报表', '汇总与导出')]
    xs = [13, 109, 205, 301, 397]
    for x, (n, s) in zip(xs, main):
        fill = CHIP_BLUE if n in ('来电登记', '统计报表') else white
        card(c, H, x, 100, 72, 42, n, s, fill=fill, stroke=BRAND, fs=7.6)

    for i in range(4):
        arrow(c, H, xs[i] + 72, 121, xs[i + 1], 121, BRAND, lw=1.1)

    # 下方：设备档案（虚线引用）
    card(c, H, 109, 176, 72, 36, '教室 / 设备档案', None, fill=SOFT_GREEN,
         stroke=HexColor('#8fd18f'), fs=7.3)
    arrow(c, H, 145, 176, 145, 142, HexColor('#8fd18f'), dash=(2.2, 2.2), lw=1.0)
    c.setFillColor(TEXT_MUTED)
    c.setFont(FONT, 6.8)
    c.drawString(152, H - 162, '查询设备归属与保修')

    # 下方：巡视 → 异常转工单（虚线进入主链路）
    card(c, H, 13, 16, 72, 36, '巡视管理', None, fill=SOFT_PURP, stroke=ACCENT, fs=7.6)
    card(c, H, 109, 16, 72, 36, '异常转工单', None, fill=SOFT_PURP, stroke=ACCENT, fs=7.6)
    arrow(c, H, 85, 34, 109, 34, ACCENT, lw=1.0)
    arrow(c, H, 145, 16, 145, 100, ACCENT, dash=(2.2, 2.2), lw=1.0)
    c.setFillColor(TEXT_MUTED)
    c.setFont(FONT, 6.8)
    c.drawString(150, H - 62, '巡视发现异常时转入工单')

    # 右侧：权限与审计（贯穿全流程）
    c.setFillColor(SOFT_BLUE)
    c.setStrokeColor(BRAND)
    c.setLineWidth(0.8)
    c.setDash(2.2, 2.2)
    c.roundRect(301, H - 76, 168, 26, 4, stroke=1, fill=0)
    c.setDash()
    c.setFillColor(BRAND_DARK)
    c.setFont(FONT, 7.2)
    c.drawCentredString(385, H - 60, '用户权限：控制 12 个菜单的可见性')
    c.drawCentredString(385, H - 71, '审计日志：记录全部关键操作与字段变更')

# ================= 文档模板（收集标题 → 生成真实目录页码 + 书签） =================
class ArchDoc(SimpleDocTemplate):
    def __init__(self, fn, **kw):
        SimpleDocTemplate.__init__(self, fn, **kw)
        self.headings = []

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ('H1', 'H2'):
            txt = flowable.getPlainText()
            lvl = 0 if flowable.style.name == 'H1' else 1
            key = 'sec_%d' % len(self.headings)
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(txt, key, level=lvl, closed=False)
            self.headings.append((txt, self.page, lvl))

def make_page_rules(total):
    def draw(cv, doc):
        cv.saveState()
        cv.setFont(FONT, 8)
        cv.setFillColor(TEXT_CAP)
        cv.drawString(20 * mm, A4[1] - 12 * mm, '东华大学多媒体教室运维系统 · 开发架构文档')
        cv.setFillColor(BRAND)
        cv.drawRightString(A4[0] - 20 * mm, A4[1] - 12 * mm, 'v1.2.0 · 2026-11-11')
        cv.setStrokeColor(BORDER)
        cv.setLineWidth(0.6)
        cv.line(20 * mm, A4[1] - 14.5 * mm, A4[0] - 20 * mm, A4[1] - 14.5 * mm)
        cv.line(20 * mm, 13.5 * mm, A4[0] - 20 * mm, 13.5 * mm)
        cv.setFillColor(TEXT_CAP)
        cv.drawCentredString(A4[0] / 2, 8.5 * mm, '第 %d 页 / 共 %d 页' % (doc.page, total or doc.page))
        cv.restoreState()
    return draw

TOC_TITLES = ['一、项目画像', '二、整体架构与模块关系', '三、核心数据流',
              '四、技术选型说明', '五、优势与亮点', '六、待改进空间（按优先级）', '七、版本历史']

# ================= 正文 =================
def build_story(toc_pages=None):
    toc_pages = toc_pages or {}
    st = []
    W = CW

    # ---------- 封面 ----------
    st.append(Spacer(1, 56 * mm))
    st.append(Paragraph('东华大学多媒体教室运维系统', S['title']))
    st.append(Spacer(1, 2 * mm))
    st.append(Paragraph('开发架构文档', ParagraphStyle('CT', parent=S['title'], fontSize=21)))
    st.append(Spacer(1, 10 * mm))
    st.append(HRFlowable(width=95 * mm, thickness=2.4, color=BRAND_DARK,
                         spaceBefore=0, spaceAfter=0, hAlign='CENTER'))
    st.append(Spacer(1, 9 * mm))
    st.append(Paragraph('v1.2.0 · 2026-11-11', ParagraphStyle('CV', parent=S['subtitle'], fontSize=12.5)))
    st.append(Spacer(1, 7 * mm))
    for line in ['Flask + SQLite 后端 · 原生 JS IIFE 前端',
                 'PyInstaller 一键打包 · 完全离线可用',
                 '数据仓库 mart 表 · SQL 聚合报表']:
        st.append(Paragraph(line, S['subtitle']))
    st.append(Spacer(1, 26 * mm))
    st.append(Paragraph('文档用途：项目留档 · 新人交接 · 架构评审', S['cap']))
    st.append(PageBreak())

    # ---------- 目录 ----------
    st.append(Paragraph('目  录', S['h1']))
    st.append(divider())
    toc_rows = []
    for t in TOC_TITLES:
        pg = toc_pages.get(t, '')
        toc_rows.append([P(t, 'td_key'), P(pg, 'td_c')])
    tt = Table(toc_rows, colWidths=[W * 0.88, W * 0.12])
    tt.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, HexColor('#eef2f7')),
        ('LINEBELOW', (0, -1), (-1, -1), 0.8, BORDER),
    ]))
    st.append(tt)
    st.append(Spacer(1, 8))
    st.append(Paragraph('文档包含 2 幅架构图：图 1 分层架构与数据流，图 2 模块逻辑关系与业务闭环。'
                        'PDF 左侧书签栏可直接跳转各章节。', S['cap']))
    st.append(PageBreak())

    # ---------- 一、项目画像 ----------
    st.append(Paragraph('一、项目画像', S['h1']))
    st.append(divider())
    st.append(Paragraph('东华大学多媒体教室运维系统是一套面向高校多媒体教室运维场景的轻量级运维平台。'
                        '采用前后端一体的单 exe 交付模式，服务端内置 SQLite 数据库，前端为原生 JS 单页应用，'
                        '完全离线可用，无需 Python 运行时或 Web 服务器前置。', S['body']))
    st.append(Spacer(1, 4))
    st.append(build_table([
        ['维度', '内容'],
        ['后端核心代码', 'server.py · 约 1700 行（Flask + SQLite，单文件）'],
        ['前端代码文件', '1 个 HTML + 17 个 JS（IIFE 模块化）'],
        ['运行时依赖', '仅 Flask + Python 3.7.3 标准库子集，无 ORM、无外部数据库'],
        ['打包后产物', '3 个 exe · 总计约 40 MB'],
        ['前端功能页面', '12 个（8 个业务页面 + 4 个配置页面）'],
        ['SQLite 表', 'state / users / sessions / audit_logs / user_permissions / user_groups / '
                      'group_members / group_permissions，另有 3 张数据仓库 mart 表'],
        ['后端 API 路由', '登录 3 个 + 状态备份 6 个 + 用户权限 8 个 + 报表 6 个 + 审计 2 个，合计约 25 个'],
        ['版本迭代节奏', 'v1.0.9 → v1.2.0 · 2 周内累计 14 个发布版本'],
        ['安装与回滚', '一键安装 Setup.exe · rollback.ps1 自动回滚'],
        ['部署环境', 'Windows Server 桌面版 · 无需 IIS / Nginx · 无需 Python 前置'],
        ['测试脚本', 'tests/ 目录 13 个（smoke / import / export / pdf / patrol / selftest 等）'],
        ['离线能力', '完全离线可用（单机数据 + 本地服务）'],
    ], [34, 136]))
    st.append(PageBreak())

    # ---------- 二、整体架构与模块关系 ----------
    st.append(Paragraph('二、整体架构与模块关系', S['h1']))
    st.append(divider())

    st.append(Paragraph('（一）分层架构与数据流', S['h2']))
    st.append(Paragraph('系统自上而下分为四层：前端视图层、后端 API 层、数据层、部署打包层。'
                        '层与层之间只通过明确的接口与文件约定交互，任一层都可以单独替换或升级。', S['body']))
    st.append(Spacer(1, 2))
    st.append(Diagram(384, paint_arch))
    st.append(Paragraph('图 1  系统分层架构与数据流（双箭头表示请求 / 响应的双向通道，虚线箭头表示打包产物生成方向）', S['fig']))

    st.append(Paragraph('（二）各层职责明细', S['h2']))
    st.append(build_table([
        ['层级', '技术形态', '核心内容'],
        ['① 前端视图层', '原生 JS（IIFE 模块化）',
         '业务页面：views-dashboard 工作台 · views-daily-log 每日工作日志 · views-intake 来电登记 · '
         'views-log-entry 单条日志录入 · views-tickets 日志查询 · views-patrol 巡视管理 · '
         'views-reports 统计报表（v1.2 接后端 API + 巡视 + 设备）· views-assets 教室/设备档案\n'
         '配置页面：views-settings 基础配置 · views-user-manage 用户权限 · views-data 导入导出 · '
         'views-audit 审计日志\n'
         '公共层：Store 状态管理 · UI 图表与模态 · App 路由 · window.Views.* 页面接口'],
        ['② 后端 API 层', 'Flask · server.py 单文件',
         '【登录鉴权】POST /api/login · /api/logout · GET /api/me\n'
         '【状态与备份】GET/POST /api/state · POST /api/backup · POST /api/backup/restore · GET /api/export/*\n'
         '【用户权限（RBAC）】/api/users · /api/users/<name> · /api/users/<name>/permissions · '
         '/api/users/<name>/groups · /api/groups 及其权限接口\n'
         '【数据仓库报表（v1.2 新增）】/api/report/summary · trend · patrol · device/summary · '
         'device/warranty · compare\n'
         '【审计日志】POST /api/audit（前端埋点批量提交）· GET /api/audit（分页 + 模块筛选 + 中文业务化详情）'],
        ['③ 数据层', 'SQLite · 双写架构',
         '【主存储】state 表（id=1, json TEXT），包含 settings · tickets[] · patrols[] · '
         'assets.devices[] · kb.articles[]\n'
         '【数据仓库 mart 表】tickets_mart（28 列 + 7 索引）· patrols_mart（17 列 + 2 索引）· '
         'devices_mart（14 列 + 4 索引）\n'
         '【账号权限表】users（SHA-256 + salt 哈希）· sessions（Bearer token）· '
         'audit_logs（MAX = 20 万条，超期 FIFO）\n'
         '【同步机制】启动时 mart_backfill() 幂等回填 · 每次 POST /api/state 触发 mart_sync() 全量同步 · '
         '同步失败不阻塞主写入'],
        ['④ 部署打包层', 'PyInstaller · 三 exe 一键安装',
         '【dhu-ops-server.exe】Flask 服务端 · port.txt 端口配置 · 数据目录 ProgramData\\DHU-Ops\\dhu_ops.db\n'
         '【DHU-Ops-Launcher.exe】桌面/开始菜单快捷方式 · 探活服务进程 → 拉起服务 → '
         '以 Edge --app 应用窗口打开\n'
         '【DHU-Ops-Setup.exe】UAC 管理员权限 · 自动备份旧版本到 versions/ · rollback.ps1 一键回滚'],
    ], [24, 38, 108]))

    # ---------- 模块逻辑关系 ----------
    st.append(Paragraph('（三）模块逻辑关系与业务闭环', S['h2']))
    st.append(Paragraph('业务主线为「来电登记 → 工单派单 → 现场处理 → 日志归档 → 统计报表」。'
                        '巡视管理与设备档案是两个旁路数据源：巡视发现异常时可直接转入工单，'
                        '设备档案为派单与处理提供归属、品牌、保修等基础信息。'
                        '用户权限与审计日志则以横切方式贯穿全部环节。', S['body']))
    st.append(Spacer(1, 2))
    st.append(Diagram(220, paint_logic))
    st.append(Paragraph('图 2  模块逻辑关系与业务闭环（实线为业务流转，虚线为数据引用或异常转入，'
                        '蓝色虚线框为贯穿全流程的横切能力）', S['fig']))

    st.append(build_table([
        ['关系类型', '起点 → 终点', '业务含义'],
        ['主流程', '来电登记 → 工单派单 → 现场处理 → 日志归档 → 统计报表',
         '一次报修的完整生命周期；每一环节都写入时间戳，用于响应时长与 SLA 计算'],
        ['数据引用', '教室 / 设备档案 → 工单派单',
         '派单时依据设备归属与保修状态判断责任楼宇、是否走厂商保修'],
        ['异常转入', '巡视管理 → 异常转工单 → 工单派单',
         '巡视发现的异常不必重新来电登记，直接生成工单并复用派单流程'],
        ['数据汇总', '日志归档 → 统计报表 → 数据仓库 mart 表',
         '归档数据经 mart_sync 进入数据仓库，报表通过 SQL 聚合生成趋势与对比'],
        ['横切能力', '用户权限 / 审计日志 → 全部模块',
         '权限控制 12 个菜单的可见性；审计记录登录、页面访问与全部关键字段变更'],
    ], [22, 66, 82]))

    # ---------- 三、核心数据流 ----------
    st.append(Paragraph('三、核心数据流', S['h1']))
    st.append(divider())
    st.append(Paragraph('整个系统采用「前端全量提交 → 后端主存储 + 数据仓库双写」的单页面应用模式，'
                        '对应图 1 中层级之间标注的三条通道。', S['body']))
    st.append(Spacer(1, 4))
    st.append(build_table([
        ['步骤', '环节', '说明'],
        ['①', '前端 Store.save()', '业务操作完成后，Store 将完整 state 序列化为 JSON，触发 POST /api/state'],
        ['②', 'POST /api/state', '后端接收 JSON blob，校验数据格式（必须包含 tickets 列表），不合法直接返回 400'],
        ['③', '写入主存储', '执行 INSERT OR REPLACE INTO state (id=1, json, updated_at)，保证单行覆盖写入'],
        ['④', 'mart_sync() 同步', '从 state JSON 解析出工单/巡视/设备，DELETE + INSERT 三张 mart 表（幂等覆盖）'],
        ['⑤', '报表 SQL 聚合', '后续 /api/report/* 请求直接走 SQLite 聚合（GROUP BY / COUNT / SUM / strftime）'],
    ], [12, 40, 118], align_center_cols=(0,)))
    st.append(Paragraph('设计意图：先用 JSON blob 保证业务迭代灵活，再叠加 SQL 层解决性能与多维统计问题，做到零停机、'
                        '零迁移。服务启动时 mart_backfill() 会检测「state 有数据但 mart 表为空」的情况并自动一次性回填，'
                        '老用户升级零感知；mart_sync 失败只记录日志、回滚 mart 事务，不影响主数据写入。', S['note']))
    st.append(PageBreak())

    # ---------- 四、技术选型 ----------
    st.append(Paragraph('四、技术选型说明', S['h1']))
    st.append(divider())
    st.append(build_table([
        ['层次', '技术', '选型理由', '对比方案'],
        ['后端框架', 'Flask',
         '轻量、无工程化负担，适合单文件打包；PyInstaller 兼容性好，启动快',
         'Django（偏重）· FastAPI（需 ASGI 前置）'],
        ['数据库', 'SQLite（Python 标准库自带）',
         '零外部依赖，可直接打包进 exe；单机运维场景性能完全够用',
         'MySQL / PostgreSQL（需独立安装维护）'],
        ['密码存储', 'SHA-256 + salt + pepper',
         '无第三方依赖；salt 存 users 表、pepper 写在代码中，拿到数据库文件也无法离线破解',
         'bcrypt / argon2（需额外安装）'],
        ['前端形态', '原生 JS（IIFE 模块化）',
         '无 npm、无 webpack，总体积约 200 KB；可直接改文件即时生效，排障成本低',
         'React（约 1 MB）· Vue（约 300 KB）'],
        ['打包工具', 'PyInstaller --onefile',
         '支持 Flask + SQLite + Pillow 图标，三 exe 全自动打包，产物可直接交付',
         'cx_Freeze（Windows 兼容性弱）· Nuitka（编译慢）'],
        ['PDF 导出', 'html2canvas + jsPDF（浏览器端）',
         '无需后端依赖，离线可用；不受服务器字体版权限制',
         'ReportLab（需后端）· wkhtmltopdf（需另装）'],
        ['报表聚合', 'SQLite GROUP BY / strftime',
         '零安装，10 万条内为毫秒级；可针对常用维度建索引加速',
         'Pandas / NumPy（需额外安装）'],
    ], [22, 36, 66, 46]))
    st.append(PageBreak())

    # ---------- 五、优势与亮点 ----------
    st.append(Paragraph('五、优势与亮点', S['h1']))
    st.append(divider())
    st.append(Paragraph('按「架构设计 → 产品体验 → 安全运维」三个维度，整理出系统中值得称赞、应当保持的设计：', S['body']))
    st.append(Spacer(1, 4))

    st.append(Paragraph('（一）架构设计层面', S['h2']))
    st.append(build_table([
        ['#', '亮点', '价值说明'],
        ['1', '渐进式数据架构（JSON blob + SQL mart 双写）',
         '业务迭代灵活，性能需要时再叠加 SQL 层，零停机零迁移。mart_backfill() 让老用户升级无感，'
         '是本系统最关键的架构决策'],
        ['2', '单文件后端 server.py（约 1700 行）',
         'Flask + SQLite 零外部依赖，PyInstaller 可打成单 exe。相比 Django + MySQL 方案，'
         '部署与排障成本低一个数量级'],
        ['3', '前端 IIFE 模块化（Store / UI / App / Views.*）',
         '原生 JS 但模块边界清晰，Views.reports.render() 即页面入口；无 build 步骤，体积小，'
         '可直接在生产环境调试'],
        ['4', 'RBAC 权限分层（用户 → 组 → 权限点，支持个人覆盖）',
         '12 个权限点精确到菜单级，同时支持用户直接授权与组继承，贴合管理员 / 主管 / 客服 / 工程师四类角色'],
        ['5', '审计全链路业务化（auditDiff / perm_change_text）',
         '前端埋点时即生成中文描述（如「修改教室 2113：容量 150 → 120」），后端不做二次转换；'
         '审计详情无英文表名与字段名，可直接阅读'],
    ], [8, 52, 110], align_center_cols=(0,)))
    st.append(Spacer(1, 8))

    st.append(Paragraph('（二）产品体验层面', S['h2']))
    st.append(build_table([
        ['#', '亮点', '价值说明'],
        ['6', '一键安装 + 一键回滚（Setup.exe + rollback.ps1）',
         '安装器自动备份旧版本到 versions/，配合 releases/v* 版本化发布，运维人员可自行完成升级与回滚，'
         '无需开发到场'],
        ['7', '桌面启动器（Edge --app 模式）',
         'Launcher.exe 自动探活、拉起服务并以应用窗口打开，无地址栏无标签页，体验接近本地客户端'],
        ['8', '完全离线可用',
         '服务端 Flask + 本地 SQLite，无任何外网依赖，适配实验室/内网断网环境；云端备份为可选能力'],
        ['9', '移动端自适应',
         '工作台、日志查询、巡视、日志录入四个核心页面具备独立移动端布局，工程师可用手机快速登记与填报'],
        ['10', '导入模板 + 多格式导出',
         '内置官方 Excel 模板，导出支持 Excel（6 个工作表）、CSV、PDF，便于数据迁移与交接'],
        ['11', '演示数据一键生成（Store.seedDemo）',
         '重置后可自动生成工作日志、巡视记录、设备台账，新环境初始化无需手工录入'],
    ], [8, 52, 110], align_center_cols=(0,)))
    st.append(Spacer(1, 8))

    st.append(PageBreak())

    st.append(Paragraph('（三）安全与运维层面', S['h2']))
    st.append(build_table([
        ['#', '亮点', '价值说明'],
        ['12', '密码 SHA-256 + salt + pepper',
         '即使数据库文件被直接获取，也无法反推明文密码'],
        ['13', 'Bearer Token 会话管理（sessions 表，可配置过期）',
         '支持服务端撤销会话，管理员可强制下线异常登录'],
        ['14', '审计日志自动保留（MAX = 20 万条，超期 FIFO）',
         '避免长期运行导致 SQLite 膨胀；按当前操作量估算可覆盖 3 至 5 年'],
        ['15', '服务端口三优先级探测',
         '环境变量 → 程序目录 port.txt（兼容 BOM）→ 默认 8420，端口冲突时可随时调整'],
    ], [8, 52, 110], align_center_cols=(0,)))

    # ---------- 六、改进空间 ----------
    st.append(Paragraph('六、待改进空间（按优先级）', S['h1']))
    st.append(divider())

    st.append(Paragraph('（一）P0 · 架构债（建议优先处理）', S['h2']))
    st.append(build_table([
        ['#', '问题', '具体表现', '改进建议'],
        ['1', 'server.py 单文件 1700 行',
         'API 路由、数据访问、权限校验、报表逻辑、审计逻辑全部混在一起，改一处要翻多个位置',
         '拆分为 routes/（auth / state / reports / audit）与 lib/（db / audit / perms），'
         '入口文件仅保留初始化'],
        ['2', 'mart_sync 仍为全量同步',
         '每次 POST /api/state 都先 DELETE 三张表再重新 INSERT，工单超过 5000 条后写入耗时会明显上升',
         '改为增量同步：为前端每条记录维护 updatedAt，或拆出独立的增删改 API；'
         '也可给 mart 表加 version 字段做差异比对'],
        ['3', '前端兜底计算与后端 API 口径不一致',
         'mart 表字段名 created_at 与前端 JSON 字段 createdAt 不完全对应，'
         '降级计算结果可能与后端 summary 存在差异',
         '统一字段命名规范，补一次端到端数据比对测试；长期目标是前端只调 API，'
         '移除本地 Store.stats()'],
    ], [8, 38, 58, 66], align_center_cols=(0,)))
    st.append(Spacer(1, 8))

    st.append(Paragraph('（二）P1 · 功能补全（中期规划）', S['h2']))
    st.append(build_table([
        ['#', '改进项', '说明'],
        ['4', '工程师绩效维度单一',
         '目前仅有处理量、平均时长、满意度，缺少重复报修率、SLA 及时率、工作量分布标准差、备件消耗等指标'],
        ['5', '工单状态流转缺少显式定义',
         '未定义状态机（assigned → processing → resolved 的触发条件与操作人），容易出现乱序操作'],
        ['6', '通知渠道缺失',
         '派单后工程师只能登录系统查看；缺少邮件、企业微信、钉钉等 Webhook 推送，手机端无法即时收到'],
        ['7', '缺少定时任务调度',
         '没有内置调度器；定时备份、定时报表推送、超期审计清理目前只能依赖 Windows 任务计划程序'],
        ['8', '报表对比维度偏少',
         '对比接口仅支持两个自定义区间，可扩展同比、环比、按教学阶段对比、按楼宇/工程师对比'],
        ['9', 'PDF 仍为前端截图方案',
         'html2canvas 截图存在中文排版错位、分页不准、体积偏大的问题；后端生成 PDF（ReportLab）更稳定'],
    ], [8, 44, 118], align_center_cols=(0,)))
    st.append(Spacer(1, 8))

    st.append(Paragraph('（三）P2 · 产品化加分（长期考虑）', S['h2']))
    st.append(build_table([
        ['#', '改进项', '说明'],
        ['10', '缺少异常预警机制',
         '目前只有事后统计，没有实时告警：工单超 SLA、同一教室连续 N 天报修、备件低于阈值、'
         '工程师积压工单超过 N 条等场景均无提醒'],
        ['11', '缺少可视化大屏',
         '可增加面向中控墙的实时 KPI 看板；当前工作台仍以业务列表为主'],
        ['12', '知识库功能闲置',
         'kb.articles 已有表结构但无界面，教师课件、设备说明书、故障处理手册缺少承载位置'],
        ['13', '不支持多校区 / 多租户',
         '校区信息硬编码，若要服务其他学校需引入 org_id 字段做数据隔离'],
        ['14', '测试覆盖不足',
         'tests/ 目前为 smoke 与手工验证脚本，缺少 pytest 单元测试与回归用例，核心逻辑改动缺少保障'],
        ['15', '前端文案未做国际化',
         '中文字符串为硬编码；面向外部交付时建议至少抽出语言包'],
    ], [8, 44, 118], align_center_cols=(0,)))

    # ---------- 七、版本历史 ----------
    st.append(Paragraph('七、版本历史', S['h1']))
    st.append(divider())
    st.append(build_table([
        ['版本', '日期', '主题', '主要变更'],
        ['v1.2.0', '2026-11-11', '核心架构升级',
         '新增数据仓库 mart 表（tickets / patrols / devices）及索引；\n'
         'mart_sync() 双写 + mart_backfill() 启动自动回填，老用户零感知；\n'
         '新增 6 个后端报表 API（summary / trend / patrol / device/summary / device/warranty / compare）；\n'
         '报表页接入后端 API，新增巡视完成率、异常 TOP、参与人工作量、设备台账、保修预警等区块；\n'
         'API 失败时自动降级为本地计算，报表不会空白'],
        ['v1.1.14', '2026-11-11', '审计日志业务化',
         '审计详情改为中文业务化描述：权限变更显示新增/收回的页面及当前可访问清单；\n'
         '用户、日志、教室、设备、工程师、巡视配置等修改显示字段新旧值；旧记录自动转换；\n'
         '审计列表「类别」改为「模块」并显示中文菜单名'],
        ['v1.1.13', '2026-11-10', '桌面启动器',
         '新增 launcher.py：探活服务进程 → 拉起服务 → 以 Edge --app 应用窗口打开；\n'
         '安装器自动创建桌面与开始菜单快捷方式'],
        ['v1.1.12', '2026-11-08', '图形化安装器',
         '新增 installer_gui.py（Tkinter + Pillow）；一键安装、自动备份旧版本、rollback.ps1 一键回滚'],
        ['v1.1.9', '2026-11-06', 'RBAC 权限系统',
         '新增 user_groups / group_members / group_permissions 三张表；\n'
         '落地 12 个菜单级权限点（工作台、来电登记、日志、巡视、报表、设置等）'],
        ['v1.0.9', '2026-10-25', '初始发布',
         'Flask + SQLite + 原生 JS 基础框架；来电登记到工单闭环、巡视管理、统计报表、设备台账'],
    ], [16, 22, 30, 102]))
    st.append(Spacer(1, 14))

    st.append(divider(BRAND_DARK, thickness=2))
    st.append(Paragraph('结语', S['h2']))
    st.append(Paragraph('本系统已具备商业化产品的雏形，其中「渐进式数据架构」「单文件后端」「桌面应用化交付」等决策，'
                        '比许多学院派方案更贴合高校实际运维场景。当前核心架构债只有一项，即 mart 表的全量同步；'
                        '解决后该架构可支撑万级工单与千级巡视记录，足以覆盖一所完整高校的多媒体教室运维需求。', S['body']))
    st.append(Paragraph('最值得放大的两个差异化优势：', S['body']))
    st.append(Paragraph('· 一键安装 + 一键回滚：运维人员可独立完成升级与回退，不依赖开发到场', S['bullet']))
    st.append(Paragraph('· 审计日志中文业务化：可直接作为管理依据，贴近度优于多数通用 SaaS', S['bullet']))
    st.append(Spacer(1, 18))
    st.append(Paragraph('— 文档完 —', ParagraphStyle('END', parent=S['cap'], fontSize=10)))
    return st

# ================= 主流程 =================
def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, 'docs')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, '东华大学多媒体教室运维系统_开发架构文档_v1.2.0.pdf')

    meta = dict(pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                topMargin=20 * mm, bottomMargin=18 * mm,
                title='东华大学多媒体教室运维系统 · 开发架构文档',
                author='DHU-Ops Development Team',
                subject='v1.2.0 开发架构文档')

    # 第一遍：收集章节页码
    buf = io.BytesIO()
    d1 = ArchDoc(buf, **meta)
    d1.build(build_story(), onFirstPage=make_page_rules(None),
             onLaterPages=make_page_rules(None))
    toc_map = {}
    for txt, pg, lvl in d1.headings:
        if lvl == 0:
            toc_map[txt] = 'P%d' % pg

    # 第二遍：写入真实页码
    d2 = ArchDoc(out_path, **meta)
    d2.build(build_story(toc_map), onFirstPage=make_page_rules(d1.page),
             onLaterPages=make_page_rules(d1.page))

    print('OK:', out_path)
    print('Pages:', d2.page)
    print('Size: %.1f KB' % (os.path.getsize(out_path) / 1024.0))
    print('TOC:', toc_map)


if __name__ == '__main__':
    main()
