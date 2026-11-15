# -*- coding: utf-8 -*-
"""生成《东华大学多媒体教室运维系统 · 开发文档（封测版）》PDF。

文档定位：项目留档、封测评审、后续版本改进参考。
输出：docs/东华大学多媒体教室运维系统_开发文档_v1.5.0-beta.1.pdf
"""
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable, LongTable
)
from reportlab.platypus.doctemplate import BaseDocTemplate, PageTemplate, Frame
from reportlab.platypus.tableofcontents import TableOfContents
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
BRAND = HexColor('#1677ff')
BRAND_DARK = HexColor('#0d3d86')
TEXT = HexColor('#1f2937')
TEXT_MUTED = HexColor('#5b6472')
TEXT_CAP = HexColor('#98a1ad')
BORDER = HexColor('#dbe2ea')
TABLE_ALT = HexColor('#f7faff')
SOFT_BLUE = HexColor('#eff6ff')

CW = 170 * mm

DOC_TITLE = '开发文档'
DOC_VER = 'v1.5.0-beta.1'
DOC_DATE = '2026-11-15'
DOC_NO = 'DHU-OPS-DEV-001'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '东华大学多媒体教室运维系统_开发文档_%s.pdf' % DOC_VER)

# ================= 文本样式 =================
S = {
    'title': ParagraphStyle('T', fontName=FONT_B, fontSize=25, leading=34, textColor=BRAND_DARK,
                            alignment=TA_CENTER, spaceAfter=2, wordWrap='CJK'),
    'subtitle': ParagraphStyle('ST', fontName=FONT, fontSize=11.5, leading=19, textColor=TEXT_MUTED,
                               alignment=TA_CENTER, spaceAfter=2, wordWrap='CJK'),
    'h1': ParagraphStyle('H1', fontName=FONT_B, fontSize=16.5, leading=24, textColor=BRAND_DARK,
                         spaceBefore=14, spaceAfter=7, wordWrap='CJK'),
    'h2': ParagraphStyle('H2', fontName=FONT_B, fontSize=12.5, leading=19, textColor=BRAND,
                         spaceBefore=11, spaceAfter=5, wordWrap='CJK'),
    'body': ParagraphStyle('B', fontName=FONT, fontSize=10, leading=16.5, textColor=TEXT,
                           spaceAfter=6, wordWrap='CJK'),
    'note': ParagraphStyle('N', fontName=FONT, fontSize=9.5, leading=15.5, textColor=BRAND_DARK,
                           backColor=SOFT_BLUE, borderColor=HexColor('#bae0ff'), borderWidth=0.5,
                           borderPadding=(6, 8, 6, 8), spaceBefore=6, spaceAfter=9, wordWrap='CJK'),
    'cap': ParagraphStyle('C', fontName=FONT, fontSize=8.5, leading=12, textColor=TEXT_CAP,
                          alignment=TA_CENTER, spaceAfter=8, wordWrap='CJK'),
    'bullet': ParagraphStyle('BL', fontName=FONT, fontSize=10, leading=16, textColor=TEXT,
                             leftIndent=12, spaceAfter=3, wordWrap='CJK'),
    'th': ParagraphStyle('TH', fontName=FONT_B, fontSize=9.2, leading=13, textColor=white,
                         wordWrap='CJK'),
    'td': ParagraphStyle('TD', fontName=FONT, fontSize=9, leading=13.5, textColor=TEXT,
                         wordWrap='CJK'),
    'td_c': ParagraphStyle('TDC', fontName=FONT, fontSize=9, leading=13.5, textColor=TEXT,
                           alignment=TA_CENTER, wordWrap='CJK'),
    'td_key': ParagraphStyle('TDK', fontName=FONT_B, fontSize=9, leading=13.5, textColor=BRAND_DARK,
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
        ('BACKGROUND', (0, 0), (-1, 0), BRAND),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 7),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
        ('TOPPADDING', (0, 1), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TABLE_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('BOX', (0, 0), (-1, -1), 0.9, BRAND),
    ]))
    return t


