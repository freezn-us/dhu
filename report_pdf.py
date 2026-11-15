"""统计报告 PDF 生成（服务端矢量 PDF，替代前端截图方案）

输入 payload（由前端 /api/report/pdf 提交）：
{
  from, to, tx, days, org, analysis,
  kpi: {total, closed, open, avgDispatch, avgArrive, avgHandle, avgClose, slaRate, satisfaction, urgent},
  types: [{name, count, ratio, color}],
  buildings: [{name, count}],
  rooms: [{name, count}],
  statuses: [{name, count, color}],
  trend: [{date, count}],
  engineers: [{name, total, resolved, closed, handleAvg, sat}]
}
"""
import io
import datetime as _dt
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, LongTable, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, Frame)

FONT, FONT_B = 'CJK', 'CJKB'
_registered = False

BRAND = colors.HexColor('#1677ff')
BRAND_DARK = colors.HexColor('#0d3d86')
SUB = colors.HexColor('#646a73')
FAINT = colors.HexColor('#8f959e')
LINE = colors.HexColor('#eef0f3')
HEAD_BG = colors.HexColor('#f7f9fc')
SOFT_BG = colors.HexColor('#fafcff')
SOFT_LINE = colors.HexColor('#dbeafe')


def _reg(name, paths):
    for p in paths:
        try:
            pdfmetrics.registerFont(TTFont(name, p, subfontIndex=0) if p.lower().endswith('.ttc') else TTFont(name, p))
            return True
        except Exception:
            continue
    return False


def _ensure_fonts():
    global _registered
    if _registered:
        return
    ok = _reg(FONT, ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyh.ttf',
                     'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/simsun.ttc'])
    if not ok:
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        pdfmetrics.registerFontFamily('STSong-Light', normal='STSong-Light', bold='STSong-Light',
                                      italic='STSong-Light', boldItalic='STSong-Light')
    else:
        _reg(FONT_B, ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyhbd.ttf',
                      'C:/Windows/Fonts/simhei.ttf']) or pdfmetrics.registerFontFamily(
            FONT, normal=FONT, bold=FONT_B, italic=FONT, boldItalic=FONT_B)
    _registered = True


def _S():
    _ensure_fonts()
    use_b = FONT_B if FONT_B in pdfmetrics.getRegisteredFontNames() else FONT
    return {
        'title': ParagraphStyle('t', fontName=use_b, fontSize=19, leading=26,
                                alignment=TA_CENTER, textColor=BRAND_DARK),
        'sub': ParagraphStyle('s', fontName=FONT, fontSize=9.5, leading=14,
                              alignment=TA_CENTER, textColor=SUB),
        'meta': ParagraphStyle('m', fontName=FONT, fontSize=9, leading=14, textColor=SUB),
        'h2': ParagraphStyle('h2', fontName=use_b, fontSize=11.5, leading=18, textColor=BRAND,
                             spaceBefore=12, spaceAfter=6),
        'body': ParagraphStyle('b', fontName=FONT, fontSize=9.5, leading=15.5, textColor=colors.HexColor('#1f2329')),
        'cell': ParagraphStyle('c', fontName=FONT, fontSize=9, leading=13),
        'cell_r': ParagraphStyle('cr', fontName=FONT, fontSize=9, leading=13, alignment=TA_RIGHT),
        'cell_c': ParagraphStyle('cc', fontName=FONT, fontSize=9, leading=13, alignment=TA_CENTER),
        'cellb': ParagraphStyle('cb', fontName=use_b, fontSize=9, leading=13),
        'cellb_r': ParagraphStyle('cbr', fontName=use_b, fontSize=9, leading=13, alignment=TA_RIGHT),
        'cellb_c': ParagraphStyle('cbc', fontName=use_b, fontSize=9, leading=13, alignment=TA_CENTER),
        'kpi_val': ParagraphStyle('kv', fontName=use_b, fontSize=15, leading=20, textColor=BRAND_DARK),
        'note': ParagraphStyle('n', fontName=FONT, fontSize=8, leading=12, textColor=FAINT),
        '_bold': use_b,
    }


