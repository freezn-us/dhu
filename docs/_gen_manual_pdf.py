# -*- coding: utf-8 -*-
"""生成《东华大学多媒体教室运维系统 · 使用手册》PDF —— 面向真实用户 / 小白可读 / 商业性表达"""
import os, io, math, time

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable,
    PageBreak, HRFlowable, LongTable, Image as RLImage
)
from reportlab.platypus.doctemplate import BaseDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCREENS = os.path.join(HERE, '_screens')
OUT = os.path.join(HERE, '东华大学多媒体教室运维系统_使用手册_v1.3.0.pdf')

# ================= 字体（同架构文档，复用） =================
FONT, FONT_B = 'CJK', 'CJKB'
FONT_M = 'CJK'   # 等宽数字暂用雅黑

def _reg(name, paths):
    for p in paths:
        if not os.path.exists(p): continue
        try:
            if p.lower().endswith('.ttc'):
                pdfmetrics.registerFont(TTFont(name, p, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont(name, p))
            return True
        except Exception: continue
    return False

_reg(FONT, ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyh.ttf', 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/simsun.ttc'])
_reg(FONT_B, ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyhbd.ttf', 'C:/Windows/Fonts/simhei.ttf'])

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
SOFT_AMBER = HexColor('#fffbe6')
AMBER      = HexColor('#faad14')

CW = 170 * mm          # 正文宽度 ≈ 482pt
PX_W = 482.0

# ================= 文本样式 =================
S = {
    'title':    ParagraphStyle('T',  fontName=FONT_B, fontSize=28, leading=38, textColor=BRAND_DARK,
                               alignment=TA_CENTER, spaceAfter=4, wordWrap='CJK'),
    'subtitle': ParagraphStyle('ST', fontName=FONT,   fontSize=12, leading=20, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceAfter=4, wordWrap='CJK'),
    'brand':    ParagraphStyle('BR', fontName=FONT_B, fontSize=14, leading=22, textColor=BRAND,
                               alignment=TA_CENTER, spaceAfter=8, wordWrap='CJK'),
    'h1':       ParagraphStyle('H1', fontName=FONT_B, fontSize=17, leading=26, textColor=BRAND_DARK,
                               spaceBefore=0, spaceAfter=10, wordWrap='CJK'),
    'h2':       ParagraphStyle('H2', fontName=FONT_B, fontSize=13.5, leading=21, textColor=BRAND,
                               spaceBefore=14, spaceAfter=6, wordWrap='CJK'),
    'h3':       ParagraphStyle('H3', fontName=FONT_B, fontSize=11.5, leading=18, textColor=TEXT,
                               spaceBefore=10, spaceAfter=4, wordWrap='CJK'),
    'body':     ParagraphStyle('B',  fontName=FONT,   fontSize=10.5, leading=18, textColor=TEXT,
                               alignment=TA_JUSTIFY, spaceAfter=6, wordWrap='CJK'),
    'bullet':   ParagraphStyle('BL', fontName=FONT,   fontSize=10.5, leading=17, textColor=TEXT,
                               leftIndent=14, bulletIndent=6, spaceAfter=3, wordWrap='CJK'),
    'note':     ParagraphStyle('N',  fontName=FONT,   fontSize=10, leading=16, textColor=TEXT,
                               backColor=SOFT_BLUE, borderColor=HexColor('#bae0ff'), borderWidth=0.5,
                               borderPadding=(6, 9, 6, 9), spaceBefore=6, spaceAfter=10, wordWrap='CJK'),
    'tip':      ParagraphStyle('TIP',fontName=FONT,   fontSize=10, leading=16, textColor=HexColor('#ad6800'),
                               backColor=SOFT_AMBER, borderColor=HexColor('#ffd591'), borderWidth=0.5,
                               borderPadding=(6, 9, 6, 9), spaceBefore=6, spaceAfter=10, wordWrap='CJK'),
    'cap':      ParagraphStyle('C',  fontName=FONT,   fontSize=9, leading=13, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceAfter=10, wordWrap='CJK'),
    'toc_title':ParagraphStyle('TC', fontName=FONT_B, fontSize=20, leading=30, textColor=BRAND_DARK,
                               alignment=TA_CENTER, spaceAfter=12, wordWrap='CJK'),
    'toc_l1':   ParagraphStyle('TL1',fontName=FONT_B, fontSize=11.5, leading=22, textColor=BRAND_DARK,
                               spaceBefore=4, wordWrap='CJK'),
    'toc_l2':   ParagraphStyle('TL2',fontName=FONT,   fontSize=10.5, leading=18, textColor=TEXT,
                               leftIndent=14, wordWrap='CJK'),
    'cover_big':ParagraphStyle('CVB',fontName=FONT_B, fontSize=30, leading=42, textColor=BRAND_DARK,
                               alignment=TA_CENTER, spaceAfter=6, wordWrap='CJK'),
    'cover_sub':ParagraphStyle('CVS',fontName=FONT,   fontSize=13, leading=22, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceAfter=4, wordWrap='CJK'),
    'cover_org': ParagraphStyle('CVO',fontName=FONT_B, fontSize=14, leading=22, textColor=BRAND,
                               alignment=TA_CENTER, spaceAfter=2, wordWrap='CJK'),
    'cell':     ParagraphStyle('CE', fontName=FONT,   fontSize=10, leading=14, textColor=TEXT, wordWrap='CJK'),
    'cell_b':   ParagraphStyle('CEB',fontName=FONT_B, fontSize=10, leading=14, textColor=TEXT, wordWrap='CJK'),
}

def _esc(s):
    return str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def _wrap(text, style):
    return Paragraph(_esc(text), style)

# ================= 图片 helper =================
def pic(name, cap=None, width_pt=440, max_h_pt=620):
    """插入一张屏幕截图，按比例缩放到指定宽度（并限制最大高度防止超出页面）。"""
    p = os.path.join(SCREENS, name)
    if not os.path.exists(p):
        return [_wrap('（截图缺失：%s）' % name, S['cap'])]
    r = ImageReader(p)
    try:
        w, h = r.getSize()
    except Exception:
        w, h = 1200, 800
    ratio = h / float(w)
    height_pt = width_pt * ratio
    if height_pt > max_h_pt:
        height_pt = max_h_pt
        width_pt = height_pt / ratio
    out = [RLImage(p, width=width_pt, height=height_pt)]
    if cap:
        out.append(Spacer(1, 3))
        out.append(Paragraph(_esc(cap), S['cap']))
    out.append(Spacer(1, 6))
    return out

# ================= 流程图 Flowable =================
class FlowDiagram(Flowable):
    """从上到下的纵向流程图：节点方块 + 箭头连接。"""
    def __init__(self, nodes, width_pt=420, h_per_node=52, gap=18):
        super().__init__()
        self.nodes = nodes   # [(label, sub_label, color), ...]
        self.w = width_pt
        self.hn = h_per_node
        self.gap = gap
        self.big_h = len(nodes) * h_per_node + (len(nodes) - 1) * gap + 20
        self.width = width_pt
        self.height = self.big_h
    def wrap(self, *a):
        return self.width, self.height
    def draw(self):
        c = self.canv
        W = self.width; H = self.height
        cx = W / 2
        y_top = H - 22
        for i, (label, sub, color) in enumerate(self.nodes):
            yt = y_top - i * (self.hn + self.gap)
            x1 = cx - self.w / 2
            x2 = cx + self.w / 2
            c.setFillColor(color)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.6)
            c.roundRect(x1, yt - self.hn, self.w, self.hn, 8, fill=1, stroke=1)
            c.setFillColor(BRAND_DARK)
            c.setFont(FONT_B, 11)
            c.drawCentredString(cx, yt - self.hn / 2 + 3, label)
            if sub:
                c.setFillColor(TEXT_MUTED)
                c.setFont(FONT, 8.5)
                c.drawCentredString(cx, yt - self.hn / 2 - 12, sub)
            if i < len(self.nodes) - 1:
                # 箭头
                xmid = cx
                y1 = yt - self.hn
                y2 = yt - self.hn - self.gap
                c.setStrokeColor(BRAND)
                c.setLineWidth(1.1)
                c.line(xmid, y1, xmid, y2)
                ah = 6; aw = 4
                c.setFillColor(BRAND)
                p = c.beginPath()
                p.moveTo(xmid, y2)
                p.lineTo(xmid - aw, y2 + ah)
                p.lineTo(xmid + aw, y2 + ah)
                p.close()
                c.drawPath(p, fill=1, stroke=0)

