/* 工作台：今日日志、待补录报修、巡视进度、教室状态墙 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;

  function todayData() {
    var today = U.todayStr();
    var list = S.getState().tickets.filter(function (t) { return S.fmtDate(t.createdAt) === today; });
    var open = ['new', 'assigned', 'processing'];
    return {
      list: list,
      total: list.length,
      closed: list.filter(function (t) { return t.status === 'closed'; }).length,
      pending: list.filter(function (t) { return open.indexOf(t.status) >= 0; }).length,
      following: S.waitingRepairs().length,
      patrol: S.patrolSummary(today)
    };
  }

  function wallHtml() {
    var st = S.getState();
    var rooms = st.settings.rooms.filter(function (r) { return r.active !== false; });
    var open = {};
    st.tickets.forEach(function (t) {
      if (['new', 'assigned', 'processing', 'waiting'].indexOf(t.status) < 0) return;
      open[t.room] = open[t.room] || [];
      open[t.room].push(t);
    });
    var cells = rooms.map(function (r) {
      var ts = open[r.no] || [];
      var cls = 'ok';
      if (ts.some(function (t) { return t.status === 'new'; })) cls = 'fault';
      else if (ts.length) cls = 'doing';
      var tip = r.no + ' · ' + (cls === 'ok' ? '正常' : cls === 'fault' ? '报修待填报' : '处理中') + (ts.length ? '（' + ts.length + ' 条）' : '');
      return '<div class="cell ' + cls + '" title="' + U.esc(tip) + '" onclick="Views.dashboard.roomClick(\'' + U.esc(r.no) + '\')"></div>';
    }).join('');
    var normal = rooms.length - Object.keys(open).length;
    var faults = st.tickets.filter(function (t) { return t.status === 'new'; }).length;
    return '<div class="wall">' + cells + '</div>' +
      '<div class="legend"><span><i style="background:#e6f7d9"></i>正常 ' + normal + '</span>' +
      '<span><i style="background:#ffe1b3"></i>处理中 ' + Object.keys(open).length + '</span>' +
      '<span><i style="background:#ffc9c7"></i>报修待填报 ' + faults + '</span>' +
      '<span style="margin-left:auto;color:#b9bec7">共 ' + rooms.length + ' 间 · 点击查看</span></div>';
  }

  function render() {
    var c = todayData();
    var st = S.getState();
    var role = window.App.role();
    var doneToday = c.list.filter(function (t) { return t.status === 'closed'; });
    var avg = doneToday.length ? Math.round(doneToday.reduce(function (a, t) { return a + (t.durationMin || 0); }, 0) / doneToday.length) : null;
    var recent = st.tickets.slice(0, 7);
    var series = S.dailySeries(14);
    var pending = S.pendingRepairs().slice(0, 4);

    return '' +
      '<div class="page-head">' +
      '<div><div class="page-title">工作台</div><div class="page-sub">' + U.esc(st.settings.org) + ' · 多媒体教室运维 · ' + U.todayStr() + ' · 当前登录：' + U.esc(role.name) + (role.title && role.title !== role.name ? '（' + U.esc(role.title) + '）' : '') + '</div></div>' +
      '<div class="head-acts"><button class="btn btn-ghost" onclick="App.go(\'patrol\')">' + U.icon('check') + '巡视打卡</button>' +
      '<button class="btn btn-primary" onclick="Views.dailyLog.addToday()">' + U.icon('plus') + '填写今日日志</button></div></div>' +

      '<div class="kpis">' +
      '<div class="kpi red link" onclick="App.go(\'tickets\')"><div class="lab">今日日志</div><div class="val">' + c.total + '</div><div class="sub">含报修、巡检、主动维护</div></div>' +
      '<div class="kpi green link" onclick="App.go(\'daily-log\')"><div class="lab">今日已记录</div><div class="val">' + c.closed + '</div><div class="sub">完成并可追溯</div></div>' +
      '<div class="kpi orange link" onclick="App.go(\'daily-log\')"><div class="lab">待填报报修</div><div class="val">' + c.pending + '</div><div class="sub">' + (c.pending ? '请及时补录日志' : '当前无积压') + '</div></div>' +
      '<div class="kpi cyan link" onclick="App.go(\'daily-log\')"><div class="lab">待跟进报修</div><div class="val">' + c.following + '</div><div class="sub">' + (c.following ? '处理未解决，需持续跟进' : '当前无待跟进') + '</div></div>' +
      '<div class="kpi purple link" onclick="App.go(\'patrol\')"><div class="lab">今日巡视</div><div class="val">' + c.patrol.done + '<small> / ' + c.patrol.total + '</small></div><div class="sub">' + (c.patrol.pending ? c.patrol.pending + ' 个时段待打卡' : '三时段已完成') + '</div></div>' +
      '<div class="kpi"><div class="lab">平均处理时长</div><div class="val">' + (avg == null ? '—' : avg) + '<small> 分</small></div><div class="sub">按今日已记录日志</div></div>' +
      '</div>' +

      '<div class="grid grid-2" style="margin-bottom:16px">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('grid') + '全校教室状态墙</h3><span class="more" onclick="App.go(\'settings\')">教室清单 ›</span></div>' + wallHtml() + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('chart') + '近 14 天日志趋势</h3><span class="more" onclick="App.go(\'reports\')">报表分析 ›</span></div><div class="trend-wrap">' +
      U.lineChart(series.map(function (x) { return { label: x.label, value: x.count }; }), { width: 560, height: 180 }) + '</div>' +
      '<div class="chart-tip">近 14 天共 ' + series.reduce(function (a, b) { return a + b.count; }, 0) + ' 条；平均 ' + (Math.round(series.reduce(function (a, b) { return a + b.count; }, 0) / 14 * 10) / 10) + ' 条/天</div></div>' +
      '</div>' +

      '<div class="grid grid-2">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('alert') + '待填报报修</h3><span class="more" onclick="App.go(\'daily-log\')">去填写 ›</span></div>' +
      (pending.length ? '<div class="mini-list">' + pending.map(function (t) {
        var wait = S.minutesBetween(t.createdAt, S.isoLocal(new Date()));
        return '<div class="row" onclick="Views.tickets.openDetail(\'' + U.esc(t.no) + '\')">' +
          '<span class="tag urg-' + t.urgency + '">' + t.urgency + '</span>' +
          '<span class="tt">' + U.esc(t.room) + ' · ' + U.esc(t.desc) + '</span>' +
          '<span class="tm" style="' + (wait > 60 ? 'color:#f5222d' : '') + '">已等 ' + (wait > 1440 ? Math.floor(wait / 1440) + ' 天' : wait + ' 分') + '</span></div>';
      }).join('') + '</div>' : '<div style="padding:24px;text-align:center;color:#b9bec7;font-size:12.5px">暂无待填报报修</div>') + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '最新日志动态</h3><span class="more" onclick="App.go(\'tickets\')">日志查询 ›</span></div>' +
      '<div class="mini-list">' + recent.map(function (t) {
        var stt = S.STATUS[t.status] || S.STATUS.closed;
        return '<div class="row" onclick="Views.tickets.openDetail(\'' + U.esc(t.no) + '\')"><span class="tag" style="background:' + stt.color + '22;color:' + stt.color + '">' + stt.label + '</span>' +
          '<span class="tt">' + U.esc(t.room || '—') + ' · ' + U.esc(t.summary || t.desc) + '</span><span class="tm">' + S.fmtDT(t.createdAt) + '</span></div>';
      }).join('') + '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px"><div class="card-head"><h3>' + U.icon('arrow') + '快捷操作</h3></div><div class="quick-grid">' +
      quick('daily-log', '每日工作日志', '按三时段填写当天工作', 'calendar', '#e6f4ff', '#1677ff') +
      quick('patrol', '巡视管理', '每日 3 个时段自动生成', 'check', '#f6ffed', '#52c41a') +
      quick('intake', '来电登记', '客服登记生成待填报报修', 'phone', '#fff7e6', '#fa8c16') +
      '</div></div>';
  }

  function quick(route, title, sub, ic, bg, color) {
    return '<button class="quick" onclick="App.go(\'' + route + '\')"><span class="ico" style="background:' + bg + ';color:' + color + '">' + U.icon(ic, 17) + '</span><span><b>' + title + '</b><span>' + sub + '</span></span></button>';
  }

  function roomClick(room) {
    var ts = S.getState().tickets.filter(function (t) { return t.room === room; }).slice(0, 12);
    if (!ts.length) { U.toast(room + ' 暂无日志记录'); return; }
    U.modal('教室 ' + room + ' 的日志', '<div class="mini-list">' + ts.map(function (t) {
      var stt = S.STATUS[t.status] || S.STATUS.closed;
      return '<div class="row" onclick="UI.closeModal();Views.tickets.openDetail(\'' + U.esc(t.no) + '\')">' +
        '<span class="tag" style="background:' + stt.color + '22;color:' + stt.color + '">' + stt.label + '</span>' +
        '<span class="tt">' + U.esc(t.summary || t.desc) + '</span><span class="tm">' + S.fmtDT(t.createdAt) + '</span></div>';
    }).join('') + '</div>', '<button class="btn btn-ghost" onclick="UI.closeModal()">关闭</button>');
  }

  window.Views = window.Views || {};
  window.Views.dashboard = { render: render, roomClick: roomClick };
})();
