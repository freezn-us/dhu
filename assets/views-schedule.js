/* 排课查询：上传排课表 → 月历 → 单日教室 × 时段占用 */
(function () {
  'use strict';
  var U = window.UI, S = window.Store;
  var st = {
    year: 0, month: 0, selected: '', days: {}, day: null, monthTotals: null,
    filter: 'all', hideEmpty: false, loading: false, preview: null,
    roomQuery: ''
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function canUpload() { return S.isAdmin() || S.hasPermission('settings'); }
  function isToday(key) { return key === S.dateKey(S.nowLocal()); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function parseKey(k) { var p = (k || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtHours(m) {
    var h = Math.round(m / 6) / 10;
    return String(h).replace(/\.0$/, '');
  }
  // 时长口径：分钟为主单位，括号内为换算小时；日视图与本月合计共用。
  function fmtDur(m) {
    if (m == null || isNaN(m)) return '—';
    return fmtNum(m) + ' 分钟（' + fmtHours(m) + ' 小时）';
  }
  function durStat(m) {
    if (m == null || isNaN(m)) return '<b>—</b>';
    return '<b>' + fmtNum(m) + ' 分钟</b><em>（' + fmtHours(m) + ' 小时）</em>';
  }
  // 兼容旧服务端：summary 未带分钟数时，按 45 分钟/节在前端兜底计算。
  function durations(d) {
    var cm = 0, bm = 0, em = 0;
    (d.rooms || []).forEach(function (r) {
      if (r.special) return;
      r.slots.forEach(function (v, i) {
        if (!v) return;
        var mins = (d.slots[i] && d.slots[i].minutes) || 45;
        if (v === 'class') cm += mins;
        else if (v === 'exam') em += mins;
        else bm += mins;
      });
    });
    return {
      'class': d.summary.class_minutes != null ? d.summary.class_minutes : cm,
      borrow: d.summary.borrow_minutes != null ? d.summary.borrow_minutes : bm,
      exam: d.summary.exam_minutes != null ? d.summary.exam_minutes : em,
      total: d.summary.total_minutes != null ? d.summary.total_minutes : (cm + bm + em)
    };
  }

  var TYPE = {
    class: ['课', 'sc-class', 'tag-blue'],
    borrow: ['借', 'sc-borrow', 'tag-green'],
    exam: ['考', 'sc-exam', 'tag-orange']
  };
  var PERIOD = {
    am: ['上午', '08:00–11:35'],
    pm: ['下午', '13:00–17:05'],
    ev: ['晚上', '18:00–21:20']
  };
  function periodOfSlot(s) {
    var h = parseInt(String((s && s.start) || '').split(':')[0], 10);
    return h < 12 ? 'am' : (h < 18 ? 'pm' : 'ev');
  }

  // 教室搜索：支持“松1101”“1101”“1教1101”等写法，忽略空格与大小写。
  function roomNeedle(q) {
    var s = String(q || '').replace(/\s+/g, '').toLowerCase();
    s = s.replace(/^一教/, '松1').replace(/^二教/, '松2');
    s = s.replace(/^1教/, '松1').replace(/^2教/, '松2');
    return s;
  }
  function roomMatch(r, q) {
    var s = roomNeedle(q);
    if (!s) return true;
    var name = String(r.name || '').toLowerCase();
    return name.indexOf(s) >= 0 || String(r.digits || '').indexOf(s) >= 0;
  }
  function roomMatches(d) {
    var s = roomNeedle(st.roomQuery);
    if (!s) return [];
    return d.rooms.filter(function (r) { return roomMatch(r, st.roomQuery); });
  }
  function roomSummary(r, d) {
    var cnt = { class: 0, borrow: 0, exam: 0 }, mins = 0, spans = [], i = 0, n = r.slots.length;
    while (i < n) {
      var v = r.slots[i], j = i;
      while (j + 1 < n && r.slots[j + 1] === v) j++;
      if (v) {
        var m = 0;
        for (var k = i; k <= j; k++) m += (d.slots[k] && d.slots[k].minutes) || 45;
        cnt[v] = (cnt[v] || 0) + (j - i + 1);
        mins += m;
        spans.push(d.slots[i].start + '–' + d.slots[j].end + ' ' + (TYPE[v] ? TYPE[v][0] : v));
      }
      i = j + 1;
    }
    return { cnt: cnt, mins: mins, spans: spans };
  }

  function render() {
    var up = canUpload()
      ? '<button class="btn btn-primary" id="sc-upload-btn">' + U.icon('upload', 14) + '上传排课表</button>'
      : '';
    return '' +
      '<div class="page-head"><div><div class="page-title">排课查询</div>' +
      '<div class="page-sub">一教 / 二教 · 按天查看教室上课与借用占用（45 分钟/节）</div></div>' +
      '<div class="head-actions">' + up + '</div></div>' +
      '<div class="sc-main">' +
      '  <div class="card sc-cal-card">' +
      '    <div class="sc-cal-head"><input type="month" class="sc-month-pick" id="sc-month-pick" value="' + (st.year ? st.year + '-' + pad(st.month) : '') + '" aria-label="选择月份">' +
      '      <button class="btn btn-ghost" id="sc-today">今天</button></div>' +
      '    <div class="sc-legend"><span><i class="dot c"></i>有课</span><span><i class="dot b"></i>有借</span><span><i class="dot d"></i>已导入</span></div>' +
      '    <div class="sc-month-sum" id="sc-month-sum"></div>' +
      '    <div class="sc-cal" id="sc-cal"></div>' +
      '    <div class="hint" style="margin-top:10px">日历只标注已导入的日期；点未导入的日期可查看提示。</div>' +
      '  </div>' +
      '  <div class="card sc-day-card" id="sc-day"><div class="empty">正在加载…</div></div>' +
      '</div>';
  }

  function mount() {
    var today = S.nowLocal();
    if (!st.year) { st.year = today.getFullYear(); st.month = today.getMonth() + 1; }
    var up = document.getElementById('sc-upload-btn');
    if (up) up.onclick = openUpload;
    var pick = document.getElementById('sc-month-pick');
    pick.value = st.year + '-' + pad(st.month);
    pick.onchange = function () {
      if (!pick.value) return;
      var p = pick.value.split('-');
      st.year = +p[0]; st.month = +p[1]; st.selected = '';
      loadMonth();
    };
    document.getElementById('sc-today').onclick = function () {
      st.year = today.getFullYear(); st.month = today.getMonth() + 1;
      st.selected = ''; loadMonth();
    };
    document.getElementById('sc-cal').onclick = function (e) {
      var cell = e.target.closest('.sc-day[data-date]');
      if (!cell) return;
      st.selected = cell.getAttribute('data-date');
      renderCal();
      loadDay();
    };
    document.getElementById('sc-day').onclick = dayClick;
    loadMonth();
  }

  function loadMonth() {
    var pick = document.getElementById('sc-month-pick');
    if (pick) pick.value = st.year + '-' + pad(st.month);
    var from = ymd(st.year, st.month, 1);
    var to = ymd(st.year, st.month, daysInMonth(st.year, st.month));
    st.loading = true;
    S.scheduleDays(from, to).then(function (d) {
      st.days = {};
      st.monthTotals = {
        total: 0, 'class': 0, borrow: 0, exam: 0,
        classCount: 0, borrowCount: 0, examCount: 0,
        usedRooms: 0, availableRooms: 0
      };
      st.monthTotals.usedRooms = (d.summary && d.summary.used_rooms) || 0;
      st.monthTotals.availableRooms = (d.summary && d.summary.available_rooms) || 0;
      (d.days || []).forEach(function (x) {
        st.days[x.date] = x;
        st.monthTotals.total += x.total_minutes || 0;
        st.monthTotals['class'] += x.class_minutes || 0;
        st.monthTotals.borrow += x.borrow_minutes || 0;
        st.monthTotals.exam += x.exam_minutes || 0;
        st.monthTotals.classCount += x.class_count || 0;
        st.monthTotals.borrowCount += x.borrow_count || 0;
        st.monthTotals.examCount += x.exam_count || 0;
      });
      st.loading = false;
      if (!st.selected || st.selected.slice(0, 7) !== from.slice(0, 7)) {
        var today = S.dateKey(S.nowLocal());
        var first = (d.days || [])[0];
        var inMonth = today.slice(0, 7) === from.slice(0, 7);
        st.selected = (inMonth && st.days[today]) ? today : (first ? first.date : from);
      }
      renderCal();
      renderMonthSummary();
      loadDay();
    }).catch(function (e) {
      st.loading = false;
      UI.toast(e.message || '加载排课日历失败', 'err');
      document.getElementById('sc-day').innerHTML = '<div class="empty">加载失败：' + S.esc(e.message) + '</div>';
    });
  }

  function renderCal() {
    var y = st.year, m = st.month;
    var first = new Date(y, m - 1, 1);
    var offset = (first.getDay() + 6) % 7; // 周一为第一列
    var total = daysInMonth(y, m);
    var html = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) {
      return '<div class="sc-wk">' + w + '</div>';
    }).join('');
    var i;
    for (i = 0; i < offset; i++) html += '<div class="sc-day blank"></div>';
    for (i = 1; i <= total; i++) {
      var key = ymd(y, m, i);
      var info = st.days[key];
      var cls = 'sc-day' + (info ? ' has' : '') + (key === st.selected ? ' sel' : '') + (isToday(key) ? ' today' : '');
      html += '<div class="' + cls + '" data-date="' + key + '" title="' + key + (info ? '：课 ' + info.class_count + ' 节，借 ' + info.borrow_count + ' 节' + (info.exam_count ? '，考 ' + info.exam_count + ' 节' : '') : '：未导入') + '">' +
        '<div class="sc-d">' + i + '</div>';
      if (info) {
        html += '<div class="sc-count"><span class="c">课 ' + info.class_count + '</span><span class="b">借 ' + info.borrow_count + '</span>' +
          (info.exam_count ? '<span class="e">考 ' + info.exam_count + '</span>' : '') + '</div>';
      }
      html += '</div>';
    }
    document.getElementById('sc-cal').innerHTML = html;
  }

  function renderMonthSummary() {
    var el = document.getElementById('sc-month-sum');
    if (!el) return;
    var t = st.monthTotals || { total: 0, 'class': 0, borrow: 0, exam: 0, classCount: 0, borrowCount: 0, examCount: 0, usedRooms: 0, availableRooms: 0 };
    var n = Object.keys(st.days || {}).length;
    var rate = t.availableRooms ? Math.round(t.usedRooms / t.availableRooms * 1000) / 10 : 0;
    function durCard(label, m) {
      return '<div class="sc-stat sc-stat-dur" title="' + m + ' 分钟">' + durStat(m) + '<span>' + label + '</span></div>';
    }
    el.innerHTML = '<div class="sc-month-head">本月合计<span>已导入 ' + n + ' 天</span></div>' +
      '<div class="sc-stats sc-month-stats">' +
      '  <div class="sc-stat"><b>' + t.availableRooms + '</b><span>可用教室</span></div>' +
      '  <div class="sc-stat"><b>' + t.usedRooms + '</b><span>本月使用过</span></div>' +
      '  <div class="sc-stat"><b>' + rate.toFixed(1) + '%</b><span>使用率</span></div>' +
      '  <div class="sc-stat"><b>' + t.classCount + '</b><span>课（45 分钟节）</span></div>' +
      '  <div class="sc-stat"><b>' + t.borrowCount + '</b><span>借（45 分钟节）</span></div>' +
      (t.examCount ? '  <div class="sc-stat"><b>' + t.examCount + '</b><span>考（45 分钟节）</span></div>' : '') +
      durCard('使用总时长', t.total) +
      durCard('上课时长', t['class']) +
      (t.exam ? durCard('考试时长', t.exam) : '') +
      durCard('借用时长', t.borrow) +
      '</div>';
  }

  function loadDay() {
    var box = document.getElementById('sc-day');
    if (!st.selected) { box.innerHTML = '<div class="empty">请选择日期</div>'; return; }
    box.innerHTML = '<div class="empty">正在加载 ' + S.esc(st.selected) + '…</div>';
    S.scheduleDay(st.selected).then(function (d) {
      st.day = d;
      renderDay();
    }).catch(function (e) {
      st.day = null;
      if (e && e.not_imported) {
        renderNotImported();
      } else {
        box.innerHTML = '<div class="empty">加载失败：' + S.esc(e.message || '未知错误') + '</div>';
      }
    });
  }

  function renderNotImported() {
    var box = document.getElementById('sc-day');
    var d = st.selected ? parseKey(st.selected) : null;
    var label = d ? (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日' : '';
    box.innerHTML = '<div class="sc-empty">' +
      U.icon('calendar', 42) +
      '<div class="sc-empty-title">' + S.esc(st.selected) + (label ? ' · ' + label : '') + '</div>' +
      '<div class="sc-empty-sub">该日还没有导入排课表。</div>' +
      (canUpload() ? '<button class="btn btn-primary" id="sc-empty-upload">' + U.icon('upload', 14) + '上传这一天的排课表</button>' : '') +
      '</div>';
    var b = document.getElementById('sc-empty-upload');
    if (b) b.onclick = openUpload;
  }

  function slotText(d, from, to) {
    var a = d.slots[from], b = d.slots[to];
    return a.start + '–' + b.end;
  }

  function duration(d, from, to) {
    var mins = 0;
    for (var i = from; i <= to; i++) mins += d.slots[i].minutes || 0;
    return mins;
  }

  function durText(mins) { return fmtDur(mins); }

  function filteredRooms(d) {
    return d.rooms.filter(function (r) {
      if (!roomMatch(r, st.roomQuery)) return false;
      if (st.filter !== 'all' && r.building !== st.filter) return false;
      if (st.hideEmpty && !r.slots.some(function (x) { return x; })) return false;
      return true;
    });
  }

  function renderDay() {
    var d = st.day, box = document.getElementById('sc-day');
    if (!d) { renderNotImported(); return; }
    var regular = d.rooms.filter(function (r) { return !r.special; });
    var occupied = regular.filter(function (r) { return r.slots.some(function (x) { return x; }); });
    var free = regular.length - occupied.length;
    var dateObj = parseKey(d.date);
    var dur = durations(d);
    var head = '' +
      '<div class="sc-day-head"><div>' +
      '  <div class="sc-day-date">' + (dateObj.getMonth() + 1) + ' 月 ' + dateObj.getDate() + ' 日 · ' + S.esc(d.weekday) + '</div>' +
      '  <div class="sc-day-sub">' + S.esc(d.date) + ' · 导入于 ' + S.esc(d.source.imported_at || '') + (d.source.imported_by ? ' · ' + S.esc(d.source.imported_by) : '') + '</div>' +
      '</div><div class="sc-day-acts">' +
      '  <button class="btn btn-ghost" id="sc-dl">' + U.icon('download', 14) + '原始 PDF</button>' +
      (canUpload() ? '<button class="btn btn-ghost" id="sc-del">删除</button>' : '') +
      '</div></div>' +
      '<div class="sc-stats">' +
      '  <div class="sc-stat"><b>' + regular.length + '</b><span>普通教室</span></div>' +
      '  <div class="sc-stat"><b>' + occupied.length + '</b><span>有占用</span></div>' +
      '  <div class="sc-stat ok"><b>' + free + '</b><span>空闲</span></div>' +
      '  <div class="sc-stat"><b>' + d.summary.class_count + '</b><span>课（45 分钟节）</span></div>' +
      '  <div class="sc-stat"><b>' + d.summary.borrow_count + '</b><span>借（45 分钟节）</span></div>' +
      (d.summary.exam_count ? '  <div class="sc-stat"><b>' + d.summary.exam_count + '</b><span>考（45 分钟节）</span></div>' : '') +
      '  <div class="sc-stat sc-stat-dur" title="' + dur.total + ' 分钟">' + durStat(dur.total) + '<span>使用总时长</span></div>' +
      '  <div class="sc-stat sc-stat-dur" title="' + dur['class'] + ' 分钟">' + durStat(dur['class']) + '<span>上课时长</span></div>' +
      (dur.exam ? '  <div class="sc-stat sc-stat-dur" title="' + dur.exam + ' 分钟">' + durStat(dur.exam) + '<span>考试时长</span></div>' : '') +
      '  <div class="sc-stat sc-stat-dur" title="' + dur.borrow + ' 分钟">' + durStat(dur.borrow) + '<span>借用时长</span></div>' +
      '</div>';

    var filters = [['all', '全部'], ['一教', '一教'], ['二教', '二教'], ['其他', '其他']].map(function (f) {
      return '<button class="sc-seg-btn' + (st.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
    }).join('');
    var toolbar = '<div class="sc-toolbar"><div class="sc-seg" id="sc-filter">' + filters + '</div>' +
      '<label class="sc-check"><input type="checkbox" id="sc-hide-empty"' + (st.hideEmpty ? ' checked' : '') + '> 只看有占用</label>' +
      '<span class="sc-toolbar-hint" id="sc-count"></span></div>';
    var opts = d.rooms.map(function (r) {
      return '<option value="' + S.esc(r.name) + '">' + S.esc(r.name) + (r.capacity ? ' · ' + r.capacity + ' 座' : '') + '</option>';
    }).join('');
    var roomBar = '<div class="sc-roombar">' +
      '<label for="sc-room-q">教室</label>' +
      '<input id="sc-room-q" class="input sc-room-input" list="sc-room-list" autocomplete="off" ' +
      'placeholder="输入教室，如 松1101 / 1101" value="' + S.esc(st.roomQuery) + '">' +
      '<datalist id="sc-room-list">' + opts + '</datalist>' +
      '<button class="btn btn-ghost sc-room-clear" id="sc-room-clear"' + (st.roomQuery ? '' : ' style="display:none"') + '>清除</button>' +
      '<div class="sc-room-sum" id="sc-room-sum"></div></div>';

    box.innerHTML = head + roomBar + toolbar + '<div id="sc-table-wrap"></div>';
    document.getElementById('sc-dl').onclick = function () { downloadSource(d.date); };
    var del = document.getElementById('sc-del');
    if (del) del.onclick = function () { deleteDay(d.date); };
    var rq = document.getElementById('sc-room-q');
    var onRoom = function () {
      st.roomQuery = rq.value;
      document.getElementById('sc-room-clear').style.display = st.roomQuery ? '' : 'none';
      renderDayTable();
    };
    rq.addEventListener('input', onRoom);
    rq.addEventListener('search', onRoom);
    rq.addEventListener('change', onRoom);
    document.getElementById('sc-room-clear').onclick = function () {
      st.roomQuery = ''; rq.value = ''; rq.focus(); onRoom();
    };
    document.getElementById('sc-filter').onclick = function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      st.filter = b.getAttribute('data-f');
      renderDayTable();
      document.querySelectorAll('#sc-filter .sc-seg-btn').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-f') === st.filter);
      });
    };
    document.getElementById('sc-hide-empty').onchange = function (e) {
      st.hideEmpty = e.target.checked;
      renderDayTable();
    };
    renderDayTable();
  }

  function renderDayTable() {
    var d = st.day;
    if (!d) return;
    var rooms = filteredRooms(d);
    var wrap = document.getElementById('sc-table-wrap');
    var cnt = document.getElementById('sc-count');
    if (cnt) cnt.textContent = '显示 ' + rooms.length + ' / ' + d.rooms.length + ' 行';
    updateRoomSummary(d);
    if (!rooms.length) {
      wrap.innerHTML = '<div class="empty">' +
        (roomNeedle(st.roomQuery) ? '没有匹配「' + S.esc(st.roomQuery) + '」的教室' : '当前筛选下没有教室') +
        '</div>';
      return;
    }
    var pidx = d.slots.map(periodOfSlot);
    var groups = [], gi = 0;
    d.slots.forEach(function (s, i) {
      var p = pidx[i], last = groups[groups.length - 1];
      if (last && last.k === p) last.n++;
      else groups.push({ k: p, n: 1 });
    });
    var groupHead = groups.map(function (g) {
      var first = gi;
      gi += g.n;
      return '<th class="sc-group-th ' + g.k + (first > 0 ? ' sc-div' : '') + '" colspan="' + g.n + '">' +
        PERIOD[g.k][0] + ' <span>' + PERIOD[g.k][1] + '</span></th>';
    }).join('');
    var head = '<tr><th class="sc-room-th" rowspan="2">教室</th>' + groupHead + '</tr>' +
      '<tr>' + d.slots.map(function (s, i) {
        var p = pidx[i];
        var div = (i > 0 && p !== pidx[i - 1]) ? ' sc-div' : '';
        return '<th class="sc-slot-th ' + p + div + '"><b>' + (i + 1) + '</b><span>' + s.start + '</span><span>' + s.end + '</span></th>';
      }).join('') + '</tr>';
    var rows = rooms.map(function (r) {
      var cells = '', i = 0, n = r.slots.length;
      while (i < n) {
        var v = r.slots[i], p = pidx[i], j = i;
        while (j + 1 < n && r.slots[j + 1] === v && pidx[j + 1] === p) j++;
        var div = (i > 0 && p !== pidx[i - 1]) ? ' sc-div' : '';
        if (v) {
          var t = TYPE[v];
          cells += '<td colspan="' + (j - i + 1) + '" class="sc-c sc-p-' + p + div + ' ' + t[1] + '" data-room="' + S.esc(r.name) + '" data-from="' + i + '" data-to="' + j + '" data-type="' + v + '" title="' + S.esc(r.name + ' ' + slotText(d, i, j) + ' ' + t[0]) + '">' + t[0] + '</td>';
        } else {
          for (var k = i; k <= j; k++) {
            var kd = (k > 0 && pidx[k] !== pidx[k - 1]) ? ' sc-div' : '';
            cells += '<td class="sc-c sc-free sc-p-' + pidx[k] + kd + '"></td>';
          }
        }
        i = j + 1;
      }
      var meta = r.special ? '其他' : r.building;
      if (r.capacity) meta += ' · ' + r.capacity + ' 座';
      return '<tr><td class="sc-room"><div class="sc-room-name">' + S.esc(r.name) + '</div><div class="sc-room-meta">' + S.esc(meta) + '</div></td>' + cells + '</tr>';
    }).join('');
    wrap.innerHTML = '<div class="sc-scroll"><table class="sc-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:8px">表格中「课 / 借 / 考」仅表示该时段有占用，不含课程名、教师与借用人信息；连续节次已合并显示。</div>';
  }

  function updateRoomSummary(d) {
    var el = document.getElementById('sc-room-sum');
    if (!el) return;
    if (!roomNeedle(st.roomQuery)) { el.innerHTML = ''; return; }
    var ms = roomMatches(d);
    if (!ms.length) {
      el.innerHTML = '<span class="err">未找到匹配「' + S.esc(st.roomQuery) + '」的教室</span>';
      return;
    }
    if (ms.length > 1) {
      el.innerHTML = '匹配 <b>' + ms.length + '</b> 间教室，请继续输入精确名称';
      return;
    }
    var r = ms[0], q = roomSummary(r, d);
    var parts = [];
    if (q.cnt['class']) parts.push('课 ' + q.cnt['class'] + ' 节');
    if (q.cnt.borrow) parts.push('借 ' + q.cnt.borrow + ' 节');
    if (q.cnt.exam) parts.push('考 ' + q.cnt.exam + ' 节');
    var usage = q.mins
      ? '<b>' + fmtDur(q.mins) + '</b>' + (parts.length ? ' · ' + parts.join(' · ') : '')
      : '<b>当天无使用</b>';
    el.innerHTML = '<span class="sc-room-name">' + S.esc(r.name) + '</span> · ' + usage +
      (q.spans.length ? '<span class="sc-room-spans">' + S.esc(q.spans.join('、')) + '</span>' : '');
  }

  function dayClick(e) {
    var td = e.target.closest('td[data-room]');
    if (!td || !st.day) return;
    var d = st.day, from = +td.getAttribute('data-from'), to = +td.getAttribute('data-to');
    var room = d.rooms.filter(function (r) { return r.name === td.getAttribute('data-room'); })[0];
    if (!room) return;
    var type = td.getAttribute('data-type'), t = TYPE[type];
    var mins = duration(d, from, to);
    var meta = room.special ? '其他' : room.building;
    U.openDrawer(S.esc(room.name) + ' · ' + t[0],
      '<span class="tag ' + t[2] + '">' + t[0] + '</span><span class="tag tag-gray">' + S.esc(meta) + (room.capacity ? ' · ' + room.capacity + ' 座' : '') + '</span>',
      '<div class="sc-detail">' +
      '  <div class="sc-detail-row"><span>日期</span><b>' + S.esc(d.date) + ' · ' + S.esc(d.weekday) + '</b></div>' +
      '  <div class="sc-detail-row"><span>时段</span><b>' + slotText(d, from, to) + '</b></div>' +
      '  <div class="sc-detail-row"><span>时长</span><b>' + durText(mins) + '（' + (to - from + 1) + ' 节）</b></div>' +
      '  <div class="sc-detail-row"><span>类型</span><b>' + (type === 'class' ? '上课' : (type === 'exam' ? '考试' : '借用')) + '</b></div>' +
      '  <div class="sc-detail-row"><span>教室</span><b>' + S.esc(room.name) + ' · ' + S.esc(meta) + '</b></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:12px">数据来自当天的《值班记录表》，只记录占用状态，不包含课程、教师或借用人。</div>',
      '');
  }

  function downloadSource(date) {
    S.scheduleSource(date).then(function (blob) {
      U.downloadBlob('排课表_' + date + '.pdf', blob);
    }).catch(function (e) { U.toast(e.message || '下载失败', 'err'); });
  }

  function deleteDay(date) {
    U.confirm('删除排课表', '确定删除 <b>' + S.esc(date) + '</b> 的排课数据？原始 PDF 也会删除。', function () {
      S.scheduleDeleteDay(date).then(function () {
        U.toast('已删除 ' + date, 'ok');
        delete st.days[date];
        st.day = null;
        loadMonth();
      }).catch(function (e) { U.toast(e.message || '删除失败', 'err'); });
    }, '删除', true);
  }

  // ---------- 上传 / 预览 / 覆盖 ----------
  function openUpload() {
    if (!canUpload()) { U.toast('只有管理员或具备「基础配置」权限的用户可以上传', 'err'); return; }
    st.preview = null;
    var body = '' +
      '<div class="sc-up-tip">支持一次选择多个 PDF，或上传包含 PDF 的 ZIP 压缩包。每个 PDF 对应一天（同一天的 4 页会自动合并）。</div>' +
      '<input type="file" id="sc-files" class="input" multiple accept=".pdf,.zip">' +
      '<div id="sc-prev-list" class="sc-prev-list"></div>' +
      '<label class="sc-check" id="sc-replace-wrap" style="display:none;margin-top:10px">' +
      '  <input type="checkbox" id="sc-replace"> 覆盖已存在的日期（默认拒绝；覆盖后原 PDF 会被替换）</label>' +
      '<div id="sc-up-err" class="err" style="margin-top:8px"></div>' +
      '<div class="hint">上传前会先解析预览，确认后才写入数据库；解析失败的文件不会入库。</div>';
    var foot = '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-ghost" id="sc-do-prev">解析预览</button>' +
      '<button class="btn btn-primary" id="sc-do-import" disabled>确认导入</button>';
    U.modal('上传排课表', body, foot, { wide: true });
    var input = document.getElementById('sc-files');
    input.onchange = function () {
      st.preview = null;
      document.getElementById('sc-prev-list').innerHTML = '';
      document.getElementById('sc-replace-wrap').style.display = 'none';
      document.getElementById('sc-do-import').disabled = true;
      document.getElementById('sc-up-err').textContent = '';
      document.getElementById('sc-do-prev').disabled = !input.files.length;
    };
    document.getElementById('sc-do-prev').onclick = doPreview;
    document.getElementById('sc-do-import').onclick = doImport;
  }

  function doPreview() {
    var input = document.getElementById('sc-files');
    if (!input.files || !input.files.length) { U.toast('请选择 PDF 或 ZIP', 'err'); return; }
    var btn = document.getElementById('sc-do-prev');
    btn.disabled = true; btn.textContent = '解析中…';
    document.getElementById('sc-up-err').textContent = '';
    S.schedulePreview(input.files).then(function (res) {
      st.preview = res;
      renderPreview(res);
    }).catch(function (e) {
      document.getElementById('sc-up-err').textContent = e.message || '解析失败';
    }).then(function () {
      btn.disabled = false; btn.textContent = '重新解析';
    });
  }

  function renderPreview(res) {
    var files = res.files || [];
    var hasConflict = false, okCount = 0;
    var html = files.map(function (f) {
      if (!f.ok) {
        return '<div class="sc-prev err"><div class="sc-prev-name">' + S.esc(f.name) + '</div>' +
          '<div class="sc-prev-msg">✕ ' + S.esc(f.error) + '</div></div>';
      }
      okCount++;
      if (f.exists) hasConflict = true;
      var s = f.summary;
      return '<div class="sc-prev' + (f.exists ? ' warn' : '') + '">' +
        '<div class="sc-prev-name">' + S.esc(f.name) + '</div>' +
        '<div class="sc-prev-msg">' + S.esc(f.date) + ' · ' + S.esc(f.weekday) + ' · 教室 ' + s.rooms +
        ' · 课 ' + s.class_count + ' 节 · 借 ' + s.borrow_count + ' 节' +
        (f.exists ? ' <span class="tag tag-orange">已存在</span>' : ' <span class="tag tag-green">新日期</span>') + '</div>' +
        (f.exists && f.existing ? '<div class="sc-prev-sub">原数据导入于 ' + S.esc(f.existing.imported_at || '') + (f.existing.imported_by ? ' · ' + S.esc(f.existing.imported_by) : '') + '</div>' : '') +
        '</div>';
    }).join('');
    document.getElementById('sc-prev-list').innerHTML = html || '<div class="empty">没有可预览的文件</div>';
    document.getElementById('sc-replace-wrap').style.display = hasConflict ? '' : 'none';
    document.getElementById('sc-do-import').disabled = okCount === 0;
  }

  function doImport() {
    var input = document.getElementById('sc-files');
    if (!input.files || !input.files.length) return;
    var replace = document.getElementById('sc-replace').checked;
    var conflict = st.preview && (st.preview.files || []).some(function (f) { return f.ok && f.exists; });
    if (conflict && !replace) {
      U.confirm('日期已存在', '预览中有日期已导入。覆盖会整日替换原有排课数据，是否继续？',
        function () { submitImport(true); }, '覆盖导入', true);
      return;
    }
    submitImport(replace);
  }

  function submitImport(replace) {
    var input = document.getElementById('sc-files');
    var btn = document.getElementById('sc-do-import');
    btn.disabled = true; btn.textContent = '导入中…';
    document.getElementById('sc-up-err').textContent = '';
    S.scheduleImport(input.files, replace).then(function (res) {
      var days = (res.imported || []).map(function (x) { return x.date; }).join('、');
      U.toast('已导入 ' + (res.imported || []).length + ' 天：' + days, 'ok');
      UI.closeModal();
      st.preview = null;
      st.selected = res.imported && res.imported.length ? res.imported[0].date : st.selected;
      loadMonth();
    }).catch(function (e) {
      document.getElementById('sc-up-err').textContent = e.message || '导入失败';
      btn.disabled = false; btn.textContent = '确认导入';
    });
  }

  window.Views = window.Views || {};
  window.Views.schedule = { render: render, mount: mount };
})();