# ================= 卖点卡片 =================
class ValueCard(Flowable):
    """一张卖点卡片：左侧彩色竖条 + 大圆点图标 + 标题 + 正文。"""
    CARD_W = 440   # 必须 <= frame 实际可用宽度（455pt 左右），否则卡片外框会画到页边外
    CARD_H = 86
    def __init__(self, idx, title, body, color):
        super().__init__()
        self.idx, self.title, self.body, self.color = idx, title, body, color
        self.width = self.CARD_W
        self.height = self.CARD_H
    def wrap(self, *a):
        return self.width, self.height
    def draw(self):
        c = self.canv
        W = self.CARD_W; H = self.CARD_H
        # 卡片外框
        c.setFillColor(white)
        c.setStrokeColor(BORDER); c.setLineWidth(0.6)
        c.roundRect(0, 0, W, H, 6, fill=1, stroke=1)
        # 左侧彩色竖条
        c.setFillColor(self.color)
        c.rect(0, 0, 3, H, fill=1, stroke=0)
        # 编号圆
        cx = 26; cy = H / 2
        c.setFillColor(self.color)
        c.circle(cx, cy, 11, fill=1, stroke=0)
        c.setFillColor(white); c.setFont(FONT_B, 11)
        c.drawCentredString(cx, cy - 4, str(self.idx))
        # 标题
        c.setFillColor(BRAND_DARK); c.setFont(FONT_B, 11.5)
        c.drawString(44, H - 20, self.title)
        # 正文（手动换行防溢出）
        c.setFillColor(TEXT_MUTED); c.setFont(FONT, 9.5)
        self._draw_wrap(c, self.body, 44, H - 36, W - 56, 13)
    def _draw_wrap(self, c, text, x, y, maxw, lh):
        words = []; line = ''
        for ch in text:
            line += ch
            w = c.stringWidth(line, FONT, 9.5)
            if w > maxw and line:
                words.append(line[:-1]); line = ch
        if line: words.append(line)
        for i, w in enumerate(words):
            if i * lh > 3 * lh: break   # 最多显示 4 行，剩余截断
            c.drawString(x, y - i * lh, w)

