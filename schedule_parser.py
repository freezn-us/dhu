# -*- coding: utf-8 -*-
"""排课表 PDF 解析器。

输入《东华大学松江校区值班记录表》PDF（每天一个文件，4 页为同日分页），
按坐标解析出 13 个时段的「课 / 借」占用情况。

设计原则：
- 不依赖固定页码，按页累积教室行；
- 时段从表头时间文字动态读取，不写死 13 节；
- 只认「课」「借」两种标记，其他文字忽略；
- 解析失败抛出 ScheduleParseError，附可读原因，供前端逐文件提示。
"""
import datetime
import hashlib
import re

try:
    import pymupdf
except ImportError:  # pragma: no cover - 打包环境由 PyInstaller 注入
    pymupdf = None


class ScheduleParseError(Exception):
    pass


DATE_RE = re.compile(r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日')
START_RE = re.compile(r'^(\d{1,2}):(\d{2})-$')
END_RE = re.compile(r'^(\d{1,2}):(\d{2})$')
ROOM_RE = re.compile(r'^松[12]\d{3}$')
WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
HEADER_WORDS = {'时间', '教室', '上午', '下午', '晚上', '备注', '课', '借'}
# 没有容量、也没有课/借标记的版式文字（如「体育馆」分组标题）不算教室；
# 这几个特殊行即使为空也保留，供前端放入「其他」分组。
SPECIAL_KEEP = {'1号学院楼同传室', '待定', '松1254(不使用)', '松江体育馆电化'}


def _center(w):
    return (w[0] + w[2]) / 2.0, (w[1] + w[3]) / 2.0


def _clean(s):
    return re.sub(r'\s+', '', s or '')


def _page_date(page):
    text = page.get_text('text')
    m = DATE_RE.search(text)
    if not m:
        return None
    try:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _find_footer_y(words, page_height):
    """表格底边：页脚「值班时间」所在行，找不到则取页面 92% 处。"""
    for w in words:
        t = _clean(w[4])
        if t.startswith('值班时间') or t.startswith('值班人员'):
            return w[1]
    return page_height * 0.92


def _find_columns(words, top, bottom):
    """表头 1..13 的列中心 x；返回 [(idx, cx)]。"""
    nums = []
    for w in words:
        t = _clean(w[4])
        if t.isdigit() and 1 <= int(t) <= 13 and w[1] > top and w[1] < bottom and w[0] < 520:
            nums.append((int(t), _center(w)[0], w[1]))
    if len(nums) < 13:
        raise ScheduleParseError('表头时段列不完整（只识别到 %d 列）' % len(nums))
    # 按 y 聚成行，取包含完整 1..13 的那一行
    rows = []
    for n, cx, y in sorted(nums, key=lambda x: x[2]):
        if not rows or abs(rows[-1][0] - y) > 4:
            rows.append([y, []])
        rows[-1][1].append((n, cx))
    for y, items in rows:
        got = dict((n, cx) for n, cx, _ in [(n, cx, 0) for n, cx in items])
        if all(i in got for i in range(1, 14)):
            return sorted(((i, got[i]) for i in range(1, 14)), key=lambda x: x[0])
    raise ScheduleParseError('未找到完整的 1–13 节表头')


def _find_slots(words, columns, top):
    """从表头两行文字解析每节起止时间。"""
    starts, ends = [], []
    for w in words:
        t = _clean(w[4])
        if w[1] > top:
            continue
        m = START_RE.match(t)
        if m:
            starts.append((_center(w)[0], int(m.group(1)) * 60 + int(m.group(2)), w[1]))
            continue
        m = END_RE.match(t)
        if m:
            ends.append((_center(w)[0], int(m.group(1)) * 60 + int(m.group(2)), w[1]))
    if len(starts) < len(columns):
        raise ScheduleParseError('表头时间文字不完整（只识别到 %d 个开始时间）' % len(starts))
    slots = []
    for idx, cx in columns:
        cand = [s for s in starts if abs(s[0] - cx) <= 18]
        if not cand:
            cand = sorted(starts, key=lambda s: abs(s[0] - cx))[:1]
        s = min(cand, key=lambda s: abs(s[0] - cx))
        ends_c = [e for e in ends if abs(e[0] - cx) <= 18 and e[1] > s[1]]
        if not ends_c:
            ends_c = [e for e in ends if e[1] > s[1]]
        e = min(ends_c, key=lambda e: abs(e[0] - cx)) if ends_c else None
        if not e:
            raise ScheduleParseError('第 %d 节缺少结束时间' % idx)
        slots.append({
            'index': idx,
            'start': '%02d:%02d' % (s[1] // 60, s[1] % 60),
            'end': '%02d:%02d' % (e[1] // 60, e[1] % 60),
            'minutes': e[1] - s[1],
        })
    return slots


def _room_name(raw):
    return _clean(raw).replace('（', '(').replace('）', ')')


def _classify(name):
    m = ROOM_RE.match(name)
    if m:
        building = '一教' if name[1] == '1' else '二教'
        return building, name[1:], False
    return '其他', '', True


def _parse_page(page, page_no):
    words = page.get_text('words')
    date = _page_date(page)
    if not date:
        raise ScheduleParseError('第 %d 页未找到值班日期' % page_no)
    footer_y = _find_footer_y(words, page.rect.height)
    header_top = 30
    columns = _find_columns(words, header_top, 110)
    slots = _find_slots(words, columns, 95)
    col_x = [cx for _, cx in columns]

    # 教室行：左侧一列的文字
    room_words = []
    for w in words:
        t = _room_name(w[4])
        if not t or t in HEADER_WORDS:
            continue
        # 页眉文字（时间/教室/上午/下午）在 y≈50–72；个别分页首个教室行会紧贴表头，
        # 因此这里不能按固定 y=88 切，否则会漏掉当天第一行教室及其占用标记。
        if w[0] >= 95 or w[1] < 80 or w[3] >= footer_y:
            continue
        if DATE_RE.search(t) or t.startswith('值班') or t in ('星期', '日'):
            continue
        if t.isdigit():
            continue
        room_words.append((w, t))
    if not room_words:
        raise ScheduleParseError('第 %d 页未识别到教室行' % page_no)

    # 同一行只取一个教室名（按 y 去重，优先 x 更小的）
    room_words.sort(key=lambda x: (x[0][1], x[0][0]))
    rows = []
    for w, name in room_words:
        cy = _center(w)[1]
        if rows and abs(rows[-1]['cy'] - cy) <= 4:
            continue
        rows.append({'name': name, 'cy': cy, 'slots': [None] * len(columns),
                     'capacity': None, 'raw': w[4]})

    # 容量：右侧数字列
    caps = [w for w in words if w[0] > 500 and _clean(w[4]).isdigit()]
    for r in rows:
        cand = [w for w in caps if abs(_center(w)[1] - r['cy']) <= 6]
        if cand:
            r['capacity'] = int(_clean(min(cand, key=lambda w: abs(_center(w)[1] - r['cy']))[4]))

    # 课 / 借 / 考
    marks = [w for w in words if _clean(w[4]) in ('课', '借', '考', '考试')]
    kind_pri = {'class': 3, 'exam': 2, 'borrow': 1}
    for w in marks:
        cx, cy = _center(w)
        if cy <= 80 or cy >= footer_y:
            continue
        ri = min(range(len(rows)), key=lambda i: abs(rows[i]['cy'] - cy))
        if abs(rows[ri]['cy'] - cy) > 9:
            continue
        ci = min(range(len(col_x)), key=lambda i: abs(col_x[i] - cx))
        if abs(col_x[ci] - cx) > 22:
            continue
        val = {'课': 'class', '借': 'borrow', '考': 'exam', '考试': 'exam'}[_clean(w[4])]
        cur = rows[ri]['slots'][ci]
        if cur and cur != val:
            # 同格冲突极少见；按「课 > 考 > 借」优先，保证数据可解释
            if kind_pri[val] > kind_pri[cur]:
                rows[ri]['slots'][ci] = val
        else:
            rows[ri]['slots'][ci] = val

    return date, slots, rows


def parse_schedule_pdf(path):
    """解析一个 PDF，返回结构化字典。"""
    if pymupdf is None:
        raise ScheduleParseError('服务器缺少 PDF 解析组件，请重新安装')
    with open(path, 'rb') as f:
        blob = f.read()
    try:
        doc = pymupdf.open(stream=blob, filetype='pdf')
    except Exception as e:
        raise ScheduleParseError('无法打开 PDF：%s' % e)

    page_count = doc.page_count
    if page_count == 0:
        raise ScheduleParseError('PDF 为空')
    date = None
    slots = None
    merged = []
    seen = {}
    for pno in range(page_count):
        d, s, rows = _parse_page(doc[pno], pno + 1)
        if date and d != date:
            raise ScheduleParseError('同一个 PDF 内出现多个日期（%s / %s），请按天拆分' % (date, d))
        date = d
        if slots is None:
            slots = s
        elif [(x['start'], x['end']) for x in slots] != [(x['start'], x['end']) for x in s]:
            raise ScheduleParseError('各页表头时段不一致，无法合并')
        for r in rows:
            if r['name'] in seen:
                old = merged[seen[r['name']]]
                for i, v in enumerate(r['slots']):
                    if v:
                        old['slots'][i] = v
                if r['capacity'] is not None:
                    old['capacity'] = r['capacity']
                continue
            seen[r['name']] = len(merged)
            merged.append(r)
    doc.close()

    if not merged:
        raise ScheduleParseError('未识别到任何教室行')

    # 过滤版式标题行：「体育馆」这类容量 0、无标记且无教室号的行不是教室。
    merged = [r for r in merged
              if ROOM_RE.match(r['name']) or r['name'] in SPECIAL_KEEP
              or (r['capacity'] is not None and r['capacity'] > 1)]
    if not merged:
        raise ScheduleParseError('未识别到任何教室行')

    rooms = []
    for r in merged:
        building, digits, special = _classify(r['name'])
        rooms.append({
            'name': r['name'],
            'building': building,
            'digits': digits,
            'special': special,
            'capacity': r['capacity'],
            'slots': r['slots'],
            'class_count': sum(1 for x in r['slots'] if x == 'class'),
            'borrow_count': sum(1 for x in r['slots'] if x == 'borrow'),
            'exam_count': sum(1 for x in r['slots'] if x == 'exam'),
        })

    # 排序：一教、二教按教室号；特殊行放最后（保持 PDF 顺序）
    specials = [r for r in rooms if r['special']]
    regular = sorted([r for r in rooms if not r['special']],
                     key=lambda r: (0 if r['building'] == '一教' else 1, int(r['digits'] or 0)))
    rooms = regular + specials

    class_minutes = 0
    borrow_minutes = 0
    exam_minutes = 0
    for r in rooms:
        if r['special']:
            continue
        for i, v in enumerate(r['slots']):
            if not v:
                continue
            mins = int((slots[i] or {}).get('minutes') or 45)
            if v == 'class':
                class_minutes += mins
            elif v == 'exam':
                exam_minutes += mins
            else:
                borrow_minutes += mins

    return {
        'date': date.isoformat(),
        'weekday': WEEKDAYS[date.weekday()],
        'slots': slots,
        'rooms': rooms,
        'page_count': page_count,
        'source_sha256': hashlib.sha256(blob).hexdigest(),
        'summary': {
            'rooms': len(rooms),
            'regular_rooms': len(regular),
            'special_rooms': len(specials),
            'class_count': sum(r['class_count'] for r in rooms),
            'borrow_count': sum(r['borrow_count'] for r in rooms),
            'exam_count': sum(r['exam_count'] for r in rooms),
            'class_minutes': class_minutes,
            'borrow_minutes': borrow_minutes,
            'exam_minutes': exam_minutes,
            'total_minutes': class_minutes + borrow_minutes + exam_minutes,
        },
    }
