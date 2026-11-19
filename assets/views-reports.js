/* 统计报表 v1.2.0：接后端 SQL 聚合 API + 巡视 + 设备 + 对比 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;

  var period = 'month';
  var from = U.monthStart(), to = U.todayStr();
  var stage = '';
  var _apiCache = null;          // 最近一次 API 数据缓存，render() 用
  var _loading = false;

  function stageText() {
    if (!stage) return '全部阶段';
    return stage === '__none__' ? '未标注' : stage;
  }
  function setStage(v) { stage = v || ''; _apiCache = null; App.render(); }

  function applyPeriod(p) {
    period = p;
    var now = new Date();
    if (p === 'month') { from = U.monthStart(); to = U.todayStr(); }
    else if (p === 'last') {
      var d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = S.dateKey(d); to = S.dateKey(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    else if (p === '30') { from = U.daysAgoStr(29); to = U.todayStr(); }
    else if (p === '7') { from = U.daysAgoStr(6); to = U.todayStr(); }
    else if (p === 'today') { from = U.todayStr(); to = U.todayStr(); }
    _apiCache = null; App.render();
  }
  function setDate(k, v) {
    period = 'custom';
    if (k === 'from') from = v; else to = v;
    if (from && to && from > to) { var t = from; from = to; to = t; }
    _apiCache = null; App.render();
  }

  function spanDays(a, b) {
    var da = S.parseDT(a), db = S.parseDT(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000) + 1;
  }

  function _authHeaders() {
    try {
      return { 'Authorization': 'Bearer ' + localStorage.getItem('dhu_ops_token') };
    } catch (e) { return {}; }
  }
  function _fetchJson(url) {
    return fetch(url, { headers: _authHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadAllApi() {
    if (_loading) return;
    _loading = true;
    var base = '/api/report';
    var qs = 'from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) +
      (stage ? '&stage=' + encodeURIComponent(stage) : '');
    var devicePromise = _fetchJson(base + '/device/summary');
    var patrolPromise = _fetchJson(base + '/patrol?' + qs);
    var summaryPromise = _fetchJson(base + '/summary?' + qs);
    var trendPromise = _fetchJson(base + '/trend?' + qs + '&group=day');
    Promise.all([summaryPromise, trendPromise, patrolPromise, devicePromise])
      .then(function (results) {
        _apiCache = {
          summary: results[0], trend: results[1], patrol: results[2], device: results[3],
          at: Date.now(),
          from: from, to: to, stage: stage
        };
        _loading = false;
        App.render();
      })
      .catch(function (err) {
        console.warn('report api fail (fallback to client)', err);
        _apiCache = null;
        _loading = false;
        App.render();   // render 会 fallback 到 Store.stats()
      });
  }

  // 兼容旧客户端计算（API 失败时 fallback）
  function _clientStats() { return S.stats(from, to, stage); }

  function render() {
    if (!_apiCache) {
      // 还没拿到 API 数据：先返回一个 loading 骨架，afterRender 会触发 fetch
      var s = _clientStats();
      return _renderInner(s, /*api*/ null, /*loading*/ true);
    }
    var api = _apiCache;
    // 用 API summary 做主体，但需要和前端 stats 合并一些辅助信息（如 typeList 的颜色）
    var s = _mergeStats(api.summary);
    return _renderInner(s, api, /*loading*/ false);
  }

  function _mergeStats(apiSummary) {
    // 后端 summary 已经给了绝大部分数据，直接用
    var s = apiSummary;
    var st = S.getState();
    // 补 typeList 颜色
    var types = (s.typeList || []).map(function (t) {
      var ft = st.settings.faultTypes.filter(function (x) { return x.name === t.name; })[0];
      return { name: t.name, count: t.count, color: ft ? ft.color : '#8f959e' };
    });
    s.typeList = types;
    return s;
  }

  function renderAfter() {
    if (!_apiCache) loadAllApi();
  }

  function _renderInner(s, api, loading) {
    var st = S.getState();
    var days = spanDays(from, to);
    // 趋势线：优先用 API，否则前端算
    var trend = null;
    if (api && api.trend && api.trend.series && api.trend.series.length) {
      var start = S.parseDT(from), end = S.parseDT(to);
      var series = [];
      if (start && end && days <= 120) {
        var map = {};
        api.trend.series.forEach(function (x) { map[x.label] = x.value; });
        for (var i = 0; i < days; i++) {
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          var k = S.dateKey(d);
          series.push({ label: S.pad(d.getMonth() + 1) + '/' + S.pad(d.getDate()), value: map[k] || 0 });
        }
      }
      trend = series;
    } else {
      var start2 = S.parseDT(from), end2 = S.parseDT(to);
      if (start2 && end2 && days <= 120) {
        var t2 = [];
        for (var j = 0; j < days; j++) {
          var dd = new Date(start2.getFullYear(), start2.getMonth(), start2.getDate() + j);
          var kk = S.dateKey(dd);
          t2.push({ label: S.pad(dd.getMonth() + 1) + '/' + S.pad(dd.getDate()), value: (s.daily || {})[kk] || 0 });
        }
        trend = t2;
      }
    }
    var tx = reportRangeText();

    // 巡视 & 设备数据
    var patrol = api ? api.patrol : null;
    var device = api ? api.device : null;

    return '' +
      '<div class="page-head"><div><div class="page-title">统计报表</div><div class="page-sub">统计区间：' + U.esc(tx) + ' · 阶段：' + U.esc(stageText()) + ' · 共 ' + days + ' 天' +
      (loading ? ' · <span style="color:#1677ff">正在从服务器加载最新数据...</span>' : (api ? ' · 数据实时基于服务器数据仓库自动汇总' : ' · 数据实时基于本地日志自动汇总（离线模式）')) + '</div></div>' +
      '<div class="head-acts"><button class="btn btn-ghost" onclick="Views.reports.exportPDF()">' + U.icon('file') + '导出 PDF 报告</button>' +
      '<button class="btn btn-ghost" onclick="Views.reports.exportCSV()">' + U.icon('download') + 'CSV 明细</button>' +
      '<button class="btn btn-primary" onclick="Views.reports.exportXLSX()">' + U.icon('download') + '导出 Excel</button></div></div>' +

      '<div class="toolbar"><span style="font-size:12px;color:#8f959e">统计区间</span><div class="period-chips">' +
      [['today', '今日'], ['7', '近 7 天'], ['30', '近 30 天'], ['month', '本月'], ['last', '上月']].map(function (p) {
        return '<button class="btn btn-sm ' + (period === p[0] ? 'btn-primary' : 'btn-ghost') + '" onclick="Views.reports.applyPeriod(\'' + p[0] + '\')">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<span style="margin-left:14px;display:flex;align-items:center;gap:6px;font-size:12px;color:#646a73">阶段' +
      '<select onchange="Views.reports.setStage(this.value)" style="border:1px solid #e2e6eb;border-radius:6px;padding:5px 7px">' +
      '<option value="">全部</option>' +
      (st.settings.lessonStages || []).map(function (n) {
        return '<option value="' + U.esc(n) + '"' + (stage === n ? ' selected' : '') + '>' + U.esc(n) + '</option>';
      }).join('') +
      '<option value="__none__"' + (stage === '__none__' ? ' selected' : '') + '>未标注</option></select></span>' +
      '<span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:#646a73">自定义' +
      '<input type="date" value="' + from + '" onchange="Views.reports.setDate(\'from\',this.value)" style="border:1px solid #e2e6eb;border-radius:6px;padding:5px 7px">' +
      '<span>至</span><input type="date" value="' + to + '" onchange="Views.reports.setDate(\'to\',this.value)" style="border:1px solid #e2e6eb;border-radius:6px;padding:5px 7px"></span></div>' +

      // ========== 工单核心 KPI ==========
      '<div class="kpis">' +
      '<div class="kpi"><div class="lab">工单总量</div><div class="val">' + s.total + '</div><div class="sub">日均 ' + (days ? Math.round(s.total / days * 10) / 10 : 0) + ' 条</div></div>' +
      '<div class="kpi green"><div class="lab">已记录 / 完成率</div><div class="val">' + s.closed + '<small> / ' + (s.total ? Math.round(s.closed / s.total * 100) + '%' : '—') + '</small></div><div class="sub">待填报 ' + s.open + ' · 取消 ' + s.cancelled + '</div></div>' +
      '<div class="kpi orange"><div class="lab">平均响应</div><div class="val">' + (s.avgArrive == null ? '—' : s.avgArrive) + '<small> 分</small></div><div class="sub">来电→到场 · SLA 达标 ' + (s.slaRate == null ? '—' : s.slaRate + '%') + '</div></div>' +
      '<div class="kpi purple"><div class="lab">平均处理时长</div><div class="val">' + (s.avgHandle == null ? '—' : s.avgHandle) + '<small> 分</small></div><div class="sub">到场→处理完成</div></div>' +
      '<div class="kpi cyan"><div class="lab">平均满意度</div><div class="val">' + (s.satisfaction == null ? '—' : s.satisfaction.toFixed(1)) + '<small> / 5</small></div><div class="sub">紧急工单 ' + s.urgent + ' 条</div></div>' +
      '</div>' +

      // ========== 趋势 + 故障 TOP ==========
      '<div class="grid grid-2" style="margin-bottom:16px">' +
      '<div class="card chart-card"><div class="card-head"><h3>' + U.icon('chart') + '工单量趋势</h3><span class="more" style="cursor:default">峰值 ' + (trend && trend.length ? Math.max.apply(null, trend.map(function (x) { return x.value; })) : 0) + ' 条/天</span></div>' +
      (trend && trend.length ? U.lineChart(trend, { width: 640, height: 210 }) : '<div class="empty">区间过长，暂不绘制趋势</div>') + '</div>' +
      '<div class="card chart-card"><div class="card-head"><h3>' + U.icon('tool') + '故障类型 TOP</h3><span class="more" style="cursor:default">📚 知识库联动</span></div>' +
      (s.typeList && s.typeList.length ? '<div class="donut-wrap">' + U.donutChart(s.typeList) + '<div class="legend-col">' + s.typeList.map(function (t) {
        var kbCount = S.kbCountByFault(t.name);
        var kbTag = kbCount > 0
          ? '<span style="font-size:10px;color:#389e0d;background:#f6ffed;border-radius:2px;padding:0 4px;margin-left:4px">📚' + kbCount + '</span>'
          : (t.count >= 3 ? '<span style="font-size:10px;color:#d46b08;background:#fff7e6;border-radius:2px;padding:0 4px;margin-left:4px">⚠️ 待沉淀</span>' : '');
        return '<div class="legend-row"><i style="background:' + (t.color || '#8f959e') + '"></i>' + U.esc(t.name) + '<span class="n">' + t.count + ' · ' + Math.round(t.count / (s.total || 1) * 100) + '%</span>' + kbTag + '</div>';
      }).join('') + '</div></div>' : '<div class="empty">暂无数据</div>') + '</div>' +
      '</div>' +

      // ========== 楼栋 + 工程师 ==========
      '<div class="grid grid-2" style="margin-bottom:16px">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('pin') + '楼栋 / 教室分布</h3><span class="more" style="cursor:default">TOP 教室</span></div>' +
      '<div class="row-2" style="gap:22px">' +
      '<div><div style="font-size:11px;color:#8f959e;margin-bottom:9px">按楼栋</div>' + (s.buildingList && s.buildingList.length ? U.hbars(s.buildingList) : '<div class="empty">暂无数据</div>') + '</div>' +
      '<div><div style="font-size:11px;color:#8f959e;margin-bottom:9px">工单最多教室</div>' +
      (s.roomList && s.roomList.length ? '<div class="bars">' + s.roomList.slice(0, 6).map(function (r) {
        var max = Math.max(1, s.roomList[0].count);
        return '<div class="bar-row" style="grid-template-columns:64px 1fr 26px"><span class="lb mono">' + U.esc(r.name) + '</span><span class="track"><i style="width:' + Math.round(r.count / max * 100) + '%;background:linear-gradient(90deg,#b7eb8f,#52c41a)"></i></span><span class="n">' + r.count + '</span></div>';
      }).join('') + '</div>' : '<div class="empty">暂无数据</div>') + '</div></div></div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('users') + '工程师工作量</h3><span class="more" style="cursor:default">' + (s.engineers ? s.engineers.length : 0) + ' 人</span></div>' +
      '<table class="report-table"><thead><tr><th>工程师</th><th>处理</th><th>已处理</th><th>已记录</th><th>平均处理</th><th>满意度</th></tr></thead><tbody>' +
      (s.engineers && s.engineers.length ? s.engineers.map(function (e) {
        return '<tr><td style="font-weight:500">' + U.esc(e.name) + '</td><td>' + e.total + '</td><td>' + e.resolved + '</td><td>' + e.closed + '</td>' +
          '<td class="mono">' + (e.handleAvg == null ? '—' : e.handleAvg + ' 分') + '</td><td>' + (e.sat == null ? '—' : e.sat.toFixed(1)) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" style="text-align:center;color:#b9bec7;padding:20px">暂无数据</td></tr>') + '</tbody></table></div>' +
      '</div>' +

      // ========== 工单时效 / 紧急度 / 状态 ==========
      '<div class="grid grid-3" style="margin-bottom:16px">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('clock') + '时效指标</h3></div>' +
      '<div class="kv-grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      '<div><div class="k" style="font-size:11px;color:#8f959e">平均指派</div><div style="font-size:18px;font-weight:700">' + (s.avgDispatch == null ? '—' : s.avgDispatch + ' 分') + '</div></div>' +
      '<div><div class="k" style="font-size:11px;color:#8f959e">平均响应</div><div style="font-size:18px;font-weight:700">' + (s.avgArrive == null ? '—' : s.avgArrive + ' 分') + '</div></div>' +
      '<div><div class="k" style="font-size:11px;color:#8f959e">平均处理</div><div style="font-size:18px;font-weight:700">' + (s.avgHandle == null ? '—' : s.avgHandle + ' 分') + '</div></div>' +
      '<div><div class="k" style="font-size:11px;color:#8f959e">平均完结</div><div style="font-size:18px;font-weight:700">' + (s.avgClose == null ? '—' : s.avgClose + ' 分') + '</div></div></div>' +
      '<div class="chart-tip">SLA：紧急 120 分钟、常规 480 分钟、低 1440 分钟内响应。</div></div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('alert') + '紧急度分布</h3></div>' +
      U.vbars([{ name: '紧急', count: (s.byUrg || {})['紧急'] || 0, color: '#f5222d' }, { name: '常规', count: (s.byUrg || {})['常规'] || 0, color: '#fa8c16' }, { name: '低', count: (s.byUrg || {})['低'] || 0, color: '#8f959e' }]) + '</div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('bag') + '状态分布</h3></div>' +
      '<div class="bars">' + Object.keys(S.STATUS).map(function (k) {
        var c = (s.byStatus || {})[k] || 0;
        var max = Math.max(1, s.total);
        return '<div class="bar-row"><span class="lb">' + S.STATUS[k].label + '</span><span class="track"><i style="width:' + Math.round(c / max * 100) + '%;background:' + S.STATUS[k].color + '"></i></span><span class="n">' + c + '</span></div>';
      }).join('') + '</div></div>' +
      '</div>' +

      // ========== 新增：巡视管理 ==========
      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>' + U.icon('check') + '巡视管理</h3>' +
      (patrol ? '<span class="more">' +
        '总任务 <b>' + patrol.total + '</b> · 已完成 <b>' + patrol.done + '</b> · ' +
        (patrol.completionRate != null ? '完成率 <b>' + patrol.completionRate + '%</b>' : '') +
        (patrol.linkedTickets ? ' · 异常转工单 <b>' + patrol.linkedTickets + '</b>' : '') +
      '</span>' : '') + '</div>' +
      (patrol ? _renderPatrolBlock(patrol) : '<div class="empty">正在加载巡视数据...</div>') + '</div>' +

      // ========== 新增：设备台账 ==========
      '<div class="card"><div class="card-head"><h3>' + U.icon('server') + '设备台账</h3>' +
      (device ? '<span class="more">在册 <b>' + device.total + '</b> 台 · 已过保 <b>' + (device.warranty || {})['已过保'] + '</b> · 90天内到期 <b>' + (device.warranty || {})['90天内到期'] + '</b></span>' : '') + '</div>' +
      (device ? _renderDeviceBlock(device) : '<div class="empty">正在加载设备台账数据...</div>') + '</div>';
  }

  function _renderPatrolBlock(p) {
    if (p.total === 0) return '<div class="empty">当前区间内暂无巡视记录</div>';
    // 参与人表格
    var personRows = (p.byPerson || []).map(function (x) {
      return '<tr><td>' + U.esc(x.name) + '</td><td>' + x.done_count + ' 次</td><td>' + (x.fail_found || 0) + ' 项</td></tr>';
    }).join('') || '<tr><td colspan="3" style="color:#b9bec7;text-align:center">—</td></tr>';
    // 异常最近几条
    var abnormal = (p.abnormal || []).slice(0, 5).map(function (a) {
      return '<tr><td class="mono">' + U.esc(a.date) + '</td><td>' + U.esc(a.name || '') + '</td>' +
        '<td style="color:#f5222d;font-weight:500">' + (a.fail_count || 0) + ' 项异常</td>' +
        '<td>' + U.esc(a.by || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:#b9bec7;text-align:center">—</td></tr>';

    // 每日完成率小条形
    var dailyBar = (p.daily || []).slice(-14).map(function (d) {
      var r = d.total ? Math.round(d.done / d.total * 100) : 0;
      var cls = r >= 90 ? '#52c41a' : (r >= 70 ? '#fa8c16' : '#f5222d');
      return '<div class="bar-row" style="grid-template-columns:80px 1fr 40px"><span class="lb mono">' + d.label + '</span>' +
        '<span class="track"><i style="width:' + r + '%;background:' + cls + '"></i></span>' +
        '<span class="n" style="color:' + cls + '">' + r + '%</span></div>';
    }).join('');

    return '<div class="grid grid-2" style="gap:16px">' +
      '<div><div style="font-size:11px;color:#8f959e;margin-bottom:8px">近 14 天每日巡视完成率</div>' +
      '<div class="bars">' + dailyBar + '</div></div>' +
      '<div><div style="font-size:11px;color:#8f959e;margin-bottom:8px">参与工程师工作量</div>' +
      '<table class="report-table" style="font-size:12px"><thead><tr><th>工程师</th><th>完成次数</th><th>发现异常</th></tr></thead><tbody>' + personRows + '</tbody></table></div>' +
      '</div>' +
      '<div style="margin-top:14px"><div style="font-size:11px;color:#8f959e;margin-bottom:8px">近期异常记录</div>' +
      '<table class="report-table" style="font-size:12px"><thead><tr><th>日期</th><th>时段</th><th>异常数</th><th>执行人</th></tr></thead><tbody>' + abnormal + '</tbody></table></div>';
  }

  function _renderDeviceBlock(d) {
    if (!d || !d.total) return '<div class="empty">设备台账为空</div>';
    // 状态分布
    var status = d.byStatus || {};
    var statusHtml = Object.keys(status).map(function (k) {
      return '<span class="lb">' + U.esc(k) + '</span><span class="n">' + status[k] + '</span>';
    }).join('') || '<span class="lb" style="color:#b9bec7">—</span>';

    // 保修状态
    var warranty = d.warranty || {};
    var wHtml = Object.keys(warranty).map(function (k) {
      var color = k === '已过保' ? '#f5222d' : (k === '90天内到期' ? '#fa8c16' : (k === '在保' ? '#52c41a' : '#8f959e'));
      return '<span style="color:' + color + ';font-weight:600">' + U.esc(k) + ' ' + warranty[k] + ' 台</span>';
    }).join(' · ');

    // TOP 教室设备
    var rooms = (d.byRoom || []).slice(0, 8).map(function (r) {
      var max = Math.max(1, (d.byRoom[0] || {}).count || 1);
      return '<div class="bar-row" style="grid-template-columns:64px 1fr 26px"><span class="lb mono">' + U.esc(r.name) + '</span><span class="track"><i style="width:' + Math.round(r.count / max * 100) + '%;background:linear-gradient(90deg,#91caff,#1677ff)"></i></span><span class="n">' + r.count + '</span></div>';
    }).join('');

    // 类别分布
    var cats = (d.byCategory || []).slice(0, 6).map(function (c) {
      var maxC = Math.max(1, (d.byCategory[0] || {}).count || 1);
      return '<div class="bar-row" style="grid-template-columns:80px 1fr 26px"><span class="lb">' + U.esc(c.name) + '</span><span class="track"><i style="width:' + Math.round(c.count / maxC * 100) + '%;background:linear-gradient(90deg,#d3adf7,#722ed1)"></i></span><span class="n">' + c.count + '</span></div>';
    }).join('');

    return '<div class="grid grid-2" style="gap:16px">' +
      '<div>' +
      '<div style="margin-bottom:10px;padding:10px 14px;background:#fafcff;border:1px solid #dbeafe;border-radius:8px;font-size:12px">' +
      '<div style="color:#646a73;margin-bottom:4px">设备状态：' + statusHtml + '</div>' +
      '<div style="color:#646a73">保修情况：' + (wHtml || '—') + '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#8f959e;margin-bottom:8px">TOP 教室设备数</div>' +
      '<div class="bars">' + rooms + '</div>' +
      '</div>' +
      '<div>' +
      '<div style="font-size:11px;color:#8f959e;margin-bottom:8px">按类别分布</div>' +
      '<div class="bars">' + cats + '</div>' +
      '<div style="font-size:11px;color:#8f959e;margin:12px 0 6px">维修中的教室</div>' +
      ((d.repairingRooms || []).length ? '<div class="bars">' + d.repairingRooms.map(function (r) {
        return '<div class="bar-row"><span class="lb mono">' + U.esc(r.name) + '</span><span class="n">' + r.count + ' 台</span></div>';
      }).join('') + '</div>' : '<div style="color:#52c41a;font-size:12px">— 全部设备运行正常 —</div>') +
      '</div>' +
      '</div>';
  }

  function reportRangeText() { return (from || '') + ' 至 ' + (to || '') + (stage ? '（阶段：' + stageText() + '）' : ''); }

  function exportRowsForExcel() {
    var s = _clientStats();  // 导出明细必须要前端完整数据
    var info = [
      ['东华大学松江校区多媒体教室运维报表'],
      ['统计区间', from + ' 至 ' + to],
      ['阶段', stageText()],
      ['生成时间', S.fmtFull(S.isoLocal(new Date()))],
      [],
      ['指标', '数值'],
      ['日志总量', s.total], ['已记录', s.closed], ['待填报', s.open], ['已取消', s.cancelled],
      ['紧急日志', s.urgent],
      ['平均指派时长（分）', s.avgDispatch == null ? '—' : s.avgDispatch],
      ['平均响应时长（分）', s.avgArrive == null ? '—' : s.avgArrive],
      ['平均处理时长（分）', s.avgHandle == null ? '—' : s.avgHandle],
      ['平均完结时长（分）', s.avgClose == null ? '—' : s.avgClose],
      ['SLA 响应达标率', s.slaRate == null ? '—' : s.slaRate + '%'],
      ['平均满意度', s.satisfaction == null ? '—' : s.satisfaction.toFixed(2)]
    ];
    return [
      { name: '汇总', rows: info, widths: [22, 48, 12, 12] },
      { name: '故障类型', rows: [['故障类型', '日志数', '占比']].concat(s.typeList.map(function (t) { return [t.name, t.count, (s.total ? (t.count / s.total * 100).toFixed(1) : '0') + '%']; })), widths: [24, 12, 12] },
      { name: '楼栋分布', rows: [['楼栋', '日志数']].concat(s.buildingList.map(function (t) { return [t.name, t.count]; })), widths: [24, 12] },
      { name: '教室TOP', rows: [['教室', '日志数']].concat(s.roomList.map(function (t) { return [t.name, t.count]; })), widths: [16, 12] },
      { name: '工程师工作量', rows: [['工程师', '处理', '已处理', '已记录', '平均处理（分）', '满意度']].concat(s.engineers.map(function (e) { return [e.name, e.total, e.resolved, e.closed, e.handleAvg == null ? '—' : e.handleAvg, e.sat == null ? '—' : e.sat.toFixed(1)]; })), widths: [14, 10, 10, 10, 18, 10] },
      { name: '日志明细', rows: S.exportRows(s.list), widths: [22, 18, 12, 14, 10, 10, 14, 16, 40, 10, 10, 10, 12, 18, 18, 18, 36, 16, 10, 18, 12, 10, 18, 24, 10] }
    ];
  }

  function exportXLSX() {
    var ok = U.downloadXLSX('运维报表_' + from + '_' + to + '.xlsx', exportRowsForExcel());
    U.toast(ok ? 'Excel 已导出（含汇总 / 故障类型 / 楼栋 / 工程师 / 明细 6 个工作表）' : '未加载 Excel 库，已改为导出 CSV', ok ? 'ok' : 'err');
  }
  function exportCSV() {
    var s = _clientStats();
    U.downloadCSV('运维日志明细_' + from + '_' + to + '.csv', S.exportRows(s.list));
    U.toast('CSV 已导出，可用 Excel 打开', 'ok');
  }

  // ---------- PDF 报告 ----------
  function buildAnalysis(s, days) {
    var lines = [];
    var avgDay = days ? Math.round(s.total / days * 10) / 10 : 0;
    var closeRate = s.total ? Math.round(s.closed / s.total * 100) : 0;
    lines.push('1. 总体概览：统计区间内共产生 ' + s.total + ' 条工单（日均 ' + avgDay + ' 条），其中已记录 ' + s.closed + ' 条，完成率 ' + closeRate + '%；待填报 ' + s.open + ' 条，已取消 ' + s.cancelled + ' 条。' +
      (s.urgent ? '期间含紧急工单 ' + s.urgent + ' 条。' : '') +
      (s.avgHandle != null ? '平均处理时长 ' + s.avgHandle + ' 分钟，' : '') +
      (s.avgArrive != null ? '平均响应 ' + s.avgArrive + ' 分钟，' : '') +
      (s.slaRate != null ? 'SLA 达标率 ' + s.slaRate + '%。' : ''));
    if (s.typeList && s.typeList.length) {
      var top3 = s.typeList.slice(0, 3).map(function (t) { return t.name + '(' + t.count + '，' + (s.total ? Math.round(t.count / s.total * 100) : 0) + '%)'; }).join('、');
      lines.push('2. 故障类型 TOP：' + top3 + '。建议围绕高频故障安排预防性巡检或供应商专项排查，减少重复报修。');
    }
    if (s.buildingList && s.buildingList.length) {
      var topB = s.buildingList[0];
      lines.push('3. 楼栋分布：' + topB.name + ' 工单量最高（' + topB.count + ' 条）' +
        (s.buildingList.length > 1 ? '；可结合教室密度进一步分析重点区域。' : '。'));
    }
    if (s.engineers && s.engineers.length) {
      var engHeavy = s.engineers.slice().sort(function (a, b) { return b.total - a.total; })[0];
      lines.push('4. 工程师工作量：' + engHeavy.name + ' 处理量最大（' + engHeavy.total + ' 条）。建议关注工作量分布，必要时重新划分责任楼栋或引入外包支持。');
    }
    if (s.open > 0) {
      lines.push('5. 待填报工单 ' + s.open + ' 条，请工程师尽快在「每日工作日志」中补录完整处理过程。');
    }
    return lines.join('\n');
  }

  // 服务端生成矢量 PDF（文字可搜索、体积小、分页正确）；失败时回退到本地截图方案
  function exportPDF() {
    var s = _clientStats();
    var days = spanDays(from, to);
    var tx = reportRangeText();
    var analysis = buildAnalysis(s, days);
    var total = s.total || 1;
    var ftList = S.getState().settings.faultTypes || [];
    var payload = {
      from: from, to: to, tx: tx, days: days,
      now: S.fmtFull(S.isoLocal(new Date())),
      org: S.getState().settings.org || '东华大学信息中心',
      analysis: analysis,
      kpi: {
        total: s.total, closed: s.closed, open: s.open, avgDispatch: s.avgDispatch,
        avgArrive: s.avgArrive, avgHandle: s.avgHandle, avgClose: s.avgClose,
        slaRate: s.slaRate, satisfaction: s.satisfaction, urgent: s.urgent
      },
      types: (s.typeList || []).map(function (t) {
        var ft = ftList.filter(function (x) { return x.name === t.name; })[0];
        return { name: t.name, count: t.count, ratio: t.count / total * 100, color: ft ? ft.color : '#8f959e' };
      }),
      buildings: s.buildingList || [],
      rooms: s.roomList || [],
      statuses: s.statusList || [],
      trend: s.trend || [],
      engineers: s.engineers || []
    };
    U.toast('正在生成 PDF 报告，请稍候...', 'ok');
    S.apiPostBlob('report/pdf', payload).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '东华大学运维统计报告_' + from + '_' + to + '.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      U.toast('PDF 报告已生成（矢量文字，可搜索复制）', 'ok');
    }).catch(function (err) {
      U.toast('服务端生成失败，改用本地导出：' + (err.message || err), 'warn');
      exportPDFLegacy(s, days, tx, analysis);
    });
  }

  function exportPDFLegacy(s, days, tx, analysis) {
    if (!window.jspdf || !window.html2canvas) {
      // PDF 相关库按需加载，加载完成后再继续
      U.ensurePDFLibs().then(function () { exportPDFLegacy(s, days, tx, analysis); }, function () {});
      return;
    }
    var pdfHtml = renderPdfReport(s, days, tx, analysis);
    var container = document.createElement('div');
    container.id = '__pdf_container__';
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:1100px;background:#fff;overflow:visible';
    container.innerHTML = pdfHtml;
    document.body.appendChild(container);
    setTimeout(function () {
      var { jsPDF } = window.jspdf;
      var pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var pxPerPt = 2;
      html2canvas(container, {
        scale: pxPerPt, backgroundColor: '#ffffff', useCORS: true,
        windowWidth: 1100, windowHeight: container.scrollHeight
      }).then(function (canvas) {
        try {
          var imgData = canvas.toDataURL('image/jpeg', 0.95);
          var totalHeight = canvas.height / pxPerPt;
          var sliceHeight = pageH * pxPerPt;
          var heightLeft = canvas.height;
          var position = 0;
          if (heightLeft > 0) {
            pdf.addImage(imgData, 'JPEG', 0, position, pageW, totalHeight, undefined, 'FAST');
            heightLeft -= sliceHeight;
            while (heightLeft > 0) {
              position -= pageH;
              pdf.addPage();
              pdf.addImage(imgData, 'JPEG', 0, position, pageW, totalHeight, undefined, 'FAST');
              heightLeft -= sliceHeight;
            }
          }
          var fname = '东华大学运维统计报告_' + from + '_' + to + '.pdf';
          pdf.save(fname);
          U.toast('PDF 报告已生成并下载 · ' + fname, 'ok');
        } catch (e) {
          U.toast('PDF 生成失败：' + (e.message || e), 'err');
          console.error(e);
        }
        try { document.body.removeChild(container); } catch (e) {}
      }).catch(function (err) {
        U.toast('PDF 渲染失败：' + (err.message || err), 'err');
        console.error(err);
        try { document.body.removeChild(container); } catch (e) {}
      });
    }, 200);
  }

  function renderPdfReport(s, days, tx, analysis) {
    var now = S.fmtFull(S.isoLocal(new Date()));
    var total = s.total || 1;
    var avgDay = days ? Math.round(s.total / days * 10) / 10 : 0;
    var closeRate = s.total ? Math.round(s.closed / s.total * 100) : 0;
    var typeList = s.typeList || [];
    var typeHtml = typeList.length ? typeList.map(function (t) {
      var max = typeList[0].count || 1;
      var ft = S.getState().settings.faultTypes.filter(function (x) { return x.name === t.name; })[0];
      var color = ft ? ft.color : '#8f959e';
      return '<tr><td>' + S.esc(t.name) + '</td><td class="n">' + t.count + '</td><td class="pct">' + (Math.round(t.count / total * 100)) + '%</td>' +
        '<td class="bar"><i style="width:' + Math.round(t.count / max * 240) + 'px;background:' + color + '"></i></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">暂无数据</td></tr>';
    var bldHtml = (s.buildingList || []).length ? s.buildingList.map(function (b) {
      return '<tr><td>' + S.esc(b.name) + '</td><td class="n">' + b.count + '</td></tr>';
    }).join('') : '';
    var roomHtml = (s.roomList || []).length ? s.roomList.slice(0, 10).map(function (r) {
      return '<tr><td class="mono">' + S.esc(r.name) + '</td><td class="n">' + r.count + '</td></tr>';
    }).join('') : '';
    var engHtml = (s.engineers || []).length ? s.engineers.map(function (e) {
      return '<tr><td>' + S.esc(e.name) + '</td><td>' + e.total + '</td><td>' + e.resolved + '</td><td>' + e.closed + '</td><td class="mono">' + (e.handleAvg == null ? '—' : e.handleAvg) + '</td><td>' + (e.sat == null ? '—' : e.sat.toFixed(1)) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">暂无数据</td></tr>';
    var statHtml =
      '<tr><td>平均指派</td><td>' + (s.avgDispatch == null ? '—' : s.avgDispatch + ' 分') + '</td>' +
      '<td>平均响应</td><td>' + (s.avgArrive == null ? '—' : s.avgArrive + ' 分') + '</td></tr>' +
      '<tr><td>平均处理</td><td>' + (s.avgHandle == null ? '—' : s.avgHandle + ' 分') + '</td>' +
      '<td>平均完结</td><td>' + (s.avgClose == null ? '—' : s.avgClose + ' 分') + '</td></tr>' +
      '<tr><td>SLA 达标率</td><td>' + (s.slaRate == null ? '—' : s.slaRate + '%') + '</td>' +
      '<td>平均满意度</td><td>' + (s.satisfaction == null ? '—' : s.satisfaction.toFixed(2)) + ' / 5</td></tr>';

    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>东华大学松江校区多媒体教室运维统计报告 · ' + S.esc(tx) + '</title>' +
      '<style>' +
      'body{font-family:"PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;color:#1f2937;background:#fff;margin:0;padding:34px 40px;line-height:1.55;font-size:13px}' +
      '.hd{text-align:center;border-bottom:3px solid #1677ff;padding-bottom:14px;margin-bottom:18px}' +
      '.hd h1{font-size:22px;margin:0 0 5px;letter-spacing:2px;color:#0d3d86}' +
      '.hd .sub{font-size:12px;color:#646a73}' +
      '.meta{font-size:11.5px;color:#646a73;margin-bottom:18px;border-bottom:1px dashed #dcdfe6;padding-bottom:10px}' +
      '.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}' +
      '.kpi{background:#fafcff;border:1px solid #dbeafe;border-radius:8px;padding:12px 14px;text-align:center}' +
      '.kpi.lab{font-size:11px;color:#646a73;margin-bottom:4px}' +
      '.kpi.val{font-size:22px;font-weight:750;color:#1677ff;letter-spacing:-1px}' +
      '.kpi.sub{font-size:10.5px;color:#8f959e;margin-top:3px}' +
      '.kpi.green{border-color:#d9f7be;background:#f6ffed}' +
      '.kpi.green .val{color:#389e0d}' +
      '.kpi.orange{border-color:#ffe7ba;background:#fff7e6}' +
      '.kpi.orange .val{color:#d46b08}' +
      '.kpi.purple{border-color:#efdbff;background:#f9f0ff}' +
      '.kpi.purple .val{color:#722ed1}' +
      '.kpi.cyan{border-color:#b5f5ec;background:#e6fffb}' +
      '.kpi.cyan .val{color:#08979c}' +
      '.sec{margin-bottom:16px}' +
      '.sec h2{font-size:14px;margin:0 0 10px;color:#1677ff;border-left:3px solid #1677ff;padding-left:7px;font-weight:600}' +
      '.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}' +
      'table{border-collapse:collapse;width:100%;font-size:12px}' +
      'th,td{border-bottom:1px solid #eef0f3;padding:5px 7px;text-align:left}' +
      'thead th{background:#f7f9fc;font-weight:600;color:#3f4652}' +
      'td.n{text-align:right;font-variant-numeric:tabular-nums}' +
      'td.pct{text-align:right;color:#646a73;font-variant-numeric:tabular-nums}' +
      'td.bar{padding-right:0}' +
      'td.bar i{display:block;height:10px;border-radius:3px}' +
      '.empty{text-align:center;color:#b9bec7;padding:16px;font-style:normal}' +
      '.block{background:#fafcff;border-left:3px solid #1677ff;border-radius:6px;padding:12px 14px;font-size:12.5px;line-height:1.85;white-space:pre-wrap;color:#1f2937;margin-bottom:4px}' +
      '.footer{font-size:10.5px;color:#8f959e;text-align:center;margin-top:24px;border-top:1px dashed #eef0f3;padding-top:10px}' +
      '@media print{body{padding:20px 24px}.sec{page-break-inside:avoid}.kpis,.two{page-break-inside:avoid}}' +
      '</style></head><body>' +
      '<div class="hd"><h1>东华大学松江校区多媒体教室运维统计报告</h1><div class="sub">数据实时基于本地日志自动汇总 · 离线可用</div></div>' +
      '<div class="meta">统计区间：<b>' + S.esc(tx) + '</b>（共 ' + days + ' 天） · 生成时间：' + S.esc(now) + ' · 编制单位：' + S.esc(S.getState().settings.org || '东华大学信息中心') + '</div>' +

      '<div class="kpis">' +
      '<div class="kpi"><div class="lab">工单总量</div><div class="val">' + s.total + '</div><div class="sub">日均 ' + avgDay + ' 条</div></div>' +
      '<div class="kpi green"><div class="lab">已记录 / 完成率</div><div class="val">' + s.closed + '</div><div class="sub">' + closeRate + '% · 待填报 ' + s.open + '</div></div>' +
      '<div class="kpi orange"><div class="lab">平均响应</div><div class="val">' + (s.avgArrive == null ? '—' : s.avgArrive) + '</div><div class="sub">分 · SLA ' + (s.slaRate == null ? '—' : s.slaRate + '%') + '</div></div>' +
      '<div class="kpi purple"><div class="lab">平均处理时长</div><div class="val">' + (s.avgHandle == null ? '—' : s.avgHandle) + '</div><div class="sub">分</div></div>' +
      '<div class="kpi cyan"><div class="lab">平均满意度</div><div class="val">' + (s.satisfaction == null ? '—' : s.satisfaction.toFixed(1)) + '</div><div class="sub">紧急 ' + s.urgent + ' 条</div></div>' +
      '</div>' +

      '<div class="sec"><h2>一、关键指标汇总</h2><table>' +
      '<thead><tr><th>指标</th><th>数值</th><th>指标</th><th>数值</th></tr></thead><tbody>' + statHtml + '</tbody></table></div>' +

      '<div class="sec"><h2>二、分析报告</h2><div class="block">' + S.esc(analysis) + '</div></div>' +

      '<div class="two">' +
      '<div class="sec"><h2>三、故障类型 TOP</h2><table><thead><tr><th>故障类型</th><th style="width:60px">数量</th><th style="width:56px">占比</th><th style="width:240px"></th></tr></thead><tbody>' + typeHtml + '</tbody></table></div>' +
      '<div class="sec"><h2>四、楼栋分布</h2><table><thead><tr><th>楼栋</th><th style="width:80px">工单数</th></tr></thead><tbody>' + bldHtml + '</tbody></table>' +
      (roomHtml ? '<h2 style="margin-top:14px">教室 TOP 10</h2><table><thead><tr><th>教室</th><th style="width:80px">工单数</th></tr></thead><tbody>' + roomHtml + '</tbody></table>' : '') +
      '</div></div>' +

      '<div class="sec"><h2>五、工程师工作量</h2><table><thead><tr><th>工程师</th><th>处理</th><th>已处理</th><th>已记录</th><th>平均处理（分）</th><th>满意度</th></tr></thead><tbody>' + engHtml + '</tbody></table></div>' +

      '<div class="footer">本报告由东华大学多媒体教室运维系统自动生成 · ' + S.esc(now) + ' · 数据仅供运维管理参考</div>' +
      '</body></html>';
  }

  window.Views = window.Views || {};
  window.Views.reports = {
    render: render,
    afterRender: renderAfter,
    applyPeriod: applyPeriod, setDate: setDate, setStage: setStage,
    exportXLSX: exportXLSX, exportCSV: exportCSV, exportPDF: exportPDF,
    buildAnalysis: buildAnalysis, renderPdfReport: renderPdfReport,
    _invalidateCache: function () { _apiCache = null; }
  };
})();