# ================= 文档模板：两遍构建 + 目录 + 书签 =================
class ManualDoc(SimpleDocTemplate):
    def __init__(self, fn, **kw):
        SimpleDocTemplate.__init__(self, fn, **kw)
        self.headings = []          # [(txt, page, level), ...]
        self._in_toc = False

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and isinstance(flowable.style, ParagraphStyle):
            name = flowable.style.name
            if name in ('H1',):
                self.headings.append((flowable.getPlainText(), self.page, 0))
                if not self._in_toc:
                    try:
                        self.canv.bookmarkPage('sec_%d' % len(self.headings))
                        self.canv.addOutlineEntry(flowable.getPlainText(),
                                                   'sec_%d' % len(self.headings), level=0, closed=False)
                    except Exception: pass
            elif name == 'H2':
                self.headings.append((flowable.getPlainText(), self.page, 1))
                if not self._in_toc:
                    try:
                        self.canv.bookmarkPage('sec_%d' % len(self.headings))
                        self.canv.addOutlineEntry(flowable.getPlainText(),
                                                   'sec_%d' % len(self.headings), level=1, closed=True)
                    except Exception: pass

def make_page_rules(total):
    """页脚：首页无页脚，后续页显示页码 / 共 N 页 + 书名。"""
    L_MARGIN = 24 * mm
    R_MARGIN = 24 * mm
    W = A4[0]   # 595
    X_L = L_MARGIN
    X_R = W - R_MARGIN
    X_MID = W / 2
    def _first_page(canvas, doc):
        canvas.saveState()
        canvas.restoreState()
    def _later_page(canvas, doc):
        canvas.saveState()
        # 页头蓝条：画在正文 frame 的左右边界内（不超出版心）
        canvas.setStrokeColor(BRAND); canvas.setLineWidth(0.6)
        canvas.line(X_L, A4[1] - 22, X_R, A4[1] - 22)
        canvas.setFillColor(TEXT_CAP)
        canvas.setFont(FONT, 8.5)
        canvas.drawRightString(X_R, 12, '东华大学多媒体教室运维系统 · 使用手册  v1.3.0')
        canvas.drawCentredString(X_MID, 12,
            ('第 %d 页 / 共 %d 页') % (doc.page, total))
        canvas.restoreState()
    return _first_page, _later_page

def build_toc_placeholders():
    """目录页第一遍：全是 P? 占位符。"""
    items = []
    for label in TOC_TITLES:
        items.append(Paragraph(_esc(label), S['toc_l1']))
        items.append(Spacer(1, 3))
    return items

TOC_TITLES = [
    '一、3 分钟快速上手',
    '二、核心业务闭环',
    '三、知识库与经验沉淀',
    '四、数据与报表',
    '五、系统设置',
    '六、为什么选东华多媒体运维系统',
    '七、常见问题 FAQ',
]

def build_toc_final(toc_map):
    """目录页第二遍：把 P? 替换成真实页码（doc1.headings 里的 page）。"""
    items = [Paragraph('目  录', S['toc_title']), Spacer(1, 8)]
    for label in TOC_TITLES:
        page = toc_map.get(label, '—')
        # 左标题 + 右页码，用一个两列表格实现点线连接
        t = Table([[Paragraph(_esc(label), S['toc_l1']),
                    Paragraph(_esc(str(page)), S['toc_l1'])]],
                  colWidths=[PX_W - 70, 60])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TEXTCOLOR', (1, 0), (1, -1), TEXT_MUTED),
            ('FONT', (1, 0), (1, -1), FONT, 10.5),
        ]))
        items.append(t)
        items.append(Spacer(1, 2))
    return items

# ================= 章节内容 =================