def _bar(value, max_value, width_pt, color_hex):
    """用两段色块模拟横向条形图。"""
    if not max_value:
        return Paragraph('', _S()['cell'])
    ratio = max(0.0, min(1.0, float(value) / float(max_value)))
    fill = max(1.0, width_pt * ratio)
    t = Table([['', '']], colWidths=[fill, max(1.0, width_pt - fill)], rowHeights=[6])
    try:
        c = colors.HexColor(color_hex) if color_hex else BRAND
    except Exception:
        c = BRAND
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), c),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#f0f2f5')),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def build_report_pdf(p):
    _ensure_fonts()
    S = _S()
    bold = S['_bold']
    kpi = p.get('kpi') or {}
    content_w = A4[0] - 2 * 42

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4,
                          leftMargin=42, rightMargin=42, topMargin=58, bottomMargin=52,
                          title='东华大学多媒体教室运维统计报告',
                          author='东华大学多媒体教室运维系统')

    def _footer(canvas, d):
        canvas.saveState()
        canvas.setFont(FONT, 7.5)
        canvas.setFillColor(FAINT)
        canvas.drawString(42, 30, '本报告由东华大学多媒体教室运维系统自动生成 · 数据仅供运维管理参考')
        canvas.drawRightString(A4[0] - 42, 30, '第 %d 页' % d.page)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(42, 42, A4[0] - 42, 42)
        canvas.restoreState()

    frame = Frame(42, 52, content_w, A4[1] - 110, id='f', leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=_footer)])

    story = []
    story.append(Paragraph('东华大学松江校区多媒体教室运维统计报告', S['title']))
    story.append(Paragraph('数据来源：每日工作日志与报修记录自动汇总 · 系统生成', S['sub']))
    story.append(Spacer(1, 8))

    meta = '统计区间：<b>%s</b>（共 %s 天）　·　生成时间：%s　·　编制单位：%s' % (
        escape(str(p.get('tx') or '')), escape(str(p.get('days') or '')), escape(str(p.get('now') or '')),
        escape(str(p.get('org') or '东华大学信息中心')))
    story.append(Paragraph(meta, S['meta']))
    story.append(Spacer(1, 4))
    story.append(Table([['']], colWidths=[content_w], rowHeights=[2],
                       style=TableStyle([('BACKGROUND', (0, 0), (-1, -1), BRAND),
                                         ('TOPPADDING', (0, 0), (-1, -1), 0),
                                         ('BOTTOMPADDING', (0, 0), (-1, -1), 0)])))
    story.append(Spacer(1, 12))

    # 一、KPI 卡片（3 列）
    def _kv(lab, val, sub):
        inner = Table([[Paragraph(lab, S['cell'])], [Paragraph(escape(str(val)), S['kpi_val'])],
                       [Paragraph(sub, S['note'])]],
                      colWidths=[(content_w - 16) / 3.0])
        inner.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                                   ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                                   ('BACKGROUND', (0, 0), (-1, -1), SOFT_BG),
                                   ('BOX', (0, 0), (-1, -1), 0.4, SOFT_LINE)]))
        return inner

    total = kpi.get('total', 0) or 0
    closed = kpi.get('closed', 0) or 0
    open_n = kpi.get('open', 0) or 0
    close_rate = round(closed / total * 100) if total else 0
    avg_day = round(total / float(p.get('days') or 1), 1) if p.get('days') else 0

    row1 = [
        _kv('工单总量', total, '日均 %s 条' % avg_day),
        _kv('已记录 / 完成率', closed, '%d%% · 待填报 %s' % (close_rate, open_n)),
        _kv('平均响应', ('%s 分' % kpi.get('avgArrive')) if kpi.get('avgArrive') is not None else '—',
            'SLA 达标 %s' % (('%s%%' % kpi.get('slaRate')) if kpi.get('slaRate') is not None else '—')),
    ]
    row2 = [
        _kv('平均处理时长', ('%s 分' % kpi.get('avgHandle')) if kpi.get('avgHandle') is not None else '—',
            '平均完结 %s' % (('%s 分' % kpi.get('avgClose')) if kpi.get('avgClose') is not None else '—')),
        _kv('平均满意度', ('%.1f / 5' % kpi['satisfaction']) if kpi.get('satisfaction') is not None else '—',
            '紧急 %s 条' % (kpi.get('urgent') or 0)),
        _kv('平均指派', ('%s 分' % kpi.get('avgDispatch')) if kpi.get('avgDispatch') is not None else '—', '从登记到派单'),
    ]
    grid = Table([row1, row2], colWidths=[content_w / 3.0 + 4] * 3)
    grid.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                              ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                              ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    story.append(grid)
    story.append(Spacer(1, 6))

    # 二、分析
    analysis = (p.get('analysis') or '').strip()
    if analysis:
        story.append(Paragraph('一、分析结论', S['h2']))
        box = Table([[Paragraph(escape(analysis).replace('\n', '<br/>'), S['body'])]], colWidths=[content_w])
        box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f5f9ff')),
            ('LINEBEFORE', (0, 0), (0, -1), 2.2, BRAND),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(box)

    # 三、故障类型
    types = p.get('types') or []
    story.append(Paragraph('二、故障类型分布', S['h2']))
    rows = [[Paragraph('故障类型', S['cellb']), Paragraph('数量', S['cellb_r']),
             Paragraph('占比', S['cellb_r']), Paragraph('', S['cellb'])]]
    max_cnt = types[0]['count'] if types else 1
    for t in types[:12]:
        rows.append([
            Paragraph(escape(str(t.get('name') or '')), S['cell']),
            Paragraph(str(t.get('count') or 0), S['cell_r']),
            Paragraph('%d%%' % round(t.get('ratio') or 0), S['cell_r']),
            _bar(t.get('count') or 0, max_cnt, content_w - 330, t.get('color')),
        ])
    if not types:
        rows.append([Paragraph('暂无数据', S['cell']), '', '', ''])
    tbl = LongTable(rows, colWidths=[content_w - 330, 52, 52, content_w - (content_w - 330) - 104], repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (2, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)

    # 三、工单趋势走势
    trend = p.get('trend') or []
    total_cnt = sum((t.get('count') or 0) for t in trend)
    if trend:
        story.append(Paragraph('三、工单趋势走势', S['h2']))
        # 趋势条形图：把日期简化为 MM-DD，按日显示
        max_trend = max((t.get('count') or 0) for t in trend) if trend else 1
        # 如果日期太多（>25天），先合并到"周"粒度避免过密
        if len(trend) > 25:
            # 按周聚合
            weekly = {}
            for t in trend:
                dt = str(t.get('date') or '')
                if len(dt) >= 10:
                    key = dt[:10]
                    try:
                        d = _dt.date.fromisoformat(key)
                        # 找本周周一
                        monday = d - _dt.timedelta(days=d.weekday())
                        wk = '%02d-%02d' % (monday.month, monday.day)
                    except Exception:
                        wk = key[:5]
                else:
                    wk = dt[:5]
                weekly[wk] = weekly.get(wk, 0) + (t.get('count') or 0)
            trend_plot = [{'date': k + '起', 'count': v} for k, v in sorted(weekly.items())]
        else:
            trend_plot = []
            for t in trend:
                dt = str(t.get('date') or '')
                label = dt[5:10] if len(dt) >= 10 else dt[:5]
                trend_plot.append({'date': label, 'count': t.get('count') or 0})

        max_t = max((t['count'] for t in trend_plot), default=1)
        # 构建趋势条形表：日期 + 数量 + 条形（双列布局，只左组有表头）
        bar_area_w = content_w - 160
        trows = [[Paragraph('日期', S['cellb']), Paragraph('工单量', S['cellb_r']),
                  Paragraph('', S['cellb']), Paragraph('', S['cellb']), Paragraph('', S['cellb_r']),
                  Paragraph('', S['cellb'])]]
        # 分两列排布（奇数/偶数行）
        left, right = [], []
        for i, t in enumerate(trend_plot):
            row = [
                Paragraph(escape(t['date']), S['cell']),
                Paragraph(str(t['count']), S['cell_r']),
                _bar(t['count'], max_t, bar_area_w // 2, BRAND),
            ]
            if i % 2 == 0:
                left.append(row)
            else:
                right.append(row)
        # 合并成大表
        merged = []
        for i in range(max(len(left), len(right))):
            r = left[i] if i < len(left) else [Paragraph('', S['cell']), '', Paragraph('', S['cell'])]
            rr = right[i] if i < len(right) else [Paragraph('', S['cell']), '', Paragraph('', S['cell'])]
            merged.append(r + rr)
        trows.extend(merged)
        trend_tbl = LongTable(trows,
                              colWidths=[58, 44, bar_area_w // 2, 58, 44, bar_area_w // 2],
                              repeatRows=1)
        trend_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(trend_tbl)
        avg_d = round(total_cnt / float(len(trend_plot)), 1) if trend_plot else 0
        story.append(Paragraph('区间共 %s 个统计点，合计 %s 条工单，平均每点 %.1f 条' % (
            len(trend_plot), total_cnt, avg_d), S['note']))
        story.append(Spacer(1, 4))

    # 四、工单状态分布
    statuses = p.get('statuses') or []
    if statuses:
        story.append(Paragraph('四、工单状态分布', S['h2']))
        rows_st = [[Paragraph('状态', S['cellb']), Paragraph('数量', S['cellb_r']),
                    Paragraph('占比', S['cellb_r']), Paragraph('', S['cellb'])]]
        max_st = statuses[0].get('count', 1) if statuses else 1
        total_st = sum(s.get('count') or 0 for s in statuses) or 1
        for s in statuses:
            cnt = s.get('count') or 0
            pct = round(cnt / total_st * 100)
            rows_st.append([
                Paragraph(escape(str(s.get('name') or '')), S['cell']),
                Paragraph(str(cnt), S['cell_r']),
                Paragraph('%d%%' % pct, S['cell_r']),
                _bar(cnt, max_st, content_w - 330, s.get('color')),
            ])
        st_tbl = Table(rows_st, colWidths=[content_w - 330, 52, 52, content_w - (content_w - 330) - 104])
        st_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (2, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(st_tbl)
        story.append(Spacer(1, 4))

    # 五、教室分布 TOP 10
    rooms = p.get('rooms') or []
    if rooms:
        story.append(Paragraph('五、教室分布 TOP 10', S['h2']))
        room_rows = [[Paragraph('排名', S['cellb_c']), Paragraph('教室', S['cellb']),
                      Paragraph('工单数', S['cellb_r']), Paragraph('占比', S['cellb_r']),
                      Paragraph('', S['cellb'])]]
        max_rm = rooms[0].get('count', 1) if rooms else 1
        total_rm = sum(r.get('count') or 0 for r in rooms) or 1
        for i, r in enumerate(rooms[:10]):
            cnt = r.get('count') or 0
            pct = round(cnt / total_rm * 100)
            medal_colors = ['#faad14', '#bfbfbf', '#d46b08']
            medal = str(i + 1)
            color = medal_colors[i] if i < 3 else None
            room_rows.append([
                Paragraph(escape(medal), S['cell_c']) if not color else
                Paragraph('<font color="%s"><b>%s</b></font>' % (color, medal), S['cell_c']),
                Paragraph(escape(str(r.get('name') or '')), S['cell']),
                Paragraph(str(cnt), S['cell_r']),
                Paragraph('%d%%' % pct, S['cell_r']),
                _bar(cnt, max_rm, content_w - 380, None),
            ])
        if len(room_rows) == 1:
            room_rows.append([Paragraph('暂无数据', S['cell']), '', '', '', ''])
        rm_tbl = LongTable(room_rows,
                           colWidths=[36, content_w - 424, 52, 52, content_w - (content_w - 424) - 140],
                           repeatRows=1)
        rm_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(rm_tbl)
        story.append(Spacer(1, 4))

    # 六、楼栋完整分布
    buildings = p.get('buildings') or []
    if buildings:
        story.append(Paragraph('六、楼栋完整分布', S['h2']))
        bld_rows = [[Paragraph('排名', S['cellb_c']), Paragraph('楼栋', S['cellb']),
                     Paragraph('工单数', S['cellb_r']), Paragraph('占比', S['cellb_r']),
                     Paragraph('', S['cellb'])]]
        max_bd = buildings[0].get('count', 1) if buildings else 1
        total_bd = sum(b.get('count') or 0 for b in buildings) or 1
        for i, b in enumerate(buildings):
            cnt = b.get('count') or 0
            pct = round(cnt / total_bd * 100)
            medal_colors = ['#faad14', '#bfbfbf', '#d46b08']
            medal = str(i + 1)
            color = medal_colors[i] if i < 3 else None
            bld_rows.append([
                Paragraph(escape(medal), S['cell_c']) if not color else
                Paragraph('<font color="%s"><b>%s</b></font>' % (color, medal), S['cell_c']),
                Paragraph(escape(str(b.get('name') or '')), S['cell']),
                Paragraph(str(cnt), S['cell_r']),
                Paragraph('%d%%' % pct, S['cell_r']),
                _bar(cnt, max_bd, content_w - 380, None),
            ])
        if len(bld_rows) == 1:
            bld_rows.append([Paragraph('暂无数据', S['cell']), '', '', '', ''])
        bd_tbl = LongTable(bld_rows,
                           colWidths=[36, content_w - 424, 52, 52, content_w - (content_w - 424) - 140],
                           repeatRows=1)
        bd_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(bd_tbl)
        story.append(Spacer(1, 4))

    # 七、工程师工作量
    engineers = p.get('engineers') or []
    story.append(Paragraph('七、工程师工作量', S['h2']))
    ers = [[Paragraph('工程师', S['cellb']), Paragraph('处理', S['cellb_r']), Paragraph('已处理', S['cellb_r']),
            Paragraph('已记录', S['cellb_r']), Paragraph('平均处理（分）', S['cellb_r']), Paragraph('满意度', S['cellb_r'])]]
    for e in engineers:
        ers.append([
            Paragraph(escape(str(e.get('name') or '')), S['cell']),
            Paragraph(str(e.get('total') or 0), S['cell_r']),
            Paragraph(str(e.get('resolved') or 0), S['cell_r']),
            Paragraph(str(e.get('closed') or 0), S['cell_r']),
            Paragraph('—' if e.get('handleAvg') is None else str(e.get('handleAvg')), S['cell_r']),
            Paragraph('—' if e.get('sat') is None else '%.1f' % e.get('sat'), S['cell_r']),
        ])
    if len(ers) == 1:
        ers.append([Paragraph('暂无数据', S['cell']), '', '', '', '', ''])
    et = LongTable(ers, colWidths=[content_w - 300, 60, 60, 60, 78, 42], repeatRows=1)
    et.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
        ('ALIGN', (1, 0), (5, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(et)

    doc.build(story)
    return buf.getvalue()
