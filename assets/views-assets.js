/* 教室 / 设备档案：教室健康档案 + 设备台账 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var tab = 'rooms';                        // rooms | devices
  var rf = { kw: '', building: '', zone: '', level: '' };
  var rp = { page: 1, size: 25 };           // 教室档案分页
  var dp = { page: 1, size: 25 };           // 设备台账分页
  var df = { kw: '', category: '', status: '', building: '' };

  var LEVEL = {
    good:  { label: '良好', color: '#52c41a', bg: '#f6ffed' },
    watch: { label: '关注', color: '#fa8c16', bg: '#fff7e6' },
    risk:  { label: '告警', color: '#f5222d', bg: '#fff1f0' }
  };
  var DEV_STATUS_COLOR = {
    '在用': '#52c41a', '备用': '#1677ff', '维修中': '#fa8c16', '报废': '#8f959e'
  };

  function buildings() {
    var map = {};
    S.getState().settings.rooms.forEach(function (r) { if (r.building) map[r.building] = 1; });
    return Object.keys(map);
  }

  function head() {
    var admin = S.isAdmin();
    return '<div class="page-head"><div><div class="page-title">教室 / 设备档案</div>' +
      '<div class="page-sub">按教室建立设备台账与健康档案，查看近 90 天故障密度、保修状态与需重点关注教室</div></div>' +
      '<div class="head-actions">' +
      (admin ? '<button class="btn btn-ghost" onclick="Views.assets.initDevices()">' + U.icon('refresh', 15) + '初始化设备台账</button>' : '') +
      '<button class="btn btn-primary" onclick="Views.assets.exportDevices()">' + U.icon('download', 15) + '导出台账</button>' +
      '</div></div>';
  }

  function kpis() {
    var ds = S.deviceSummary();
    var profiles = S.roomProfiles();
    var need = profiles.filter(function (p) { return p.level !== 'good'; }).length;
    var rooms = S.getState().settings.rooms.filter(function (r) { return r.active !== false; }).length;
    return '<div class="kpis" style="grid-template-columns:repeat(4,1fr)">' +
      '<div class="kpi blue"><div class="lab">教室档案</div><div class="val">' + rooms + '</div><div class="sub">启用中的多媒体教室</div></div>' +
      '<div class="kpi purple"><div class="lab">设备台账</div><div class="val">' + ds.total + '</div><div class="sub">在册设备 ' + ds.total + ' 台，维修中 ' + ds.repairing + ' 台</div></div>' +
      '<div class="kpi orange"><div class="lab">保修关注</div><div class="val">' + (ds.soon + ds.expired) + '</div><div class="sub">' + ds.expired + ' 台已过保 · ' + ds.soon + ' 台 90 天内到期</div></div>' +
      '<div class="kpi red"><div class="lab">需关注教室</div><div class="val">' + need + '</div><div class="sub">健康分低于 85 分</div></div>' +
      '</div>';
  }

  function tabs() {
    var devN = S.devices().length;
    var roomN = S.getState().settings.rooms.length;
    return '<div class="tabs"><button class="' + (tab === 'rooms' ? 'on' : '') + '" onclick="Views.assets.switchTab(\'rooms\')">教室档案<span class="n">' + roomN + '</span></button>' +
      '<button class="' + (tab === 'devices' ? 'on' : '') + '" onclick="Views.assets.switchTab(\'devices\')">设备台账<span class="n">' + devN + '</span></button></div>';
  }

  function roomToolbar() {
    return '<div class="toolbar" style="padding:14px 16px;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:8px">' +
      '<input class="inp sm" style="width:200px" id="a-kw" placeholder="搜索教室编号 / 楼栋" value="' + S.esc(rf.kw) + '" onkeydown="if(event.key===\'Enter\')Views.assets.searchRooms()">' +
      '<select class="inp sm" id="a-building"><option value="">全部楼栋</option>' + buildings().map(function (b) {
        return '<option' + (rf.building === b ? ' selected' : '') + '>' + S.esc(b) + '</option>';
      }).join('') + '</select>' +
      '<select class="inp sm" id="a-zone"><option value="">全部区域</option>' + (S.ROOM_ZONES || []).map(function (z) {
        return '<option value="' + S.esc(z) + '"' + (rf.zone === z ? ' selected' : '') + '>' + S.esc(z) + '</option>';
      }).join('') + '</select>' +
      '<select class="inp sm" id="a-level"><option value="">全部健康状态</option>' +
        Object.keys(LEVEL).map(function (k) {
          return '<option value="' + k + '"' + (rf.level === k ? ' selected' : '') + '>' + LEVEL[k].label + '</option>';
        }).join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" onclick="Views.assets.searchRooms()">' + U.icon('search', 14) + '查询</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.assets.resetRooms()">重置</button>' +
      '</div>';
  }

  function roomTable() {
    var list = S.roomProfiles().filter(function (p) {
      var r = p.room;
      if (rf.building && r.building !== rf.building) return false;
      if (rf.zone && (r.zone || '') !== rf.zone) return false;
      if (rf.level && p.level !== rf.level) return false;
      if (rf.kw) {
        var kw = rf.kw.toLowerCase();
        if ((String(r.no) + ' ' + (r.building || '')).toLowerCase().indexOf(kw) < 0) return false;
      }
      return true;
    });
    var pages = Math.max(1, Math.ceil(list.length / rp.size));
    if (rp.page > pages) rp.page = pages;
    var start = (rp.page - 1) * rp.size;
    var pageList = list.slice(start, start + rp.size);
    return '<div class="table-meta"><span>共 <b>' + list.length + '</b> 间教室' + (list.length ? '，本页第 ' + (start + 1) + '–' + (start + pageList.length) + ' 条' : '') + '</span><span>按健康分从低到高排列，优先处理告警教室</span></div>' +
      '<div class="desk-table"><table class="data-table"><thead><tr>' +
      '<th style="width:80px">楼栋</th><th style="width:80px">教室区域</th><th style="width:90px">教室</th><th style="width:110px">类型</th><th style="width:64px">座位</th>' +
      '<th style="width:70px">设备</th><th style="width:96px">近90天工单</th><th style="width:150px">健康分</th>' +
      '<th style="width:100px">最近记录</th><th style="width:64px">操作</th></tr></thead><tbody>' +
      (pageList.length ? pageList.map(roomRow).join('') :
        '<tr><td colspan="10"><div class="empty">没有符合条件的教室</div></td></tr>') +
      '</tbody></table></div>' +
      (pages > 1 ? '<div class="pager"><button class="btn btn-ghost btn-sm" ' + (rp.page <= 1 ? 'disabled' : '') + ' onclick="Views.assets.page(' + (rp.page - 1) + ')">上一页</button>' +
        '<span>第 ' + rp.page + ' / ' + pages + ' 页</span>' +
        '<button class="btn btn-ghost btn-sm" ' + (rp.page >= pages ? 'disabled' : '') + ' onclick="Views.assets.page(' + (rp.page + 1) + ')">下一页</button></div>' : '');
  }

  function roomRow(p) {
    var r = p.room, lv = LEVEL[p.level];
    return '<tr onclick="Views.assets.openRoom(\'' + S.esc(r.no) + '\')" style="cursor:pointer">' +
      '<td>' + S.esc(r.building || '—') + '</td>' +
      '<td>' + S.esc(r.zone || '—') + '</td>' +
      '<td><b>' + S.esc(r.no) + '</b></td>' +
      '<td>' + S.esc(r.roomType || '多媒体教室') + '</td>' +
      '<td>' + (r.capacity || '—') + '</td>' +
      '<td>' + (p.devices || 0) + ' 台</td>' +
      '<td>' + p.recent.length + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px">' +
        '<span style="display:inline-block;flex:1;height:8px;background:#f2f4f7;border-radius:4px;overflow:hidden">' +
        '<i style="display:block;height:100%;width:' + p.score + '%;background:' + lv.color + '"></i></span>' +
        '<b style="color:' + lv.color + ';font-size:12px;width:34px">' + p.score + '</b>' +
        '<span class="tag" style="background:' + lv.bg + ';color:' + lv.color + '">' + lv.label + '</span></div></td>' +
      '<td>' + (p.lastAt ? S.fmtDT(p.lastAt) : '—') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Views.assets.openRoom(\'' + S.esc(r.no) + '\')">档案</button></td>' +
      '</tr>';
  }

  function deviceToolbar() {
    var admin = S.isAdmin();
    return '<div class="toolbar" style="padding:14px 16px;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:8px">' +
      '<input class="inp sm" style="width:190px" id="d-kw" placeholder="搜索名称 / 型号 / SN / 教室" value="' + S.esc(df.kw) + '" onkeydown="if(event.key===\'Enter\')Views.assets.searchDevices()">' +
      '<select class="inp sm" id="d-category"><option value="">全部类别</option>' + S.DEVICE_CATEGORIES.map(function (c) {
        return '<option' + (df.category === c ? ' selected' : '') + '>' + S.esc(c) + '</option>';
      }).join('') + '</select>' +
      '<select class="inp sm" id="d-status"><option value="">全部状态</option>' + S.DEVICE_STATUS.map(function (s) {
        return '<option' + (df.status === s ? ' selected' : '') + '>' + S.esc(s) + '</option>';
      }).join('') + '</select>' +
      '<select class="inp sm" id="d-building"><option value="">全部楼栋</option>' + buildings().map(function (b) {
        return '<option' + (df.building === b ? ' selected' : '') + '>' + S.esc(b) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" onclick="Views.assets.searchDevices()">' + U.icon('search', 14) + '查询</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.assets.resetDevices()">重置</button>' +
      (admin ? '<span style="margin-left:auto;display:inline-flex;gap:8px">' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.assets.deviceTemplate()">' + U.icon('download', 14) + '下载模板</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.assets.pickDeviceFile()">' + U.icon('upload', 14) + '批量导入</button>' +
        '<input type="file" id="device-import-file" accept=".xlsx" style="display:none" onchange="Views.assets.deviceFile(event)">' +
        '<button class="btn btn-primary btn-sm" onclick="Views.assets.editDevice(\'\')">' + U.icon('plus', 14) + '新增设备</button></span>' : '') +
      '</div>';
  }

  function filteredDevices() {
    return S.devices().filter(function (d) {
      if (df.category && d.category !== df.category) return false;
      if (df.status && d.status !== df.status) return false;
      if (df.building && d.building !== df.building) return false;
      if (df.kw) {
        var kw = df.kw.toLowerCase();
        if ((String(d.name) + ' ' + String(d.brand) + ' ' + String(d.sn) + ' ' + String(d.room)).toLowerCase().indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function deviceTable() {
    var list = filteredDevices();
    var admin = S.isAdmin();
    var pages = Math.max(1, Math.ceil(list.length / dp.size));
    if (dp.page > pages) dp.page = pages;
    var start = (dp.page - 1) * dp.size;
    var pageList = list.slice(start, start + dp.size);
    // 设备名称列宽随当前页数据动态调整（含 SN 行；中文按 2 个宽度单位计）
    function dispLen(s) {
      var n = 0;
      String(s || '').replace(/[^\x00-\xff]/g, '##').split('').forEach(function () { n++; });
      return n;
    }
    var maxLen = 8;
    pageList.forEach(function (d) {
      maxLen = Math.max(maxLen, dispLen(d.name), d.sn ? dispLen('SN ' + d.sn) : 0);
    });
    var nameW = Math.max(120, Math.min(340, maxLen * 7 + 24));
    return '<div class="table-meta"><span>共 <b>' + list.length + '</b> 台设备' + (list.length ? '，本页第 ' + (start + 1) + '–' + (start + pageList.length) + ' 条' : '') + '</span><span>保修状态按到期日自动判断</span></div>' +
      '<div class="desk-table"><table class="data-table" style="table-layout:fixed;min-width:' + (nameW + (admin ? 842 : 760)) + 'px"><thead><tr>' +
      '<th style="width:' + nameW + 'px">设备名称</th><th style="width:76px">类别</th><th style="width:150px">品牌 / 型号</th><th style="width:80px">教室</th>' +
      '<th style="width:96px">启用日期</th><th style="width:110px">保修</th><th style="width:76px">累计维修</th><th style="width:72px">状态</th>' +
      '<th style="width:' + (admin ? 132 : 50) + 'px">操作</th></tr></thead><tbody>' +
      (pageList.length ? pageList.map(function (d) {
        var w = S.warrantyInfo(d);
        var wColor = w.level === 'expired' ? '#f5222d' : w.level === 'soon' ? '#fa8c16' : '#8f959e';
        return '<tr>' +
          '<td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + S.esc(d.name) + (d.sn ? ' · SN ' + S.esc(d.sn) : '') + '"><b>' + S.esc(d.name) + '</b>' + (d.sn ? '<div style="font-size:11px;color:#b9bec7;overflow:hidden;text-overflow:ellipsis">SN ' + S.esc(d.sn) + '</div>' : '') + '</td>' +
          '<td>' + S.esc(d.category) + '</td>' +
          '<td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + S.esc(d.brand || '') + '">' + S.esc(d.brand || '—') + '</td>' +
          '<td>' + S.esc(d.room || '—') + '</td>' +
          '<td>' + S.esc(d.boughtAt || '—') + '</td>' +
          '<td style="color:' + wColor + '">' + S.esc(w.label) + '</td>' +
          '<td>' + (d.repairCount || 0) + ' 次</td>' +
          '<td><span class="tag" style="background:' + (DEV_STATUS_COLOR[d.status] || '#8f959e') + '20;color:' + (DEV_STATUS_COLOR[d.status] || '#8f959e') + '">' + S.esc(d.status) + '</span></td>' +
          '<td>' + (admin
            ? '<span class="row-acts">' +
              '<button class="act edit" title="编辑设备" onclick="Views.assets.editDevice(\'' + S.esc(d.id) + '\')">' + U.icon('edit', 13) + '编辑</button>' +
              '<button class="act del" title="删除设备" onclick="Views.assets.delDevice(\'' + S.esc(d.id) + '\')">' + U.icon('trash', 13) + '删除</button></span>'
            : '—') + '</td>' +
          '</tr>';
      }).join('') :
        '<tr><td colspan="9"><div class="empty">暂无设备台账' + (admin ? '，点击右上角「初始化设备台账」按教室批量生成，或「新增设备」逐条录入' : '') + '</div></td></tr>') +
      '</tbody></table></div>' +
      (pages > 1 ? '<div class="pager"><button class="btn btn-ghost btn-sm" ' + (dp.page <= 1 ? 'disabled' : '') + ' onclick="Views.assets.pageDevice(' + (dp.page - 1) + ')">上一页</button>' +
        '<span>第 ' + dp.page + ' / ' + pages + ' 页</span>' +
        '<button class="btn btn-ghost btn-sm" ' + (dp.page >= pages ? 'disabled' : '') + ' onclick="Views.assets.pageDevice(' + (dp.page + 1) + ')">下一页</button></div>' : '');
  }

  function render() {
    return head() + kpis() + '<div class="card">' + tabs() +
      (tab === 'rooms' ? roomToolbar() + roomTable() : deviceToolbar() + deviceTable()) +
      '</div>';
  }

  // ---------- 交互 ----------
  function readFilters() {
    if (tab === 'rooms') {
      rf.kw = (document.getElementById('a-kw') || {}).value || '';
      rf.building = (document.getElementById('a-building') || {}).value || '';
      rf.zone = (document.getElementById('a-zone') || {}).value || '';
      rf.level = (document.getElementById('a-level') || {}).value || '';
    } else {
      df.kw = (document.getElementById('d-kw') || {}).value || '';
      df.category = (document.getElementById('d-category') || {}).value || '';
      df.status = (document.getElementById('d-status') || {}).value || '';
      df.building = (document.getElementById('d-building') || {}).value || '';
    }
  }

  function switchTab(next) {
    readFilters();
    tab = next;
    rp.page = 1;
    dp.page = 1;
    window.App.render();
  }
  function searchRooms() { readFilters(); rp.page = 1; window.App.render(); }
  function resetRooms() { rf = { kw: '', building: '', zone: '', level: '' }; rp.page = 1; window.App.render(); }
  function page(p) { rp.page = p; window.App.render(); }
  function searchDevices() { readFilters(); dp.page = 1; window.App.render(); }
  function resetDevices() { df = { kw: '', category: '', status: '', building: '' }; dp.page = 1; window.App.render(); }
  function pageDevice(p) { dp.page = p; window.App.render(); }

  function initDevices() {
    U.confirm('初始化设备台账', '将按「基础配置 → 教室清单」中的启用教室，为每间教室生成中控主机、投影仪、讲台电脑、无线话筒、功放共 5 台标准设备；已存在的同名设备会自动跳过。',
      function () {
        var r = S.initDevices();
        U.toast('已新增 ' + r.added + ' 台设备' + (r.skipped ? '，跳过 ' + r.skipped + ' 台已存在设备' : ''), 'ok');
        window.App.render();
      }, '开始生成');
  }

  function editDevice(id) {
    if (!S.isAdmin()) { U.toast('仅管理员可维护设备台账', 'err'); return; }
    var d = id ? S.devices().filter(function (x) { return x.id === id; })[0] : null;
    var rooms = S.getState().settings.rooms.filter(function (r) { return r.active !== false; });
    var val = d || { name: '', category: '中控', brand: '', sn: '', room: '', boughtAt: '', warrantyTo: '', repairCount: 0, status: '在用', note: '' };
    var body = '<div class="form">' +
      '<div class="form-row"><label>设备名称 <span class="req">*</span></label><input class="inp" id="dv-name" value="' + S.esc(val.name) + '" placeholder="如 投影仪"></div>' +
      '<div class="form-row"><label>类别</label><select class="inp" id="dv-category">' + S.DEVICE_CATEGORIES.map(function (c) {
        return '<option' + (val.category === c ? ' selected' : '') + '>' + S.esc(c) + '</option>';
      }).join('') + '</select>' +
      '<label>状态</label><select class="inp" id="dv-status">' + S.DEVICE_STATUS.map(function (s) {
        return '<option' + (val.status === s ? ' selected' : '') + '>' + S.esc(s) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-row"><label>品牌 / 型号</label><input class="inp" id="dv-brand" value="' + S.esc(val.brand) + '" placeholder="如 爱普生 CB-X06"></div>' +
      '<div class="form-row"><label>序列号 SN</label><input class="inp" id="dv-sn" value="' + S.esc(val.sn) + '"></div>' +
      '<div class="form-row full"><label>所在教室 <span class="req">*</span></label><select class="inp" id="dv-room"><option value="">请选择教室</option>' +
        rooms.map(function (r) {
          return '<option value="' + S.esc(r.no) + '"' + (val.room === r.no ? ' selected' : '') + '>' + S.esc(r.no) + ' · ' + S.esc(r.building || '') + '</option>';
        }).join('') + '</select></div>' +
      '<div class="form-row"><label>启用日期</label><input class="inp" type="date" id="dv-bought" value="' + S.esc(val.boughtAt) + '">' +
      '<label>保修至</label><input class="inp" type="date" id="dv-warranty" value="' + S.esc(val.warrantyTo) + '"></div>' +
      '<div class="form-row"><label>累计维修</label><input class="inp" type="number" min="0" id="dv-repair" value="' + (val.repairCount || 0) + '"><span class="unit">次</span></div>' +
      '<div class="form-row full"><label>备注</label><textarea class="inp" rows="2" id="dv-note" placeholder="安装位置、更换记录等">' + S.esc(val.note) + '</textarea></div>' +
      '</div>';
    U.modal(d ? '编辑设备' : '新增设备', body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.assets.saveDevice(\'' + S.esc(id || '') + '\')">保存</button>', { wide: true });
  }

  function saveDevice(id) {
    var input = {
      name: (document.getElementById('dv-name') || {}).value || '',
      category: (document.getElementById('dv-category') || {}).value || '其他',
      brand: (document.getElementById('dv-brand') || {}).value || '',
      sn: (document.getElementById('dv-sn') || {}).value || '',
      room: (document.getElementById('dv-room') || {}).value || '',
      boughtAt: (document.getElementById('dv-bought') || {}).value || '',
      warrantyTo: (document.getElementById('dv-warranty') || {}).value || '',
      repairCount: (document.getElementById('dv-repair') || {}).value || 0,
      status: (document.getElementById('dv-status') || {}).value || '在用',
      note: (document.getElementById('dv-note') || {}).value || ''
    };
    try {
      if (id) S.updateDevice(id, input); else S.addDevice(input);
      U.closeModal();
      U.toast(id ? '设备已更新' : '设备已新增', 'ok');
      window.App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function delDevice(id) {
    if (!S.isAdmin()) { U.toast('仅管理员可维护设备台账', 'err'); return; }
    var d = S.devices().filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    U.confirm('删除设备', '确认删除「' + S.esc(d.name) + '（' + S.esc(d.room) + '）」？删除后不可恢复。',
      function () {
        S.removeDevice(id);
        U.toast('设备已删除');
        window.App.render();
      }, '删除', true);
  }

  // 教室档案抽屉（对齐 prototype-assets-v1.html「教室 360°」）
  function openRoom(no) {
    var p = S.roomProfiles().filter(function (x) { return x.room.no === no; })[0];
    if (!p) { U.toast('教室不存在', 'err'); return; }
    var r = p.room, lv = LEVEL[p.level];
    var devs = S.devices().filter(function (d) { return d.room === no; });
    var bld = r.building || S.buildingOf(no);
    function dot(c) { return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';margin-right:6px"></span>'; }

    // 顶部信息格 + 报修二维码占位
    var stHtml = r.active === false ? dot('#8f959e') + '停用'
      : (p.open.length ? dot('#fa8c16') + '有 ' + p.open.length + ' 单处理中' : dot('#52c41a') + '正常');
    var body = '<div style="display:flex;gap:16px;align-items:stretch">' +
      '<div class="info-grid" style="flex:1">' +
        '<div class="info-item"><div class="k">类型 / 座位</div><div class="v">' + S.esc(r.roomType || '多媒体教室') + ' · ' + (r.capacity || '—') + ' 座</div></div>' +
        '<div class="info-item"><div class="k">当前状态</div><div class="v">' + stHtml + '</div></div>' +
        '<div class="info-item"><div class="k">近 90 天工单</div><div class="v">' + p.recent.length + ' 单 · 未闭环 ' + p.open.length + '</div></div>' +
        '<div class="info-item"><div class="k">设备健康分</div><div class="v"><span class="tag" style="background:' + lv.bg + ';color:' + lv.color + ';font-weight:600;font-size:12.5px;padding:2px 10px">' + p.score + '</span> ' + lv.label +
          '<div style="font-size:10px;color:#b9bec7;margin-top:3px">100 − 近90天工单×6 − 未闭环×10，最低 20</div></div></div>' +
        '<div class="info-item"><div class="k">最近记录</div><div class="v">' + (p.lastAt ? S.fmtFull(p.lastAt) : '—') + '</div></div>' +
      '</div>' +
      '<div class="qr-box" onclick="UI.toast(\'报修登记入口二维码由系统生成，打印塑封后张贴于讲台\')">' +
        U.icon('grid', 30) + '<span>报修登记入口<br>（张贴于讲台）</span></div>' +
    '</div>';

    // 设备清单
    body += '<div class="sec">' + U.icon('server', 15) + '设备清单（' + devs.length + ' 台）</div>' +
      (devs.length ? devs.map(function (d) {
        var c = DEV_STATUS_COLOR[d.status] || '#8f959e';
        return '<div class="dev-row">' +
          '<span class="ic">' + S.esc((d.category || '其').slice(0, 1)) + '</span>' +
          '<div style="flex:1;min-width:0"><div class="nm">' + S.esc(d.name) + '</div>' +
          '<div class="sp">' + S.esc(d.brand || '—') + (d.sn ? ' · SN ' + S.esc(d.sn) : '') + '</div></div>' +
          '<span class="tag" style="background:' + c + '20;color:' + c + '">' + S.esc(d.status) + '</span></div>';
      }).join('') : '<div class="empty-mini">该教室尚未登记设备，可在「设备台账」中初始化或新增</div>');

    // 近 90 天故障分布（按月份）
    var mkeys = [], mstat = {};
    var nowD = new Date();
    for (var i = 3; i >= 0; i--) {
      var dd = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      var k = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2);
      mkeys.push({ key: k, label: (dd.getMonth() + 1) + '月' });
      mstat[k] = 0;
    }
    p.recent.forEach(function (t) {
      var k = String(t.createdAt || '').slice(0, 7);
      if (k in mstat) mstat[k]++;
    });
    var mx = Math.max.apply(null, mkeys.map(function (m) { return mstat[m.key]; }));
    body += '<div class="sec">' + U.icon('chart', 15) + '近 90 天故障分布</div>' +
      (mx ? '<div class="bars">' + mkeys.map(function (m, idx) {
        return '<div class="bar-row"><span class="lb">' + m.label + '</span>' +
          '<span class="track"><i style="width:' + Math.round(mstat[m.key] / mx * 100) + '%' + (idx === 3 ? ';background:#ff7875' : '') + '"></i></span>' +
          '<span class="n">' + mstat[m.key] + '</span></div>';
      }).join('') + '</div>' : '<div class="empty-mini">近 90 天无故障记录</div>');

    // 最近工单 / 日志
    body += '<div class="sec">' + U.icon('list', 15) + '最近工单 / 日志</div>' +
      (p.recent.length ? '<div class="mini-list">' + p.recent.slice(0, 8).map(function (t) {
        var stt = S.STATUS[t.status] || S.STATUS.closed;
        return '<div class="row" onclick="UI.closeDrawer();Views.tickets.openDetail(\'' + S.esc(t.no) + '\')" style="cursor:pointer">' +
          '<span class="tag" style="background:' + stt.color + '22;color:' + stt.color + '">' + S.esc(t.no) + '</span>' +
          '<span class="tt">' + S.esc(t.summary || t.desc || '') + '</span>' +
          '<span class="tm">' + S.fmtDT(t.createdAt) + ' · ' + stt.label + '</span></div>';
      }).join('') + '</div>' : '<div class="empty-mini">暂无记录</div>');

    U.openDrawer(S.esc(bld + ' ' + no) + ' · 教室 360°',
      '<span class="tag" style="background:' + lv.bg + ';color:' + lv.color + '">' + lv.label + '</span>', body,
      '<button class="btn btn-ghost" onclick="UI.closeDrawer();Views.tickets.filterRoom(\'' + S.esc(no) + '\')">' + U.icon('list', 15) + '查看该教室日志</button>');
  }

  function exportDevices() {
    var list = filteredDevices();
    if (!list.length) { U.toast('暂无设备台账可导出', 'err'); return; }
    var rows = [['设备名称', '类别', '品牌型号', '序列号SN', '教室编号', '楼栋', '启用日期', '保修至', '累计维修', '状态', '备注']];
    list.forEach(function (d) {
      rows.push([d.name, d.category, d.brand, d.sn, d.room, d.building, d.boughtAt, d.warrantyTo, d.repairCount, d.status, d.note]);
    });
    U.downloadXLSX('设备台账_' + U.todayStr() + '.xlsx', [{ name: '设备台账', rows: rows, widths: [16, 8, 18, 14, 10, 8, 12, 12, 10, 8, 24] }]);
    U.toast('已导出 ' + (rows.length - 1) + ' 台设备（按当前筛选）', 'ok');
  }

  // ---------- 批量导入 ----------
  function readXlsx(file, cb) {
    if (!U.hasXLSX()) {
      U.ensureXLSX().then(function () { readXlsx(file, cb); }, function () {});
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) { U.toast('仅支持 .xlsx 文件', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        cb(window.XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true }));
      } catch (err) {
        console.error(err);
        U.toast('文件解析失败：' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function deviceTemplate() {
    if (!S.isAdmin()) { U.toast('仅管理员可维护设备台账', 'err'); return; }
    var wb = S.buildDevicesWorkbook(true);
    if (U.downloadWorkbook('设备台账导入模板.xlsx', wb)) {
      U.toast('模板已下载：按表头填写后批量导入，相同记录（SN 或 教室+名称）将更新原记录', 'ok');
    }
  }

  function pickDeviceFile() {
    if (!S.isAdmin()) { U.toast('仅管理员可维护设备台账', 'err'); return; }
    var el = document.getElementById('device-import-file');
    if (el) el.click();
  }

  function deviceFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    readXlsx(file, function (wb) {
      var p = S.previewDeviceImport(wb);
      if (!p.items.length) { U.toast('未识别到设备数据，请使用「下载模板」中的表头（需包含 设备名称、教室编号）', 'err'); return; }
      var msg = '共解析 <b>' + p.total + '</b> 行：新增 <b>' + p.added + '</b> 台，更新 <b>' + p.updated + '</b> 台' +
        (p.skipped ? '，跳过 ' + p.skipped + ' 行（缺少设备名称或教室编号）' : '') +
        '。<br>判重规则：序列号 SN 相同，或「教室编号 + 设备名称」相同的记录将以本次上传内容为准。';
      U.confirm('批量导入设备台账', msg, function () {
        var r = S.commitDeviceImport(p.items);
        U.toast('导入完成：新增 ' + r.added + ' 台，更新 ' + r.updated + ' 台', 'ok');
        window.App.render();
      }, '确认导入');
    });
  }

  window.Views = window.Views || {};
  window.Views.assets = {
    render: render, switchTab: switchTab,
    searchRooms: searchRooms, resetRooms: resetRooms,
    searchDevices: searchDevices, resetDevices: resetDevices,
    initDevices: initDevices, editDevice: editDevice, saveDevice: saveDevice, delDevice: delDevice,
    openRoom: openRoom, exportDevices: exportDevices, page: page, pageDevice: pageDevice,
    deviceTemplate: deviceTemplate, pickDeviceFile: pickDeviceFile, deviceFile: deviceFile
  };
})();