def divider(color=BRAND, thickness=1.4):
    return HRFlowable(width=CW, thickness=thickness, color=color, spaceBefore=3, spaceAfter=9)


def H1(text):
    return Paragraph(_esc(text), S['h1'])


def H2(text):
    return Paragraph(_esc(text), S['h2'])


def B(text):
    return Paragraph(_esc(text), S['body'])


def bullet(text):
    return Paragraph(_esc('· ' + text), S['bullet'])


class Doc(BaseDocTemplate):
    def __init__(self, fn, **kw):
        BaseDocTemplate.__init__(self, fn, **kw)
        frame = Frame(20 * mm, 18 * mm, A4[0] - 40 * mm, A4[1] - 38 * mm, id='body')
        self.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=self._page_rules)])

    def _page_rules(self, cv, doc):
        cv.saveState()
        cv.setFont(FONT, 8)
        cv.setFillColor(TEXT_CAP)
        cv.drawString(20 * mm, A4[1] - 12 * mm, '东华大学多媒体教室运维系统 · 开发文档')
        cv.setFillColor(BRAND)
        cv.drawRightString(A4[0] - 20 * mm, A4[1] - 12 * mm, '%s · %s' % (DOC_NO, DOC_VER))
        cv.setStrokeColor(BORDER)
        cv.setLineWidth(0.6)
        cv.line(20 * mm, A4[1] - 14.5 * mm, A4[0] - 20 * mm, A4[1] - 14.5 * mm)
        cv.line(20 * mm, 13.5 * mm, A4[0] - 20 * mm, 13.5 * mm)
        cv.setFillColor(TEXT_CAP)
        cv.drawCentredString(A4[0] / 2, 8.5 * mm, '第 %d 页' % doc.page)
        cv.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            name = flowable.style.name
            if name in ('H1', 'H2'):
                self.notify('TOCEntry', (0 if name == 'H1' else 1,
                                        flowable.getPlainText(), self.page))