def build_cover():
    """封面页。"""
    story = []
    story.append(Spacer(1, 60))
    # 标题
    story.append(Paragraph('东华大学', S['cover_org']))
    story.append(Spacer(1, 14))
    story.append(Paragraph('多媒体教室运维系统', S['cover_big']))
    story.append(Paragraph('使用手册', ParagraphStyle('CV', fontName=FONT_B, fontSize=20, leading=30,
                                                      textColor=BRAND, alignment=TA_CENTER, spaceAfter=6, wordWrap='CJK')))
    story.append(Spacer(1, 12))
    story.append(Paragraph('让多媒体教室运维不再手忙脚乱 —— 来电、派单、到场、归档、报表，全流程一站搞定',
                           S['cover_sub']))
    story.append(Spacer(1, 30))
    # 版本信息块
    info = [
        ['手册版本', 'v1.3.0'],
        ['适用系统', 'Windows 7 / 10 / 11'],
        ['发布日期', time.strftime('%Y') + ' 年 ' + time.strftime('%m') + ' 月 ' + time.strftime('%d') + ' 日'],
    ]
    t = Table(info, colWidths=[110, 200])
    t.setStyle(TableStyle([
        ('FONT', (0, 0), (0, -1), FONT_B, 10),
        ('FONT', (1, 0), (1, -1), FONT, 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_MUTED),
        ('TEXTCOLOR', (1, 0), (1, -1), TEXT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20),
        ('BACKGROUND', (0, 0), (0, -1), SOFT_BLUE),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, BORDER),
        ('LINEABOVE', (0, 0), (-1, 0), 0.6, BRAND),
    ]))
    story.append(t)
    story.append(Spacer(1, 40))
    story.append(HRFlowable(width="60%", thickness=0.8, color=LINE, spaceBefore=10, spaceAfter=10))
    story.append(Paragraph('上海 · 东华大学', ParagraphStyle('FTR', fontName=FONT, fontSize=9.5, leading=14,
                                                                    textColor=TEXT_CAP, alignment=TA_CENTER, wordWrap='CJK')))
    story.append(PageBreak())
    return story


def build_intro():
    """第一章：3 分钟快速上手。"""
    story = []
    story.append(Paragraph('一、3 分钟快速上手', S['h1']))
    story.append(Paragraph('第一次打开系统？没关系 —— 这章带你走一遍最基本的流程，3 分钟就能上手。',
                           S['body']))
    story.append(Spacer(1, 4))

    # 流程图
    story.append(Paragraph('全流程一眼看懂', S['h2']))
    story.append(Paragraph('不管你是接电话的客服、到场处理的工程师、还是月底做报表的管理员，系统都按下面这条主线帮你工作：',
                           S['body']))
    story.append(FlowDiagram([
        ('1. 接电话', '来电登记，30 秒填完一条报修', BRAND),
        ('2. 派单', '自动推荐当班工程师，或手动指派', SOFT_BLUE),
        ('3. 到场处理', '打开每日日志，记录故障 + 处理结果', SOFT_BLUE),
        ('4. 归档', '责任人 + 协助人共同签字（系统自动记录）', SOFT_BLUE),
        ('5. 统计报表', '月末一键导出 Excel / PDF，自动生成趋势', BRAND),
    ], width_pt=400, h_per_node=48, gap=16))
    story.append(Spacer(1, 8))

    # 登录
    story.append(Paragraph('第一步：登录系统', S['h2']))
    story.append(Paragraph('默认账号是 <b>admin</b>，默认密码 <b>admin123</b>。管理员可以在「系统管理 → 用户与权限」里增加新账号、改密码。',
                           S['body']))
    story.extend(pic('01-login.jpg', '登录页面（首次打开系统会看到这个界面）', width_pt=420))

    # 桌面快捷方式（新功能，突出写）
    story.append(Paragraph('推荐：给桌面建个快捷方式', S['h2']))
    story.append(Paragraph('不想每次开浏览器输网址？点系统里「创建桌面快捷方式」按钮，图标就会出现在桌面上 —— 以后双击它就能直接进系统。',
                           S['body']))
    story.append(Paragraph('在 <b>服务器这台电脑</b> 上点击，图标会直接写入公共桌面（所有 Windows 账户都可见）；在 <b>其他电脑</b> 上点击，系统会下载一个 .url 文件，拖到桌面即可。',
                           S['note']))

    # 工作台
    story.append(Paragraph('第二步：看看工作台首页', S['h2']))
    story.append(Paragraph('登录后第一个看到的就是工作台。最顶一排的 5 个卡片告诉你今天的全貌 —— 今天来了多少电话、还有多少报修没接、巡视打到哪一步、今日日志填了多少。',
                           S['body']))
    story.extend(pic('02-dashboard.jpg', '工作台首页：今日概览卡片 + 快捷入口', width_pt=460))
    return story


