/* 系统管理：审计日志（仅管理员可见） */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var f = { from: '', to: '', user: '', category: '', q: '' };
  var page = 1, size = 20;
  var data = { total: 0, items: [], users: [] };
  var loading = false;
  var loaded = false;
  var seq = 0;

  var CAT_STYLE = {
    '登录': 'tag-green', '页面': 'tag-gray', '日志': 'tag-blue', '工单': 'tag-orange',
    '巡视': 'tag-blue', '配置': 'tag-gray', '数据': 'tag-orange', '知识库': 'tag-green',
    '用户': 'tag-red', '系统': 'tag-gray'
  };
  // 类别 → 左侧菜单名称，列表与筛选项都用业务名称展示
  var MODULE_NAMES = {
    '登录': '登录认证', '页面': '页面访问', '日志': '每日工作日志', '工单': '来电受理',
    '巡视': '巡视管理', '配置': '基础配置', '数据': '导入 / 导出', '知识库': '知识库',
    '用户': '用户与权限', '系统': '系统设置'
  };
  var PERM_NAMES = {
    dashboard: '工作台', intake: '来电登记', 'daily-log': '每日工作日志', 'log-entry': '单条日志录入',
    patrol: '巡视管理', tickets: '日志查询', reports: '统计报表', assets: '教室/设备档案',
    kb: '知识库', data: '导入 / 导出', settings: '基础配置', help: '使用说明'
  };
  var FIELD_NAMES = {
    date: '日期', period: '时段', stage: '教学阶段', room: '教室编号', fault: '故障类型',
    desc: '工作内容', summary: '工作内容', action: '处理结果', remark: '备注',
    assignee: '责任人', helpers: '协办人', result: '处理状态', solved: '解决情况',
    status: '状态', devices: '涉及设备', device: '涉及设备', parts: '更换备件',
    display_name: '用户名', role: '角色', active: '启用状态', is_admin: '账号类型', pwd: '密码',
    no: '教室编号', capacity: '容量', zone: '区域', roomType: '教室类型', building: '所属楼宇',
    name: '名称', phone: '手机号', buildings: '负责楼宇', category: '设备类别', brand: '品牌型号',
    sn: '序列号', boughtAt: '启用日期', warrantyTo: '保修至', repairCount: '维修次数', note: '备注'
  };

  function moduleOf(a) {
    var act = String(a.action || '');
    if (/设备/.test(act)) return '教室/设备档案';
    if (/教室/.test(act)) return '基础配置';
    return MODULE_NAMES[a.category] || a.category;
  }

  // 旧版本写入的英文标识在这里转换成中文，只影响展示，不改数据库
  function zhKeys(text) {
    return String(text || '').split(/[、,，;；\s]+/).filter(Boolean)
      .map(function (k) { return PERM_NAMES[k] || FIELD_NAMES[k] || ''; })
      .filter(Boolean).join('、');
  }
  function prettyDetail(a) {
    var d = String(a.detail || '').trim();
    var m;
    if (!d) return '';
    if ((m = d.match(/^权限：(.*)$/))) {
      var names = zhKeys(m[1]);
      if (names) return '设置可访问页面：' + names;
      return m[1].trim() === '无' ? '收回全部菜单权限' : '更新了可访问页面权限';
    }
    if ((m = d.match(/^用户组 ID：(.*)$/))) {
      var ids = m[1].trim() === '无' ? [] : m[1].split('、').filter(Boolean);
      return ids.length ? ('调整所属用户组：涉及 ' + ids.length + ' 个用户组') : '移出全部用户组';
    }
    if ((m = d.match(/^修改项：(.*)$/))) {
      var ks = zhKeys(m[1].replace(/、?pwd（含密码）/, '').replace(/（含密码）/g, ''));
      return '修改了' + (ks || '账号资料') + (/含密码/.test(d) ? '；已重置登录密码' : '');
    }
    if ((m = d.match(/^字段：(.*)$/))) {
      return '修改了' + (zhKeys(m[1]) || '日志') + '等字段';
    }
    return d;
  }

  function initDates() {
    if (f.from || f.to) return;
    var now = S.nowLocal();
    f.from = S.dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    f.to = S.fmtDate(now);
  }

  function pages() { return Math.max(1, Math.ceil(data.total / size)); }

  function render() {
    initDates();
    var total = pages();
    var rows = data.items.map(function (a) {
      var detail = prettyDetail(a);
      return '<tr>' +
        '<td style="white-space:nowrap">' + S.esc(S.fmtFull(a.ts)) + '</td>' +
        '<td>' + S.esc(a.user) + '</td>' +
        '<td><span class="tag ' + (CAT_STYLE[a.category] || 'tag-gray') + '">' + S.esc(moduleOf(a)) + '</span></td>' +
        '<td style="white-space:nowrap">' + S.esc(a.action) + '</td>' +
        '<td>' + S.esc(a.target || '—') + '</td>' +
        '<td style="color:var(--sub);font-size:12px;min-width:300px"><div style="line-height:1.6;white-space:normal;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden" title="' + S.esc(detail) + '">' + S.esc(detail || '—') + '</div></td>' +
        '<td style="white-space:nowrap;color:var(--faint);font-size:12px">' + S.esc(a.ip || '—') + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="page-head"><div><div class="page-title">审计日志</div>' +
      '<div class="page-sub">记录登录、退出、页面访问，以及日志 / 工单 / 巡视 / 配置 / 数据 / 用户管理等操作；仅管理员可见</div></div>' +
      '<div class="head-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.audit.reload()">' + U.icon('refresh') + '刷新</button>' +
      '<button class="btn btn-primary btn-sm" onclick="Views.audit.exportCSV()">' + U.icon('download') + '导出当前结果</button>' +
      '</div></div>' +

      '<div class="card">' +
      '<div class="toolbar" style="padding:0 0 14px;box-shadow:none;margin-bottom:0;flex-wrap:wrap;gap:8px">' +
      '<input type="date" class="inp sm" id="a-from" value="' + f.from + '">~' +
      '<input type="date" class="inp sm" id="a-to" value="' + f.to + '">' +
      '<select class="inp sm" id="a-user"><option value="">全部用户</option>' + (data.users || []).map(function (u) {
        return '<option' + (f.user === u ? ' selected' : '') + '>' + S.esc(u) + '</option>';
      }).join('') + '</select>' +
      '<select class="inp sm" id="a-cat"><option value="">全部模块</option>' + Object.keys(CAT_STYLE).map(function (c) {
        return '<option value="' + c + '"' + (f.category === c ? ' selected' : '') + '>' + (MODULE_NAMES[c] || c) + '</option>';
      }).join('') + '</select>' +
      '<input class="inp sm" style="width:200px" id="a-kw" placeholder="搜索操作 / 对象 / 详情" value="' + S.esc(f.q) + '" onkeydown="if(event.key===\'Enter\')Views.audit.search()">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.audit.search()">' + U.icon('search') + '查询</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.audit.reset()">重置</button>' +
      '<select class="inp sm" style="margin-left:auto;width:110px" onchange="Views.audit.setSize(this.value)">' +
      [20, 50, 100].map(function (n) { return '<option value="' + n + '"' + (size === n ? ' selected' : '') + '>每页 ' + n + ' 条</option>'; }).join('') +
      '</select>' +
      '</div>' +

      '<div class="table-meta"><span>共 <b>' + data.total + '</b> 条记录' + (f.user ? ' · 用户 <b>' + S.esc(f.user) + '</b>' : '') + (f.category ? ' · 模块 <b>' + (MODULE_NAMES[f.category] || f.category) + '</b>' : '') + '</span>' +
      '<span>第 ' + page + ' / ' + total + ' 页</span></div>' +

      '<div class="table-scroll"><table class="data-table"><thead><tr>' +
      '<th style="width:130px">时间</th><th style="width:96px">用户</th><th style="width:110px">模块</th>' +
      '<th style="width:120px">操作</th><th style="width:140px">对象</th><th>详情</th><th style="width:110px">IP</th>' +
      '</tr></thead><tbody>' +
      (loading ? '<tr><td colspan="7"><div class="empty">加载中…</div></td></tr>' :
        (rows ? rows : '<tr><td colspan="7"><div class="empty">没有符合条件的审计记录</div></td></tr>')) +
      '</tbody></table></div>' +

      '<div class="pager">' +
      '<button class="btn btn-ghost btn-sm" ' + (page <= 1 ? 'disabled' : '') + ' onclick="Views.audit.toPage(' + (page - 1) + ')">上一页</button>' +
      '<span>第 ' + page + ' / ' + total + ' 页</span>' +
      '<button class="btn btn-ghost btn-sm" ' + (page >= total ? 'disabled' : '') + ' onclick="Views.audit.toPage(' + (page + 1) + ')">下一页</button>' +
      '</div></div>';
  }

  function load() {
    var my = ++seq;
    loading = true;
    App.render();
    S.listAudit({ from: f.from, to: f.to, user: f.user, category: f.category, q: f.q, page: page, size: size })
      .then(function (res) {
        if (my !== seq) return;
        data = res || { total: 0, items: [], users: [] };
        if (page > pages()) { page = pages(); return load(); }
        loading = false;
        App.render();
      })
      .catch(function (e) {
        if (my !== seq) return;
        loading = false;
        U.toast(e.message || '加载失败', 'err');
        App.render();
      });
  }

  function readFilters() {
    f.from = (document.getElementById('a-from') || {}).value || '';
    f.to = (document.getElementById('a-to') || {}).value || '';
    f.user = (document.getElementById('a-user') || {}).value || '';
    f.category = (document.getElementById('a-cat') || {}).value || '';
    f.q = (document.getElementById('a-kw') || {}).value || '';
  }

  function search() { readFilters(); page = 1; load(); }
  function reset() {
    f = { from: '', to: '', user: '', category: '', q: '' };
    page = 1;
    initDates();
    load();
  }
  function reload() { load(); }
  function toPage(p) { page = Math.max(1, Math.min(pages(), p || 1)); load(); }
  function setSize(n) { size = parseInt(n, 10) || 20; page = 1; load(); }

  function exportCSV() {
    var kw = f.q || ((document.getElementById('a-kw') || {}).value || '');
    S.listAudit({ from: f.from, to: f.to, user: f.user, category: f.category, q: kw, page: 1, size: 5000 })
      .then(function (res) {
        var rows = [['时间', '用户', '模块', '操作', '对象', '详情', 'IP']].concat((res.items || []).map(function (a) {
          return [S.fmtFull(a.ts), a.user, moduleOf(a), a.action, a.target || '', prettyDetail(a), a.ip || ''];
        }));
        var now = S.nowLocal();
        U.downloadCSV('审计日志_' + S.fmtDate(now) + '_' + (now.getHours() < 10 ? '0' : '') + now.getHours() + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + '.csv', rows);
        if (res.total > rows.length - 1) U.toast('结果超过 5000 条，仅导出最近 5000 条，请缩小筛选范围', 'warn');
      })
      .catch(function (e) { U.toast(e.message || '导出失败', 'err'); });
  }

  function afterRender() {
    if (loaded) return;
    loaded = true;
    load();
  }

  window.Views = window.Views || {};
  window.Views.audit = {
    render: render, afterRender: afterRender,
    search: search, reset: reset, reload: reload, toPage: toPage, setSize: setSize, exportCSV: exportCSV
  };
})();
