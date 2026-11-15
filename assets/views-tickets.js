/* 日志查询：全部日志的筛选、浏览、导出（不再保留看板与派单流程） */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var f = {
    q: '', from: '', to: '', building: '', engineer: '', fault: '', status: '', logType: '', room: '',
    page: 1, size: 30
  };
  var lastResult = [];
  var allTime = false;   // 从教室档案跳转时按教室查全部历史

  function initDates() {
    if (allTime || f.from || f.to) return;
    var now = S.nowLocal();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    f.from = S.dateKey(d);
    f.to = S.fmtDate(now);
  }

  function render() {
    initDates();
    var st = S.getState();
    var list = filterLogs();
    lastResult = list;
    var pages = Math.max(1, Math.ceil(list.length / f.size));
    if (f.page > pages) f.page = pages;
    var pageList = list.slice((f.page - 1) * f.size, f.page * f.size);

    var buildings = {};
    st.settings.rooms.forEach(function (r) { if (r.building) buildings[r.building] = 1; });

    return '<div class="page-head"><div><div class="page-title">日志查询</div>' +
      '<div class="page-sub">按日期、楼栋、工程师、故障类型与状态检索全部日志；点击行查看详情或编辑</div></div>' +
      '<div class="head-actions"><button class="btn btn-primary btn-sm" onclick="App.go(\'daily-log\')">' + U.icon('calendar') + '回到今日日志</button></div></div>' +

      '<div class="card"><div class="toolbar" style="padding:14px 16px;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:8px">' +
        '<input class="inp sm" style="width:220px" id="q-kw" placeholder="搜索日志号 / 教室 / 内容" value="' + S.esc(f.q) + '" onkeydown="if(event.key===\'Enter\')Views.tickets.search()">' +
        '<input class="inp sm" style="width:100px" id="q-room" placeholder="教室编号" value="' + S.esc(f.room) + '" onkeydown="if(event.key===\'Enter\')Views.tickets.search()">' +
        '<input type="date" class="inp sm" id="q-from" value="' + f.from + '">~<input type="date" class="inp sm" id="q-to" value="' + f.to + '">' +
        '<select class="inp sm" id="q-building"><option value="">全部楼栋</option>' + Object.keys(buildings).map(function (b) {
          return '<option' + (f.building === b ? ' selected' : '') + '>' + S.esc(b) + '</option>';
        }).join('') + '</select>' +
        '<select class="inp sm" id="q-engineer"><option value="">全部工程师</option>' + st.settings.engineers.map(function (e) {
          return '<option' + (f.engineer === e.name ? ' selected' : '') + '>' + S.esc(e.name) + '</option>';
        }).join('') + '</select>' +
        '<select class="inp sm" id="q-fault"><option value="">全部故障</option>' + st.settings.faultTypes.map(function (x) {
          return '<option' + (f.fault === x.name ? ' selected' : '') + '>' + S.esc(x.name) + '</option>';
        }).join('') + '</select>' +
        '<select class="inp sm" id="q-status"><option value="">全部状态</option>' + Object.keys(S.STATUS).map(function (k) {
          return '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + S.STATUS[k].label + '</option>';
        }).join('') + '</select>' +
        '<select class="inp sm" id="q-type"><option value="">全部类型</option>' + Object.keys(S.LOG_TYPES).map(function (k) {
          return '<option value="' + k + '"' + (f.logType === k ? ' selected' : '') + '>' + S.LOG_TYPES[k].label + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-primary btn-sm" onclick="Views.tickets.search()">' + U.icon('search') + '查询</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.tickets.reset()">重置</button>' +
        '<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Views.tickets.exportCSV()">' + U.icon('download') + '导出当前结果</button>' +
      '</div>' +
      '<div class="table-meta"><span>共 <b>' + list.length + '</b> 条日志' + (f.room ? ' · 教室 <b>' + S.esc(f.room) + '</b>' : '') + '</span><span>第 ' + f.page + ' / ' + pages + ' 页，每页 ' + f.size + ' 条</span></div>' +

      '<div class="desk-table"><table class="data-table"><thead><tr>' +
        '<th style="width:88px">日期</th><th style="width:56px">时段</th><th style="width:128px">日志编号</th><th style="width:72px">教室</th><th>工作内容</th>' +
        '<th style="width:110px">故障类型</th><th>处理结果</th><th style="width:72px">责任人</th><th style="width:74px">状态</th><th style="width:82px">类型</th><th style="width:64px">操作</th></tr></thead><tbody>' +
        (pageList.length ? pageList.map(function (t) { return row(t); }).join('') :
          '<tr><td colspan="11"><div class="empty">没有符合条件的日志，请调整筛选条件</div></td></tr>') +
      '</tbody></table></div>' +

      '<div class="m-list">' + (pageList.length ? pageList.map(function (t) { return mobileCard(t); }).join('') :
        '<div class="empty">没有符合条件的日志</div>') + '</div>' +

      (pages > 1 ? '<div class="pager"><button class="btn btn-ghost btn-sm" ' + (f.page <= 1 ? 'disabled' : '') + ' onclick="Views.tickets.page(' + (f.page - 1) + ')">上一页</button>' +
        '<span>第 ' + f.page + ' / ' + pages + ' 页</span>' +
        '<button class="btn btn-ghost btn-sm" ' + (f.page >= pages ? 'disabled' : '') + ' onclick="Views.tickets.page(' + (f.page + 1) + ')">下一页</button></div>' : '') +
      '</div>';
  }

  function row(t) {
    var pi = S.periodInfo(t.period || S.periodOf(t.createdAt));
    var status = S.resultInfo(t);
    var type = S.LOG_TYPES[t.logType || 'repair'] || S.LOG_TYPES.repair;
    var ft = S.getState().settings.faultTypes.filter(function (x) { return x.name === t.fault; })[0] || { color: '#8f959e' };
    return '<tr onclick="Views.tickets.openDetail(\'' + S.esc(t.no) + '\')" style="cursor:pointer">' +
      '<td class="mono">' + S.fmtDate(t.createdAt).slice(5) + '</td><td>' + pi.name + '</td>' +
      '<td class="mono">' + S.esc(t.no) + '</td><td class="room-cell">' + S.esc(t.room || '—') + '</td>' +
      '<td>' + S.esc(t.summary || t.desc) + '</td>' +
      '<td><span class="ftag" style="background:' + ft.color + '18;color:' + ft.color + '">' + S.esc(t.fault) + '</span></td>' +
      '<td>' + S.esc(t.action || '—') + '</td><td>' + S.esc(t.assignee || '—') + '</td>' +
      '<td><span class="tag" style="background:' + status.color + '18;color:' + status.color + '">' + status.label + '</span></td>' +
      '<td><span class="tag" style="background:' + type.color + '18;color:' + type.color + '">' + type.label + '</span></td>' +
      '<td onclick="event.stopPropagation()">' + (S.isAdmin() ? '<button class="ico-btn" onclick="Views.dailyLog.edit(\'' + S.esc(t.no) + '\')" title="编辑">' + U.icon('edit', 14) + '</button>' : '<span style="color:#b9bec7">—</span>') + '</td></tr>';
  }

  function mobileCard(t) {
    var status = S.resultInfo(t);
    var ft = S.getState().settings.faultTypes.filter(function (x) { return x.name === t.fault; })[0] || { color: '#8f959e' };
    return '<div class="m-card" onclick="Views.tickets.openDetail(\'' + S.esc(t.no) + '\')">' +
      '<div class="mc-top"><b class="room-cell">' + S.esc(t.room || '—') + '</b><span class="mono">' + S.esc(t.no) + '</span><span class="tag" style="background:' + status.color + '18;color:' + status.color + '">' + status.label + '</span></div>' +
      '<div class="mc-title">' + S.esc(t.summary || t.desc) + '</div>' +
      '<div class="mc-meta"><span class="ftag" style="background:' + ft.color + '18;color:' + ft.color + '">' + S.esc(t.fault) + '</span>' +
      '<span>' + S.fmtDT(t.createdAt) + '</span><span>' + S.esc(t.assignee || '—') + '</span></div></div>';
  }

  function filterLogs() {
    var st = S.getState();
    var q = f.q.trim().toLowerCase();
    return st.tickets.filter(function (t) {
      var d = S.fmtDate(t.createdAt);
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.room && t.room !== f.room) return false;
      if (f.building && (t.building || S.buildingOf(t.room)) !== f.building) return false;
      if (f.engineer && t.assignee !== f.engineer && t.helpers !== f.engineer) return false;
      if (f.fault && t.fault !== f.fault) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.logType && (t.logType || 'repair') !== f.logType) return false;
      if (q) {
        var hay = [t.no, t.room, t.summary, t.desc, t.action, t.assignee, t.remark].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return S.parseDT(b.createdAt) - S.parseDT(a.createdAt); });
  }

  function search() {
    f.q = val('q-kw'); f.from = val('q-from'); f.to = val('q-to'); f.room = val('q-room').trim();
    f.building = val('q-building'); f.engineer = val('q-engineer'); f.fault = val('q-fault');
    f.status = val('q-status'); f.logType = val('q-type'); f.page = 1;
    allTime = false;
    App.render();
  }
  function reset() {
    f = { q: '', from: '', to: '', building: '', engineer: '', fault: '', status: '', logType: '', room: '', page: 1, size: 30 };
    allTime = false;
    initDates(); App.render();
  }
  // 教室档案 → 查看该教室全部日志
  function filterRoom(room) {
    f = { q: '', from: '', to: '', building: '', engineer: '', fault: '', status: '', logType: '', room: String(room || ''), page: 1, size: 30 };
    allTime = true;
    App.go('tickets');
  }
  function page(p) { f.page = p; App.render(); }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  function exportCSV() {
    if (!lastResult.length) { U.toast('当前结果为空', 'err'); return; }
    var rows = [['日期', '时段', '日志编号', '教室', '工作内容', '故障类型', '处理结果', '责任人', '状态', '类型', '备注']];
    lastResult.forEach(function (t) {
      rows.push([S.fmtDate(t.createdAt), S.periodInfo(t.period || S.periodOf(t.createdAt)).name, t.no, t.room,
        t.summary || t.desc, t.fault, t.action || '', t.assignee || '', (S.STATUS[t.status] || {}).label || '',
        (S.LOG_TYPES[t.logType || 'repair'] || {}).label || '', t.remark || '']);
    });
    U.downloadCSV('日志查询_' + f.from + '_' + f.to + '.csv', rows);
    U.toast('已导出 ' + lastResult.length + ' 条日志', 'ok');
  }

  function openDetail(no) { Views.dailyLog.detail(no); }
  function refresh() { App.render(); }

  window.Views = window.Views || {};
  window.Views.tickets = {
    render: render, search: search, reset: reset, page: page, exportCSV: exportCSV,
    openDetail: openDetail, refresh: refresh, filterRoom: filterRoom
  };
})();