def build_business():
    """第二章：核心业务闭环。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('二、核心业务闭环', S['h1']))
    story.append(Paragraph('这一章讲最常用的 5 个场景：来电登记、每日日志、批量录入、工单追踪、巡视打卡。',
                           S['body']))

    # 来电登记
    story.append(Paragraph('场景 1：接了一个报修电话', S['h2']))
    story.append(Paragraph('电话响了，打开「来电登记」页面，按下面几步填：', S['body']))
    for n, t in enumerate([
        ('选教室', '输入教室编号（如 2113），系统会自动识别楼栋并按楼栋推荐工程师'),
        ('来电信息', '填写来电人 / 联系方式 —— 老师来报修一定要记'),
        ('故障类型', '点 6 个 chips 里的一个（中控、投影仪、音频、网络等），故障现象填下面的文本框'),
        ('指派工程师', '系统会自动选"当天当班、当前在办最少"的人，也可以手动改'),
        ('协助人', '默认全选除责任人外的当班人员。系统把责任人和协助人分开记录，月底报表时可以看到谁帮过谁'),
        ('一键提交', '点「登记并指派」，系统自动生成一条待填报的日志，责任人下次登录就能在待办里看到'),
    ], 1):
        story.append(Paragraph('<b>%d.</b> %s —— %s' % (n, t[0], t[1]), S['bullet']))
    story.extend(pic('03-intake.jpg', '来电登记页面：电话一来，这里就是第一落脚点', width_pt=460))

    # 每日日志
    story.append(Paragraph('场景 2：到场后填写每日日志', S['h2']))
    story.append(Paragraph('工程师到教室处理完问题，打开「每日工作日志」页面新增一条记录。和来电登记里最大的区别是 —— 这里的责任人/协助人是明确分开的。',
                           S['body']))
    story.append(Paragraph('<b>责任人</b>是这次处理的主责人（单选 chips，只能选 1 人）。<br/>'
                           '<b>协助人</b>是一起去的同事（多选 chips，默认全选除责任人外的当班人员，点掉就是不参与）。<br/>'
                           '协助人 chips 里永远不会出现责任人 —— 系统自动帮你排除，不会重复记录。',
                           S['note']))
    story.extend(pic('04-daily-log.jpg', '每日工作日志列表：按上午 / 下午 / 晚上三个时段分组', width_pt=460))

    # 批量录入
    story.append(Paragraph('场景 3：一个故障影响多间教室', S['h2']))
    story.append(Paragraph('比如"整栋楼网络断了"，同时影响 5 间教室。用「批量录入」一次写 5 条 —— 教室编号用空格或换行分隔，回车分一条，点「确认生成」。每一条自动带上相同的故障类型 / 处理结果 / 责任人 / 协助人。',
                           S['body']))
    story.extend(pic('05-batch-modal.jpg', '批量录入弹窗：一次写多间教室的同类故障', width_pt=420))

    # 详情抽屉
    story.append(Paragraph('查看某条记录的详细信息', S['h2']))
    story.append(Paragraph('想不起来某间教室上次是谁修的？在日志行点「查看」，右边抽屉弹出来，完整信息一目了然 —— 故障现象、处理结果、责任人、协助人、什么时间登记的、从哪个电话来的。',
                           S['body']))
    story.extend(pic('06-detail-drawer.jpg', '详情抽屉：责任人 + 协助人独立一行显示', width_pt=420))

    # 工单追踪
    story.append(Paragraph('场景 4：工单追踪', S['h2']))
    story.append(Paragraph('所有已登记但未完成的报修都在「工单列表」里。状态分为"待填报"（已登记但日志还没写）和"待跟进"（没修好、要下次继续）。负责人处理完一条就点完成，状态自动流转。',
                           S['body']))
    story.extend(pic('07-tickets.jpg', '工单列表：待填报 / 待跟进 / 已完成 三种状态', width_pt=460))

    # 巡视打卡
    story.append(Paragraph('场景 5：日常巡视', S['h2']))
    story.append(Paragraph('每天当班工程师要按排班去教室巡视。打开「巡视管理」扫码或手动打卡，系统自动生成一条"正常"的巡视日志，和维修日志一起归档。月末报表时可以看到"今天巡视了几间、报修了几间"。',
                           S['body']))
    story.extend(pic('08-patrol.jpg', '巡视打卡界面：每个教室一张卡片，点一下就完成', width_pt=460))
    return story


def build_knowledge():
    """第三章：知识库与经验沉淀。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('三、知识库与经验沉淀', S['h1']))
    story.append(Paragraph('同样的故障反复出现、每次都要从头排查？知识库就是为了解决这个问题 —— 把每次处理的经验沉淀下来，下次同类故障一来就能直接用。',
                           S['body']))
    story.append(Spacer(1, 4))

    story.append(Paragraph('知识库怎么来的', S['h2']))
    story.append(Paragraph('知识库条目有三种来源，在卡片上用不同颜色的标签区分：', S['body']))
    story.append(Paragraph('· <b style="color:#8c8c8c">系统内置</b>：系统预置的常见故障处置经验，开箱即用。',
                           S['bullet']))
    story.append(Paragraph('· <b style="color:#08979c">人工维护</b>：管理员在「知识库」页面手工新增或编辑的条目。',
                           S['bullet']))
    story.append(Paragraph('· <b style="color:#d46b08">工单沉淀</b>：处理完工单结案时，一键把这次的"故障现象 + 处理步骤"沉淀成知识库条目，来源标注为"工单沉淀（工单号）"。',
                           S['bullet']))
    story.append(Spacer(1, 4))

    story.append(Paragraph('场景 1：接电话时直接看到处置经验', S['h2']))
    story.append(Paragraph('在「来电登记」页面选好故障类型后，系统会自动匹配该类型下的知识库条目，最多展示 3 条，第一条标为「TOP 推荐」。',
                           S['body']))
    story.append(Paragraph('如果觉得某条经验对这次报修有用，在卡片前的方框打勾 —— 提交后这条知识库的「引用次数」会 +1，工单上也会记录引用了哪些经验，方便追溯。',
                           S['body']))
    story.append(Paragraph('如果当前故障类型还没有知识库条目，页面会提示"结案后可一键沉淀经验" —— 鼓励大家处理完就把经验留下来。',
                           S['tip']))

    story.append(Paragraph('场景 2：填日志时也能引用经验', S['h2']))
    story.append(Paragraph('在「每日工作日志」新增记录时，选好故障类型后同样会出现知识库推荐卡片（最多 2 条）。勾选后随日志一起保存，引用次数同样会计入。',
                           S['body']))

    story.append(Paragraph('场景 3：结案时一键沉淀经验', S['h2']))
    story.append(Paragraph('处理完一条报修、在日志里点「保存并结案」后，如果这条工单还没有引用过知识库，系统会弹出一个"结案沉淀"窗口：',
                           S['body']))
    story.append(Paragraph('· 窗口会告诉你当前故障分类已有几条经验（避免重复沉淀）',
                           S['bullet']))
    story.append(Paragraph('· 标题、场景、处理步骤会根据你刚填的日志自动预填，确认无误后点「沉淀为知识库」即可',
                           S['bullet']))
    story.append(Paragraph('· 觉得已有经验够用、不想重复沉淀，点「跳过」就行',
                           S['bullet']))
    story.append(Paragraph('沉淀后的条目会自动带上"工单沉淀"标签，并反向记录是从哪条工单来的。',
                           S['note']))

    story.append(Paragraph('场景 4：报表里看哪些故障还缺经验', S['h2']))
    story.append(Paragraph('打开「统计报表」，在故障类型 TOP 排行里，每种故障后面会标注：',
                           S['body']))
    story.append(Paragraph('· <b style="color:#389e0d">📚 N</b>：该故障类型已有 N 条知识库经验',
                           S['bullet']))
    story.append(Paragraph('· <b style="color:#d46b08">⚠️ 待沉淀</b>：该故障出现 ≥ 3 次但还没有任何知识库经验，建议尽快沉淀',
                           S['bullet']))
    story.append(Paragraph('这样管理员一眼就能看出"哪些高频故障还没有处置经验"，有针对性地组织工程师补全知识库。',
                           S['body']))

    story.append(Paragraph('知识库条目的字段', S['h2']))
    fields = [
        ['字段', '说明'],
        ['标题', '一句话概括这条经验（如"投影仪无信号：重插 HDMI 线"）'],
        ['分类', '对应的故障类型（中控 / 投影仪 / 音频 / 网络 等）'],
        ['场景', '什么情况下会遇到这个问题'],
        ['处置步骤', '一步步怎么处理，每条一行'],
        ['注意事项', '容易踩的坑或特别提醒'],
        ['来源', '系统内置 / 人工维护 / 工单沉淀'],
        ['引用次数', '被工单或日志引用过多少次，次数越多说明越有用'],
    ]
    t = Table(fields, colWidths=[80, PX_W - 80])
    t.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), FONT, 10),
        ('FONT', (0, 0), (-1, 0), FONT_B, 10),
        ('BACKGROUND', (0, 0), (-1, 0), SOFT_BLUE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    story.append(t)
    return story


def build_reports():
    """第四章：数据与报表。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('四、数据与报表', S['h1']))

    story.append(Paragraph('统计报表', S['h2']))
    story.append(Paragraph('「统计报表」页面给你四个维度的汇总：', S['body']))
    for t in [
        '概览卡片：本月共处理多少故障、响应时效、平均处理时长',
        '趋势图：按天 / 按周 / 按月看报修量和巡视量的变化',
        '设备台账：每台设备什么时候过保、修过几次、最近一次什么时候',
        '工程师维度：每个人接了多少单、处理了多少协助、效率如何',
    ]:
        story.append(Paragraph('· ' + t, S['bullet']))
    story.append(Spacer(1, 4))
    story.extend(pic('09-reports.jpg', '统计报表：汇总卡片 + 趋势图 + 设备台账', width_pt=460))
    story.append(Paragraph('报表支持一键导出 Excel，也可以直接在页面里点图表下方的"导出 PDF"给领导汇报。',
                           S['tip']))

    story.append(Paragraph('教室 / 设备档案', S['h2']))
    story.append(Paragraph('「教室档案」把每间教室和里面的设备绑在一起：投影仪的品牌型号、中控电脑的 IP、安装日期、保修到期日……报修时选教室，设备信息自动带出来，工程师不用再翻台账本。',
                           S['body']))
    story.extend(pic('10-assets.jpg', '教室 / 设备档案：按楼栋分组，点开就是设备清单', width_pt=460))
    return story


def build_settings():
    """第四章：系统设置。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('五、系统设置', S['h1']))

    story.append(Paragraph('基础配置', S['h2']))
    story.append(Paragraph('「基础配置」是管理员调整系统行为的地方 —— 教学楼列表、教室清单、排班日历、工程师名单都在这里维护。<br/>'
                           '特别提醒：<b>工程师名单是所有"责任人 / 协助人"下拉选项的源头</b>。新增工程师要先在名单里加一条，然后才能在用户管理里为他建账号。',
                           S['body']))
    story.extend(pic('11-settings.jpg', '基础配置页：工程师名单、教学楼、排班日历一屏全览', width_pt=460))

    story.append(Paragraph('桌面快捷方式', S['h2']))
    story.append(Paragraph('在基础配置页找到「本机桌面图标」卡片，点一下按钮，桌面上就会出现带图标的快捷方式。以后双击它就能直接进系统，省得每次输网址。',
                           S['body']))
    story.extend(pic('12-settings-desktop.jpg', '点一下「创建桌面快捷方式」按钮即可', width_pt=420))

    story.append(Paragraph('用户与权限', S['h2']))
    story.append(Paragraph('「用户与权限」页面做两件事：', S['body']))
    story.append(Paragraph('· <b>用户账号</b>：每个账号必须对应基础配置里的一个工程师（用户名从下拉框选，不能手填）。系统内置一个超级管理员 admin，不受限制；其他账号只能是普通用户或工程师，不能再设管理员。',
                           S['bullet']))
    story.append(Paragraph('· <b>权限控制</b>：12 个菜单级权限点，按人勾或按用户组批量勾 —— 谁能接电话、谁能改配置、谁能看报表，一条一条精确控制。',
                           S['bullet']))
    story.extend(pic('13-user-manage.jpg', '用户与权限：新增用户时用户名是下拉框，只能选工程师名单里的人', width_pt=460))
    return story