def story():
    st = []

    # ---------- 封面 ----------
    st.append(Spacer(1, 52 * mm))
    st.append(Paragraph('东华大学多媒体教室运维系统', S['title']))
    st.append(Spacer(1, 2 * mm))
    st.append(Paragraph(DOC_TITLE, ParagraphStyle('CT', parent=S['title'], fontSize=21)))
    st.append(Spacer(1, 10 * mm))
    st.append(HRFlowable(width=95 * mm, thickness=2.4, color=BRAND_DARK,
                         spaceBefore=0, spaceAfter=0, hAlign='CENTER'))
    st.append(Spacer(1, 9 * mm))
    st.append(Paragraph('%s · %s' % (DOC_VER, DOC_DATE),
                        ParagraphStyle('CV', parent=S['subtitle'], fontSize=12.5)))
    st.append(Spacer(1, 7 * mm))
    for line in ['Flask + SQLite 后端 · 原生 JS 单页前端',
                 'PyInstaller 一键打包 · 局域网离线部署',
                 'RSA 授权绑定 · 功能位分级']:
        st.append(Paragraph(line, S['subtitle']))
    st.append(Spacer(1, 20 * mm))
    st.append(Paragraph('编制单位：东华大学信息中心',
                        ParagraphStyle('CU', parent=S['subtitle'], fontSize=10.5)))
    st.append(Spacer(1, 4 * mm))
    st.append(Paragraph('文档编号 %s · 内部资料 · 请勿外传' % DOC_NO, S['cap']))
    st.append(PageBreak())

    # ---------- 文档控制 ----------
    st.append(H1('文档控制'))
    st.append(divider())
    st.append(build_table([
        ['项目', '内容'],
        ['文档名称', '东华大学多媒体教室运维系统 开发文档'],
        ['编制单位', '东华大学信息中心'],
        ['文档编号', DOC_NO],
        ['当前版本', DOC_VER],
        ['编制日期', DOC_DATE],
        ['适用系统版本', 'v1.4.1（封测基线）／v1.5.0-beta.1（封测版）'],
        ['文档状态', '封测版，随封测进展修订'],
        ['密级', '内部资料'],
        ['用途', '项目留档、封测评审、后续版本改进参考'],
    ], [30, 120]))

    st.append(Spacer(1, 6 * mm))
    st.append(H2('修订记录'))
    st.append(build_table([
        ['版本', '日期', '修订说明'],
        ['v1.0', '2026-11-15', '首版。汇总 v1.3.10 至 v1.5.0-beta.1 的开发过程、功能迭代与封测安排'],
    ], [20, 28, 122], align_center_cols=(0, 1)))

    st.append(Spacer(1, 4 * mm))
    st.append(Paragraph('说明：本文件为封测阶段正式文档，后续每次版本迭代应同步更新第六章'
                        '「版本迭代记录」与第九章「封测说明」。', S['note']))
    st.append(PageBreak())

    # ---------- 目录 ----------
    st.append(H1('目  录'))
    st.append(divider())
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle('TOC1', fontName=FONT_B, fontSize=10.5, leading=20, textColor=BRAND_DARK),
        ParagraphStyle('TOC2', fontName=FONT, fontSize=9.5, leading=17, textColor=TEXT,
                       leftIndent=14),
    ]
    st.append(toc)
    st.append(PageBreak())

    # ---------- 1 概述 ----------
    st.append(H1('一、项目概述'))
    st.append(divider())
    st.append(H2('1.1 建设背景'))
    st.append(B('东华大学松江校区多媒体教室数量多、分布散，日常报修、巡检与工作记录长期依赖纸质台账与即时通讯工具，'
                '存在记录缺失、责任不清、统计口径不一的问题。本系统把报修受理、日志填报、巡视打卡、教室与设备档案、'
                '统计报表集中到一个局域网内部系统中，实现「一处录入、处处可用、口径统一」。'))
    st.append(H2('1.2 建设目标'))
    st.append(bullet('替代纸质台账：报修、日志、巡视全部线上留痕，可按时间与责任人追溯。'))
    st.append(bullet('统一统计口径：以服务端聚合结果为准，避免各人各表。'))
    st.append(bullet('离线可用：不依赖外网与云服务，断网环境下仍可正常工作。'))
    st.append(bullet('部署简单：单个安装包 + 桌面图标，非技术人员可完成安装与升级。'))
    st.append(H2('1.3 系统边界'))
    st.append(build_table([
        ['维度', '范围'],
        ['覆盖对象', '松江校区 253 间多媒体教室（一教 89、二教 92、四教 32、化工楼 18、中南楼 16、机房 6）'],
        ['使用角色', '管理员（全功能）、工程师/值班人员（业务功能，不含审计与用户管理）'],
        ['部署形态', '单机或局域网内部署，默认监听 0.0.0.0:8420'],
        ['不在范围', '公网访问、移动端 App、与校外系统对接、视频监控接入'],
    ], [28, 122]))
    st.append(H2('1.4 术语'))
    st.append(build_table([
        ['术语', '含义'],
        ['工单 / 终单', '一次报修从受理到关闭的完整记录'],
        ['巡视', '按楼层或区域定期巡检并记录异常'],
        ['mart 表', '为报表预聚合的数据仓库表，写入业务数据时同步维护'],
        ['机器码', '由 MachineGuid、网卡 MAC 与主机名派生，用于授权绑定'],
        ['功能位', '授权文件中声明可用业务模块的字段（modules）'],
    ], [26, 124]))
    st.append(PageBreak())

    # ---------- 2 架构 ----------
    st.append(H1('二、系统架构'))
    st.append(divider())
    st.append(H2('2.1 总体形态'))
    st.append(B('系统为典型的「单机服务 + 浏览器前端」结构：一个 PyInstaller 打包的常驻服务进程提供页面与接口，'
                '用户通过浏览器访问本机或局域网地址。没有外部中间件，不需要单独安装数据库。'))
    st.append(build_table([
        ['层次', '组成', '说明'],
        ['接入层', '浏览器 / 桌面启动器', '启动器负责拉起服务并打开默认浏览器，托盘常驻'],
        ['服务层', 'server.py（Flask）', '37 个 HTTP 路由，负责鉴权、业务逻辑、报表聚合与导出'],
        ['数据层', 'SQLite 单文件库', '业务表 + mart 表 + 会话表，库文件随数据目录迁移'],
        ['交付层', '安装程序 + 授权文件', '安装程序写计划任务、建桌面图标；授权文件控制可用模块与有效期'],
    ], [22, 46, 82]))
    st.append(H2('2.2 技术选型'))
    st.append(build_table([
        ['项目', '选型', '选择理由'],
        ['后端框架', 'Flask 3.1.3', '轻量、单文件即可组织，打包体积可控'],
        ['数据库', 'SQLite', '零安装、单文件备份方便，满足百人级并发写入'],
        ['前端', '原生 JS（IIFE 模块）', '无 Node 构建链，源码可直接部署，降低维护门槛'],
        ['打包', 'PyInstaller 6.22.3（onefile）', '产出单个 exe，安装体验最好'],
        ['授权', 'RSA 签名 + 机器码绑定', '私钥离线保管，客户端仅内嵌公钥验签'],
        ['报表导出', 'reportlab + 前端 SheetJS/jsPDF', 'PDF 服务端生成，Excel/CSV 前端导出'],
    ], [22, 52, 76]))
    st.append(H2('2.3 模块划分'))
    st.append(build_table([
        ['模块', '职责', '主要文件'],
        ['鉴权与会话', '登录、会话过期、权限判定、登录限流', 'server.py（require_auth / require_admin）'],
        ['业务数据', '工单、日志、巡视、教室与设备的读写', 'server.py + assets/views-*.js'],
        ['数据仓库', '业务写入时同步维护 mart 表与索引', 'server.py（init_db 及写入路径）'],
        ['报表与导出', '时间/阶段/责任人聚合，PDF/CSV 导出', 'server.py + report_pdf.py'],
        ['授权', '授权导入、验签、到期只读、功能位校验', 'license_key.py'],
        ['交付', '安装、升级备份、回滚、桌面启动器', 'installer_gui.py、launcher.py、rollback.ps1'],
    ], [24, 62, 64]))
    st.append(H2('2.4 请求链路'))
    st.append(B('浏览器加载 index.html 与 assets 下的脚本 → 登录取得 Bearer 会话令牌 → 前端按路由调用接口 → '
                '服务端先过授权闸门与登录校验，再按业务模块处理 → 业务写入同时刷新 mart 表 → '
                '报表页读取 mart 表聚合结果，导出时由服务端生成 PDF 或前端生成表格文件。'))
    st.append(Paragraph('设计约束：所有业务数据以服务端为准；前端只做展示与输入校验，不承担权限判断的最终责任。',
                        S['note']))
    st.append(PageBreak())

    # ---------- 3 功能 ----------
    st.append(H1('三、功能清单'))
    st.append(divider())
    st.append(B('系统共 13 个一级页面。下表标注各页面的可见范围与所属授权模块。'))
    st.append(build_table([
        ['序号', '页面', '核心功能', '可见范围', '授权模块'],
        ['1', '工作台', '待办概览、近期动态、快捷入口', '全员', 'core'],
        ['2', '来电登记', '电话报修快速录入、指派', '全员', 'core'],
        ['3', '每日工作日志', '按日填报、批量提交、模板导入', '全员', 'core'],
        ['4', '巡视管理', '巡视计划、打卡、异常上报', '全员', 'core'],
        ['5', '日志查询', '多条件检索、详情抽屉、导出', '全员', 'core'],
        ['6', '统计报表', '时间/阶段/责任人统计、趋势、对比、PDF', '全员', 'report'],
        ['7', '知识库', '故障处理经验、常见问题沉淀', '全员', 'kb'],
        ['8', '教室/设备档案', '教室信息、设备台账、保修状态', '全员', 'device'],
        ['9', '导入 / 导出', '批量导入日志、导出数据', '全员', 'core'],
        ['10', '基础配置', '授权导入、教室与字典维护、桌面快捷方式', '全员', 'core'],
        ['11', '审计日志', '关键操作留痕与检索', '仅管理员', 'audit'],
        ['12', '用户与权限', '账号、角色、口令重置', '仅管理员', 'core'],
        ['13', '使用说明', '操作指引、手册下载、关于本系统', '全员', 'core'],
    ], [12, 30, 68, 24, 20], align_center_cols=(0, 3, 4)))
    st.append(Spacer(1, 4 * mm))
    st.append(Paragraph('授权模块说明：modules 为 all、缺失或为空时全部放行；仅当显式列出部分模块时，'
                        '未列出的模块在服务端返回 403，前端同步隐藏入口。', S['note']))
    st.append(PageBreak())

    # ---------- 4 数据与接口 ----------
    st.append(H1('四、数据与接口'))
    st.append(divider())
    st.append(H2('4.1 核心数据表'))
    st.append(build_table([
        ['表名', '用途', '关键字段'],
        ['tickets', '报修工单明细', '教室、故障类型、阶段、责任人、时间'],
        ['patrols', '巡视记录', '楼栋、日期、巡视人、异常数'],
        ['devices', '设备台账', '教室、设备类型、购置日期、保修到期'],
        ['users / sessions', '账号与登录会话', '口令散列、角色、令牌、过期时间'],
        ['audit', '操作审计', '操作人、动作、对象、时间'],
        ['tickets_mart / patrols_mart / devices_mart', '报表预聚合', '按日、按阶段、按责任人的汇总列'],
        ['state_meta', '仓库版本位', '用于判断 mart 是否需要重建'],
    ], [46, 44, 80]))
    st.append(H2('4.2 接口分组'))
    st.append(build_table([
        ['分组', '路径前缀', '说明'],
        ['鉴权', '/api/login、/api/me、/api/logout', '登录、当前用户、退出'],
        ['整包数据', '/api/state', '读写业务数据快照，带版本号校验'],
        ['工单', '/api/tickets', '列表、详情、状态流转'],
        ['巡视', '/api/patrols', '巡视记录读写'],
        ['报表', '/api/report/*', 'summary、trend、patrol、device、compare、pdf，受 report 功能位约束'],
        ['导出', '/api/export/csv', '服务端转码导出'],
        ['审计', '/api/audit', '受 audit 功能位约束'],
        ['用户', '/api/users、/api/groups', '账号与分组管理，仅管理员'],
        ['授权', '/api/license', '读取与导入授权'],
        ['运维', '/api/health、/api/backup', '健康检查、备份恢复'],
    ], [20, 62, 88]))
    st.append(H2('4.3 数据一致性'))
    st.append(bullet('写入业务数据后同步刷新 mart 表，报表读取 mart，避免每次全表扫描业务明细。'))
    st.append(bullet('前端保存采用合并提交，减少连续编辑产生的重复写请求。'))
    st.append(bullet('升级安装前自动备份旧版本程序到 versions 目录，数据目录不随程序卸载删除。'))
    st.append(PageBreak())

    # ---------- 5 授权与 IP ----------
    st.append(H1('五、授权与知识产权机制'))
    st.append(divider())
    st.append(H2('5.1 授权模型'))
    st.append(build_table([
        ['要素', '实现方式'],
        ['签发', 'RSA 私钥签名授权文件；私钥不进入代码仓库与安装包'],
        ['校验', '程序内嵌公钥验签，校验机器码、有效期与功能位'],
        ['机器绑定', 'MachineGuid + 网卡 MAC + 主机名派生机器码'],
        ['试用', '首次运行生成 30 天试用授权，功能完整'],
        ['到期', '只读宽限：可查询与导出，不可写入'],
        ['功能位', 'modules 声明可用模块，服务端按路径前缀拦截'],
        ['兼容', '字段缺失或为 all 时全部放行，保证存量授权可用'],
    ], [26, 124]))
    st.append(H2('5.2 权属标识'))
    st.append(bullet('页面 meta、登录页与「关于本系统」卡片标注著作权人与使用限制。'))
    st.append(bullet('三个 exe 写入 Windows 版本资源：公司名、产品名、版权、版本号。'))
    st.append(bullet('前端发布产物统一注入版权 banner，并生成 assets-manifest.json 记录摘要值。'))
    st.append(bullet('发布脚本内置断言：发现私钥类文件、压缩产物缺失、版本资源缺失时中止构建。'))
    st.append(H2('5.3 已知边界'))
    st.append(B('前端代码最终对使用者可见，压缩与混淆只能提高阅读成本。真正的护城河是服务端业务规则与数据口径，'
                '因此核心统计逻辑一律放在服务端，前端只做展示。知识库与设备档案目前数据随整包下发，'
                '仅实现菜单级隐藏，若要硬约束需拆分为独立接口。'))
    st.append(PageBreak())

    # ---------- 6 版本迭代 ----------
    st.append(H1('六、版本迭代记录'))
    st.append(divider())
    st.append(B('早期版本（v1.0.9 至 v1.3.0）以使用手册形式留存，代码快照与变更说明不完整；'
                '自 v1.3.10 起建立逐版本变更摘要与归档。'))
    st.append(build_table([
        ['版本', '日期', '主题', '主要变更'],
        ['v1.2.x', '2026-11 前', '功能成型', '工单、日志、巡视、报表、档案等业务模块陆续上线；输出使用手册 v1.0.9—v1.2.8'],
        ['v1.3.0', '2026-11 上旬', '架构整理', 'mart 表与报表聚合落地，输出开发架构文档 v1.2.0'],
        ['v1.3.8', '2026-11-13', '交接准备', '补充开发交接说明，明确环境依赖与构建方式'],
        ['v1.3.10', '2026-11-14', '安全与性能', 'P0 加固：静态资源白名单、PBKDF2 口令、会话过期、登录限流；首屏资源按需加载（约 -60%）；保存合并'],
        ['v1.3.11', '2026-11-14', '授权体验', '基础配置与锁屏页支持直接选择 license.json 导入，自动剔除 BOM'],
        ['v1.3.12', '2026-11-14', '安装可靠性', '修复「服务在 25 秒内未能访问」：计划任务失败兜底启动、返回值检查、服务端日志三级回退'],
        ['v1.3.13', '2026-11-15', '知识产权加固', '版权声明、exe 版本资源、私钥隔离断言、前端压缩流水线与产物校验'],
        ['v1.4.0', '2026-11-15', '授权治理', '功能位生效：服务端拦截报表与审计，前端菜单同步隐藏，存量授权默认放行'],
        ['v1.4.1', '2026-11-15', '阶段定稿', '修复报表接口无筛选参数时的 SQL 拼接 500；第一阶段收口'],
        ['v1.5.0-beta.1', '2026-11-15', '封测版', '第一阶段成果固化，版本资源支持预发布后缀，用于封测验证与问题收集'],
    ], [26, 22, 28, 94], align_center_cols=(0, 1)))
    st.append(PageBreak())

    # ---------- 7 开发过程 ----------
    st.append(H1('七、开发过程总结'))
    st.append(divider())
    st.append(H2('7.1 阶段划分'))
    st.append(build_table([
        ['阶段', '目标', '产出'],
        ['一、安全加固', '消除越权访问与弱口令风险', '静态白名单、PBKDF2、会话过期、登录限流'],
        ['二、体验优化', '缩短首屏与减少无效写入', '资源按需加载、保存合并、库归档'],
        ['三、交付可靠性', '解决安装后服务未启动', '兜底启动、日志三级回退、25 秒等待窗口加固'],
        ['四、知识产权', '建立权属标识与发布治理', '版权声明、版本资源、压缩流水线、发布前断言'],
        ['五、授权治理', '让授权字段真正生效', '功能位拦截、菜单隐藏、兼容放行、报表接口修复'],
    ], [28, 52, 90]))
    st.append(H2('7.2 关键问题与处置'))
    st.append(build_table([
        ['问题', '根因', '处置'],
        ['安装后提示服务 25 秒内不可访问', '仅依赖计划任务启动，失败无兜底且服务端崩溃无日志', '增加 schtasks 返回值检查、兜底直接启动、stderr 三级回退日志'],
        ['日志目录无写权限时无法排查', '日志路径写死且失败静默', '改为数据目录→程序目录→TEMP 依次回退'],
        ['授权文件里的模块与人数不生效', '字段只写不读，无任何校验', '增加功能位闸门与兼容规则，先服务端后前端'],
        ['报表接口裸调返回 500', 'WHERE 子句为空时下游直接拼 AND，形成 FROM ... AND', '无条件时返回 WHERE 1=1，一处规则覆盖全部调用方'],
        ['同一缺陷出现在多个接口', '各函数自行拼接 SQL，缺少统一构造入口', '统一由公共函数生成子句，patrol 单独分支一并修正'],
        ['前端资源约 655KB 明文发布', '无构建流程，源码即发布件', '引入 rjsmin/rcssmin 压缩与 banner 注入，源码与产物分离'],
    ], [38, 62, 70]))
    st.append(H2('7.3 经验与教训'))
    st.append(bullet('先定位再动手：安装失败问题靠临时诊断日志才锁定到数据目录权限，直接改等待时间是无效的。'))
    st.append(bullet('兼容优先：任何授权或校验规则上线前，先定义「老数据如何被放行」，否则一升级就会锁死客户。'))
    st.append(bullet('改动要可回滚：每版保留旧版本程序目录与回滚脚本，数据目录永不随升级覆盖。'))
    st.append(bullet('不要为了加固而更换工具链：Nuitka 迁移会改变启动路径，直接冲击刚修好的安装等待逻辑，收益与风险不匹配。'))
    st.append(bullet('压缩收益要实测：本系统源码已相当紧凑，压缩仅节省约 18%，主要价值在权属标识与流程规范化，而非体积。'))
    st.append(PageBreak())

    # ---------- 8 构建发布 ----------
    st.append(H1('八、构建与发布流程'))
    st.append(divider())
    st.append(H2('8.1 环境'))
    st.append(build_table([
        ['项目', '要求'],
        ['操作系统', 'Windows 10 / 11'],
        ['Python', '3.11（构建虚拟环境 .build-venv，已含全部依赖）'],
        ['打包依赖', 'PyInstaller 6.22.3、flask、cryptography、reportlab、pystray、pillow'],
        ['压缩依赖', 'rjsmin、rcssmin（构建脚本自动调用 .build-venv 内解释器）'],
    ], [26, 124]))
    st.append(H2('8.2 构建步骤'))
    st.append(bullet('执行 build_release.ps1 -Version x.y.z -Notes "变更说明"，脚本自动写入版本文件。'))
    st.append(bullet('压缩前端资源到 build/assets，并生成 build/assets-manifest.json。'))
    st.append(bullet('生成三个 exe 的版本资源，随后依次打包服务端、启动器与安装程序。'))
    st.append(bullet('发布前断言：私钥类文件、压缩产物、版本资源任一异常即中止。'))
    st.append(bullet('归档到 releases/vx.y.z/，追加 releases.json 并生成一键安装包 zip。'))
    st.append(H2('8.3 升级与回滚'))
    st.append(B('升级安装时，安装程序把运行中的旧版本程序备份到安装目录 versions/旧版本号/，并复制旧 version.json；'
                '双击安装目录下「版本回滚.bat」即可恢复。数据库文件不在回滚范围内，升级前应单独备份数据目录。'))
    st.append(PageBreak())

    # ---------- 9 封测 ----------
    st.append(H1('九、封测说明'))
    st.append(divider())
    st.append(H2('9.1 封测版本'))
    st.append(build_table([
        ['项目', '内容'],
        ['版本号', 'v1.5.0-beta.1'],
        ['基线', 'v1.4.1（第一阶段定稿）'],
        ['安装包', '东华大学多媒体教室运维系统_v1.5.0-beta.1_一键安装包.zip（81.65 MB）'],
        ['SHA256', '79035B0ABC6DD0092832B207EC9AACAC043530B3BB58B26AF808F5183C581661'],
        ['文件版本', '1.5.0.0（ProductVersion 显示 1.5.0-beta.1）'],
        ['定位', '功能冻结，仅接受缺陷修复与环境适配，不再引入新功能'],
    ], [26, 124]))
    st.append(H2('9.2 封测范围'))
    st.append(bullet('安装与升级：全新安装、覆盖升级、回滚、卸载后数据保留。'))
    st.append(bullet('授权：试用到期只读、正式授权导入、机器码不匹配、功能位受限四种场景。'))
    st.append(bullet('业务主链路：来电登记 → 日志填报 → 巡视 → 查询 → 报表导出。'))
    st.append(bullet('异常环境：无外网、数据目录无写权限、端口被占用、杀毒软件拦截。'))
    st.append(H2('9.3 验证重点'))
    st.append(build_table([
        ['优先', '验证项', '判定标准'],
        ['高', '升级后存量数据与授权是否可用', '登录正常、历史数据完整、功能位为 all 时无 403'],
        ['高', '报表数值与导出是否一致', '页面数值与导出一致，PDF 可正常打开'],
        ['中', '安装后服务能否自动启动', '重启系统后无需手工操作即可访问'],
        ['中', '受限授权下的菜单与接口', '未授权菜单不显示，直接调用返回 403'],
        ['低', '界面文案与版权信息', '版本号、著作权人显示正确'],
    ], [14, 66, 90], align_center_cols=(0,)))
    st.append(H2('9.4 已知问题与限制'))
    st.append(build_table([
        ['编号', '问题', '影响', '计划'],
        ['K-01', '知识库与设备档案仅菜单级隐藏，数据随整包下发', '普通用户可见入口已隐藏，技术上仍可读取', '下一阶段拆独立接口'],
        ['K-02', '巡视报表关联工单数的条件缺少括号，AND/OR 优先级导致口径偏宽', '统计数可能大于实际', '下一阶段修正并回归'],
        ['K-03', 'CSV 导出未做公式注入转义', '用 Excel 打开存在公式执行风险', '下一阶段处理'],
        ['K-04', 'SQLite 未启用 WAL 与忙等超时', '高并发写入时可能出现短暂锁等待', '下一阶段评估'],
        ['K-05', '无权在线更新与崩溃自动上报', '问题定位依赖现场日志', '后续版本规划'],
    ], [14, 66, 60, 30], align_center_cols=(0,)))
    st.append(H2('9.5 反馈与处置'))
    st.append(B('封测期间问题统一记录为「编号 / 现象 / 复现步骤 / 环境 / 日志片段 / 影响范围」，'
                '按阻断、严重、一般、建议四级分类。阻断级问题当日修复并重出封测包，'
                '严重级问题累积后随下一封测包发布，一般与建议级进入下一阶段需求池。'))
    st.append(PageBreak())

    # ---------- 10 路线 ----------
    st.append(H1('十、后续改进路线'))
    st.append(divider())
    st.append(build_table([
        ['优先级', '方向', '具体内容'],
        ['高', '报表可信度', '修正巡视关联统计口径；报表全部改为 SQL 聚合；去掉前端内存统计兜底，统一服务端口径'],
        ['高', '数据安全', 'SQLite 启用 WAL 与忙等超时；CSV 公式注入转义；备份恢复前做完整性检查并自动快照'],
        ['中', '授权完整性', '签发工具支持模块勾选；知识库与设备档案拆分独立接口，实现硬约束'],
        ['中', '知识产权', '完成软件著作权登记；导出件增加机构与机器码水印；评估代码签名证书'],
        ['低', '交付体验', '增加在线更新与崩溃上报；安装包体积优化（手册 PDF 按需分发）'],
    ], [14, 34, 122], align_center_cols=(0,)))
    st.append(Spacer(1, 6 * mm))
    st.append(Paragraph('本文件随封测推进持续修订，正式发布版将另行出具 v1.5.0 定稿。', S['note']))

    return st


def main():
    doc = Doc(OUT, pagesize=A4, title='东华大学多媒体教室运维系统 开发文档 %s' % DOC_VER,
              author='东华大学信息中心', subject='开发文档（封测版）')
    doc.multiBuild(story())
    print('[完成] %s' % OUT)


if __name__ == '__main__':
    main()