def build_why():
    """第五章：为什么选这套系统。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('六、为什么选东华多媒体运维系统', S['h1']))
    story.append(Paragraph('市面上运维系统多是大而全的 SaaS —— 注册一个账号就能用，但付费贵、改不了、数据在别人云上。我们这套不一样：',
                           S['body']))
    story.append(Spacer(1, 4))

    values = [
        ('30 秒接完一个电话', '来电登记表单按真实值班场景设计 —— 输入教室自动带楼栋、故障类型一键点选、工程师自动推荐，电话不挂就能完成登记。', BRAND),
        ('再也找不到"谁修的"？不存在', '每条日志的责任人 + 协助人独立记录，谁去过、谁帮过、什么时候去的 —— 一查就有。月底报表直接按人汇总工作量。', ACCENT),
        ('桌面双击直达', '点一次按钮就在桌面上生成带图标的快捷方式，省去开浏览器输网址 —— 值班电脑开机就能用。', BRAND_DARK),
        ('月末报表一键出', '系统里存了一年的报修 + 巡视数据，月底一键导出 Excel 透视表或 PDF 汇报稿，不用再手工数。', AMBER),
        ('保修到期自动知道', '每台设备绑定保修期限，快到期时在工作台提醒，别等坏了才发现早就过保。', SOFT_GREEN),
        ('数据完全在自己手里', '系统跑在学院自己的电脑上，SQLite 单文件数据库，备份就是复制一个文件 —— 不用怕数据在 SaaS 服务商那里。', ACCENT),
    ]
    for i, (title, body, color) in enumerate(values, 1):
        story.append(ValueCard(i, title, body, color))
        story.append(Spacer(1, 6))
    return story


def build_faq():
    """第七章：常见问题 FAQ。"""
    story = []
    story.append(PageBreak())
    story.append(Paragraph('七、常见问题 FAQ', S['h1']))
    faqs = [
        ('忘记密码怎么办？',
         '找超级管理员 admin 重置。admin 是系统内置账号，不会被删除。如果 admin 密码也忘了，可以在服务器上运行命令行工具重置。'),
        ('工程师名单和用户账号是什么关系？',
         '一名工程师对应一个账号。先到「基础配置 · 工程师名单」加名字，再到「用户与权限」新增账号 —— 新增时用户名是下拉框，只能从工程师名单里选。'),
        ('为什么责任人不能和协助人重复？',
         '系统把责任人定义为"本次处理的主责人"，协助人定义为"一起去的同事" —— 两者互斥才能保证工作量统计不重复计算。'),
        ('批量录入和新增记录有什么区别？',
         '批量录入是"一个故障同时影响多间教室"的场景 —— 一次填故障类型、处理结果、责任人、协助人，按教室数量生成 N 条。如果是一间教室一次处理，用普通新增就行。'),
        ('数据会不会丢？怎么备份？',
         '所有数据都在服务器上的 SQLite 数据库文件里（data/dhu_ops.db）。「基础配置」页有一键备份按钮，会在指定目录生成带时间戳的副本。建议每周自动备份一次。'),
        ('安装包多大？要求什么配置？',
         '一键安装包约 30 MB，下载解压后双击 Setup.exe 即可。服务器运行 Windows 7 / 10 / 11，内存建议 2 GB 以上；客户端（其他电脑）只要有浏览器就行。'),
        ('知识库条目可以编辑或删除吗？',
         '可以。管理员在「知识库」页面可以新增、编辑、删除任意条目；系统内置条目也可以编辑或删除。被工单引用过的条目删除后，工单上的引用记录仍保留，但条目不再出现在推荐列表中。'),
        ('导出的 PDF 报告里的文字能复制吗？',
         '能。统计报告由服务器直接生成矢量 PDF，文字可以被选中、复制和搜索，放大不失真，体积通常只有几百 KB，分页也不会把表格行切断；如果服务器生成失败，系统会自动回退为原来的本地导出方式。'),
        ('系统提示「授权即将到期 / 已过期」怎么办？',
         '打开「基础配置 → 授权信息」，把页面上的「本机机器码」发给厂商；厂商签发新的 license.json 后，管理员在同一页面点「导入授权文件」粘贴内容并保存即可恢复，不需要重装或迁移数据。授权到期后有 7 天宽限期（只能查看、不能新增），超过宽限期系统会锁屏停止服务。'),
    ]
    for q, a in faqs:
        story.append(Paragraph('Q：' + q, ParagraphStyle('FQ', fontName=FONT_B, fontSize=11, leading=18,
                                                          textColor=BRAND_DARK, spaceBefore=10, spaceAfter=3, wordWrap='CJK')))
        story.append(Paragraph('A：' + a, ParagraphStyle('FA', fontName=FONT, fontSize=10.5, leading=17,
                                                          textColor=TEXT, spaceAfter=4, wordWrap='CJK')))
    return story


def build_history():
    """版本历史章节已按需求移除。"""
    return []


# ================= 组装 =================
def build_story(toc_map=None):
    """组装整本手册的 story。toc_map 传 None 表示第一遍构建（目录占位符），传 dict 表示第二遍。"""
    story = []
    story.extend(build_cover())

    # 目录页
    story.append(Paragraph('目  录', S['toc_title']))
    story.append(Spacer(1, 8))
    if toc_map is None:
        story.extend(build_toc_placeholders())
    else:
        story.extend(build_toc_final(toc_map))
    story.append(PageBreak())

    # 正文
    story.extend(build_intro())
    story.extend(build_business())
    story.extend(build_knowledge())
    story.extend(build_reports())
    story.extend(build_settings())
    story.extend(build_why())
    story.extend(build_faq())

    # 结语页
    story.append(PageBreak())
    story.append(Spacer(1, 60))
    story.append(Paragraph('感谢使用东华大学多媒体教室运维系统', S['h1']))
    story.append(Spacer(1, 10))
    story.append(Paragraph('让每一间多媒体教室都能及时响应、快速恢复、留下清晰痕迹。<br/>'
                           '如需技术支持或功能建议，请联系系统管理员。',
                           S['body']))
    story.append(Spacer(1, 60))
    story.append(HRFlowable(width="60%", thickness=0.8, color=LINE))
    story.append(Spacer(1, 10))
    story.append(Paragraph('东华大学 · 多媒体教室运维系统  v1.3.0  使用手册',
                           ParagraphStyle('FTR2', fontName=FONT, fontSize=9, leading=14,
                                          textColor=TEXT_CAP, alignment=TA_CENTER, wordWrap='CJK')))
    return story


def main():
    meta = dict(leftMargin=24*mm, rightMargin=24*mm, topMargin=20*mm, bottomMargin=20*mm,
                title='东华大学多媒体教室运维系统 · 使用手册',
                author='东华大学', subject='多媒体教室运维系统使用手册 v1.3.0')

    buf1 = io.BytesIO()
    d1 = ManualDoc(buf1, **meta)
    d1.build(build_story(None))
    toc_map = {}
    for txt, pg, lvl in d1.headings:
        if lvl == 0:
            # TOC_TITLES 顺序对应 H1 顺序
            toc_map[txt] = pg

    # 修正：封面后 PageBreak，H1 从第 3 页开始（封面 P1 / 目录 P2 / 正文 P3）
    # 但 toc_map 里的 page 是 doc1.build 里累加的。第一遍封面是 page 1（SimpleDocTemplate 的 page 从 1 开始），
    # 然后目录是 page 2，然后 build_intro 的 H1 应该是 page 3。实际 d1.headings 里第一个 H1 对应 page 3 —— 我们已经取到了。
    # 直接用 toc_map[title] = pg 就行。

    buf2 = io.BytesIO()
    d2 = ManualDoc(buf2, **meta)
    first_page_rule, later_page_rule = make_page_rules(d1.page)
    d2.build(build_story(toc_map), onFirstPage=first_page_rule, onLaterPages=later_page_rule)

    with open(OUT, 'wb') as f:
        f.write(buf2.getvalue())
    print('OK ->', OUT, '(%.1f KB)' % (len(buf2.getvalue()) / 1024))

if __name__ == '__main__':
    main()
