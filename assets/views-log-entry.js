/* 单条日志录入（参照 prototype-log-entry-v1，统一表单 + 快捷模板 + 校验清单） */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;

  var TEMPLATES = [
    { name: '中控开机故障', fault: '中控/开机故障', desc: '中控/讲台电脑开机无响应，投影无信号', action: '手动开启中控主机与投影，画面恢复正常', devices: ['中控', '投影'], min: 15 },
    { name: '投影无信号', fault: '投影仪问题', desc: '投影仪显示无信号输入', action: '重新插拔 HDMI 线并切换信号源，画面恢复', devices: ['投影'], min: 10 },
    { name: '无线麦无声', fault: '音频/麦克风', desc: '无线麦克风无声，无法扩音', action: '更换电池并重新对频，扩音恢复正常', devices: ['话筒'], min: 10 },
    { name: '课件打不开', fault: '网络/软件', desc: '课件无法播放，提示格式不支持', action: '转换课件格式后播放正常', devices: ['电脑'], min: 20 },
    { name: '网络认证失败', fault: '网络/软件', desc: '教室网络认证失败，无法上网', action: '重新认证并检查网线，网络恢复', devices: ['网络'], min: 15 },
    { name: '展台不对焦', fault: '线材/其他', desc: '实物展台画面模糊，无法对焦', action: '调整展台焦距与灯光，画面清晰', devices: ['展台'], min: 10 }
  ];
  var DEVICES = ['中控', '投影', '电脑', '话筒', '功放', '展台', '网络', '幕布', '录播'];

  var draft = {
    type: 'repair', room: '', building: '', date: S.fmtDate(S.nowLocal()),
    time: S.fmtDT(S.nowLocal()).slice(6, 11), period: '', duration: 20,
    fault: '中控/开机故障', summary: '', detail: '', action: '', result: 'fixed',
    devices: [], parts: '', helpers: '', remark: '', linkedNo: '', urgency: '常规'
  };

  function resetDraft() {
    draft = {
      type: 'repair', room: '', building: '', date: S.fmtDate(S.nowLocal()),
      time: S.fmtDT(S.nowLocal()).slice(6, 11), period: S.periodOf(S.nowLocal()), duration: 20,
      fault: '中控/开机故障', summary: '', detail: '', action: '', result: 'fixed',
      devices: [], parts: '', helpers: '', remark: '', linkedNo: '', urgency: '常规'
    };
  }
  if (!draft.period) draft.period = S.periodOf(S.nowLocal());

  function render() {
    var st = S.getState();
    var pending = S.pendingRepairs();
    var engineers = st.settings.engineers.filter(function (e) { return e.active !== false; });
    var builder = buildings();

    var left = '<div class="entry-main">' +
      '<div class="card entry-card">' +
        '<div class="card-head"><h3><span class="step">1</span>日志类型</h3><span class="more">选择后表单字段会自动匹配</span></div>' +
        '<div class="type-row" id="type-row">' + Object.keys(S.LOG_TYPES).map(function (k) {
          var t = S.LOG_TYPES[k];
          return '<button type="button" class="type-card' + (draft.type === k ? ' on' : '') + '" data-type="' + k + '" onclick="Views.logEntry.setType(\'' + k + '\')">' +
            '<i style="background:' + t.color + '18;color:' + t.color + '">' + U.icon(k === 'repair' ? 'ticket' : k === 'patrol' ? 'check' : k === 'routine' ? 'zap' : 'file', 18) + '</i>' +
            '<b>' + t.label + '</b><span>' + t.desc + '</span></button>';
        }).join('') + '</div>' +
        (pending.length ? '<div class="form-row full" style="margin-top:14px"><label>关联待填报报修单</label><select id="e-linked" class="inp" onchange="Views.logEntry.linkRepair(this.value)">' +
          '<option value="">不关联</option>' + pending.map(function (t) {
            return '<option value="' + S.esc(t.no) + '"' + (draft.linkedNo === t.no ? ' selected' : '') + '>' + S.esc(t.no) + ' · ' + S.esc(t.room || '—') + ' · ' + S.esc(t.desc.slice(0, 18)) + '</option>';
          }).join('') + '</select></div>' : '') +
      '</div>' +

      '<div class="card entry-card">' +
        '<div class="card-head"><h3><span class="step">2</span>基本信息</h3></div>' +
        '<div class="form">' +
          '<div class="form-row"><label>日期</label>' + U.datepicker({ id: 'e-date', value: draft.date, max: S.fmtDate(S.nowLocal()), onPick: 'Views.logEntry.setDate(__V__)' }) +
          '<label>时间</label><input id="e-time" class="inp" type="time" value="' + draft.time + '" onchange="Views.logEntry.read()">' +
          '<label>时段</label><select id="e-period" class="inp" onchange="Views.logEntry.read()">' +
            S.PERIODS.map(function (p) { return '<option value="' + p.key + '"' + (draft.period === p.key ? ' selected' : '') + '>' + p.name + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-row"><label>楼栋</label><select id="e-building" class="inp" onchange="Views.logEntry.filterRooms()">' +
            '<option value="">全部楼栋</option>' + builder.map(function (b) { return '<option value="' + S.esc(b) + '"' + (draft.building === b ? ' selected' : '') + '>' + S.esc(b) + '</option>'; }).join('') + '</select>' +
          '<label>教室编号</label><select id="e-room" class="inp" onchange="Views.logEntry.read()"><option value="">不关联教室（其他事项）</option></select></div>' +
          '<div class="form-row"><label>处理时长</label><div class="inline"><input id="e-duration" class="inp" type="number" min="0" value="' + draft.duration + '" style="width:90px"><span class="unit">分钟</span></div>' +
          '<label>紧急度</label><select id="e-urgency" class="inp">' +
            Object.keys(S.URGENCY).map(function (u) { return '<option value="' + u + '"' + (draft.urgency === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
      '</div>' +

      '<div class="card entry-card">' +
        '<div class="card-head"><h3><span class="step">3</span>故障与处理</h3></div>' +
        '<div class="form">' +
          '<div class="form-row"><label>故障类型 <span class="req">*</span></label><select id="e-fault" class="inp" onchange="Views.logEntry.read()">' +
            st.settings.faultTypes.map(function (f) { return '<option value="' + S.esc(f.name) + '"' + (draft.fault === f.name ? ' selected' : '') + '>' + S.esc(f.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-row full"><label>工作内容 / 现象摘要 <span class="req">*</span></label><input id="e-summary" class="inp" placeholder="一句话描述：教室 + 设备 + 现象" value="' + S.esc(draft.summary) + '"></div>' +
          '<div class="form-row full"><label>详细过程</label><textarea id="e-detail" class="inp" rows="3" placeholder="排查步骤、测试结果、现场沟通等">' + S.esc(draft.detail) + '</textarea></div>' +
          '<div class="form-row full"><label>处理结果 <span class="req">*</span></label><textarea id="e-action" class="inp" rows="2" placeholder="最终处置与恢复情况">' + S.esc(draft.action) + '</textarea>' +
            '<div class="result-row">' +
              '<label class="result-opt' + (draft.result === 'fixed' ? ' on' : '') + '"><input type="radio" name="e-result" value="fixed"' + (draft.result === 'fixed' ? ' checked' : '') + ' onchange="Views.logEntry.read()">已修复</label>' +
              '<label class="result-opt' + (draft.result === 'follow' ? ' on' : '') + '"><input type="radio" name="e-result" value="follow"' + (draft.result === 'follow' ? ' checked' : '') + ' onchange="Views.logEntry.read()">待跟进</label>' +
              '<label class="result-opt' + (draft.result === 'unfixed' ? ' on' : '') + '"><input type="radio" name="e-result" value="unfixed"' + (draft.result === 'unfixed' ? ' checked' : '') + ' onchange="Views.logEntry.read()">未解决</label>' +
            '</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="card entry-card">' +
        '<div class="card-head"><h3><span class="step">4</span>设备与耗材</h3></div>' +
        '<div class="form">' +
          '<div class="form-row full"><label>涉及设备</label><div class="chip-row" id="dev-row">' +
            DEVICES.map(function (d) { return '<button type="button" class="chip' + (draft.devices.indexOf(d) >= 0 ? ' on' : '') + '" data-d="' + d + '" onclick="Views.logEntry.toggleDevice(this)">' + d + '</button>'; }).join('') + '</div></div>' +
          '<div class="form-row"><label>更换耗材</label><input id="e-parts" class="inp" placeholder="如：电池 2 节 / HDMI 线 1 根" value="' + S.esc(draft.parts) + '">' +
          '<label>协办人</label><select id="e-helpers" class="inp"><option value="">无</option>' + engineers.map(function (e) {
            return '<option value="' + S.esc(e.name) + '"' + (draft.helpers === e.name ? ' selected' : '') + '>' + S.esc(e.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="form-row full"><label>备注</label><textarea id="e-remark" class="inp" rows="2" placeholder="未解决原因、后续计划、教师反馈等">' + S.esc(draft.remark) + '</textarea></div>' +
        '</div>' +
      '</div>' +

      '<div class="form-actions"><button class="btn btn-ghost" onclick="Views.logEntry.reset()">重置</button>' +
        '<button class="btn btn-primary" onclick="Views.logEntry.save()">' + U.icon('check') + '提交日志</button>' +
        '<span class="hint">提交后可在「每日工作日志」中查看与编辑</span></div>' +
      '</div>';

    var right = '<aside class="rail">' +
      '<div class="card rail-card"><div class="card-head"><h3>' + U.icon('zap') + '快捷模板</h3></div><div class="rail-body">' +
        TEMPLATES.map(function (t, i) {
          return '<button class="tpl-item" onclick="Views.logEntry.applyTemplate(' + i + ')"><b>' + S.esc(t.name) + '</b><span>' + S.esc(t.desc) + '</span></button>';
        }).join('') + '</div></div>' +
      '<div class="card rail-card"><div class="card-head"><h3>' + U.icon('check') + '填写校验</h3><span class="more">实时</span></div><div class="rail-body" id="check-list">' + checkList() + '</div></div>' +
      '<div class="card rail-card"><div class="card-head"><h3>' + U.icon('file') + '录入须知</h3></div><div class="rail-body tips">' +
        '<div>· 一条日志只记录一次现场处理</div><div>· 「已修复」写入已记录状态；「待跟进 / 未解决」保留待办</div><div>· 关联报修单后，提交会自动补全该单</div><div>· 工作内容与处理结果是必填项</div><div>· 教室可留空，用于培训、借用等非教室事项</div>' +
      '</div></div>' +
    '</aside>';

    return '<div class="page-head"><div><div class="page-title">单条日志录入</div>' +
      '<div class="page-sub">完整记录一次现场处理；可从待填报报修单关联，也可独立录入巡检、维护、培训等事项</div></div>' +
      '<div class="head-actions"><button class="btn btn-ghost btn-sm" onclick="App.go(\'daily-log\')">' + U.icon('calendar') + '返回每日日志</button></div></div>' +
      '<div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start">' + left + right + '</div>';
  }

  function buildings() {
    var set = {};
    S.getState().settings.rooms.forEach(function (r) { if (r.active !== false && r.building) set[r.building] = 1; });
    return Object.keys(set);
  }

  // 首次渲染 / 重置后填充教室下拉
  function afterRender() {
    fillRoomSelect();
    updateChecks();
  }
  function fillRoomSelect() {
    var sel = document.getElementById('e-room');
    if (!sel) return;
    var b = document.getElementById('e-building') ? document.getElementById('e-building').value : '';
    var rooms = S.getState().settings.rooms.filter(function (r) {
      return r.active !== false && (!b || r.building === b);
    }).sort(function (a, b2) { return String(a.no).localeCompare(String(b2.no)); });
    sel.innerHTML = '<option value="">不关联教室（其他事项）</option>' + rooms.map(function (r) {
      return '<option value="' + S.esc(r.no) + '"' + (draft.room === r.no ? ' selected' : '') + '>' + S.esc(r.no) + ' · ' + S.esc(r.building || '') + '</option>';
    }).join('');
  }
  function filterRooms() {
    var b = document.getElementById('e-building').value;
    draft.building = b;
    draft.room = '';
    fillRoomSelect();
    updateChecks();
  }

  // 把表单当前值回写 draft，避免切换类型/模板时丢失
  function read() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    if (!document.getElementById('e-summary')) return;
    var dEl = document.getElementById('dp-e-date');
    if (dEl && dEl.dataset.value) draft.date = dEl.dataset.value;
    draft.time = g('e-time'); draft.period = g('e-period');
    var today = S.fmtDate(S.nowLocal());
    if (draft.date > today) {
      draft.date = today;
      if (dEl) {
        dEl.dataset.value = today;
        var lv = document.getElementById('dp-val-e-date');
        if (lv) lv.textContent = today;
      }
      U.toast('不能选择今天之后的日期', 'err');
    }
    draft.building = g('e-building'); draft.room = g('e-room');
    draft.duration = parseInt(g('e-duration'), 10) || 0;
    draft.urgency = g('e-urgency'); draft.fault = g('e-fault');
    draft.summary = g('e-summary'); draft.detail = g('e-detail'); draft.action = g('e-action');
    draft.parts = g('e-parts'); draft.helpers = g('e-helpers'); draft.remark = g('e-remark');
    draft.linkedNo = g('e-linked');
    var r = document.querySelector('input[name="e-result"]:checked');
    if (r) draft.result = r.value;
    draft.devices = Array.prototype.map.call(document.querySelectorAll('#dev-row .chip.on'), function (x) { return x.dataset.d; });
    updateChecks();
  }

  function setType(k) {
    read();
    draft.type = k;
    if (k === 'patrol' || k === 'routine') draft.source = '主动维护';
    App.render();
    afterRender();
  }
  // 日期变更：日历控件直接回传新值，回写草稿并给出明确反馈（该页是表单，不整页刷新）
  function setDate(v) {
    if (!v) return;
    var today = S.fmtDate(S.nowLocal());
    if (v > today) { U.toast('不能选择今天之后的日期', 'err'); return; }
    if (v !== draft.date) {
      draft.date = v;
      U.toast('日期已设为 ' + v + (v === today ? '（今天）' : ''), 'ok');
    }
  }

  function toggleDevice(btn) {
    btn.classList.toggle('on');
    draft.devices = Array.prototype.map.call(document.querySelectorAll('#dev-row .chip.on'), function (x) { return x.dataset.d; });
    updateChecks();
  }
  function applyTemplate(i) {
    read();
    var t = TEMPLATES[i];
    draft.fault = t.fault; draft.summary = t.desc; draft.action = t.action;
    draft.devices = t.devices.slice(); draft.duration = t.min;
    App.render();
    U.toast('已套用模板：' + t.name, 'ok');
  }
  function linkRepair(no) {
    read();
    draft.linkedNo = no;
    var t = no ? S.findTicket(no) : null;
    if (t) {
      draft.room = t.room || ''; draft.building = t.building || '';
      draft.fault = t.fault || draft.fault;
      draft.summary = t.desc || draft.summary;
      draft.type = 'repair';
      draft.assignee = t.assignee || draft.assignee;
    }
    App.render();
    U.toast(no ? '已带入报修单信息' : '已取消关联', 'ok');
  }

  function checkList() {
    var items = [
      ['教室或事项', !!(draft.room || draft.type !== 'repair')],
      ['故障类型', !!draft.fault],
      ['工作内容 ≥ 6 字', (draft.summary || '').length >= 6],
      ['处理结果', (draft.action || '').length >= 4],
      ['处理时长', (draft.duration || 0) > 0],
      ['设备信息', draft.devices.length > 0]
    ];
    return items.map(function (x) {
      return '<div class="check-item ' + (x[1] ? 'ok' : '') + '"><i>' + (x[1] ? '✓' : '') + '</i>' + x[0] + '</div>';
    }).join('');
  }
  function updateChecks() {
    var el = document.getElementById('check-list');
    if (el) el.innerHTML = checkList();
  }

  function reset() {
    U.confirm('重置表单', '当前填写内容将清空，确定重置吗？', function () {
      resetDraft(); App.render(); U.toast('已重置', 'ok');
    }, '重置');
  }

  function defaultEngineer() {
    if (App.role().key === 'engineer') return App.role().name;
    var es = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    return es.length ? es[0].name : '';
  }

  function save() {
    read();
    if (!draft.summary || draft.summary.length < 4) { U.toast('请填写工作内容 / 现象摘要', 'err'); return; }
    if (!draft.action || draft.action.length < 2) { U.toast('请填写处理结果', 'err'); return; }
    var linked = draft.linkedNo ? S.findTicket(draft.linkedNo) : null;
    var period = draft.period || S.periodOf(draft.date + 'T' + (draft.time || '09:00'));
    var createdAt = draft.date + 'T' + (draft.time || '09:00') + ':00';
    var payload = {
      date: draft.date, period: period, createdAt: createdAt,
      room: draft.room, building: draft.building || S.buildingOf(draft.room),
      fault: draft.fault, summary: draft.summary, desc: draft.summary,
      detail: draft.detail, action: draft.action,
      durationMin: draft.duration || 15,
      assignee: draft.assignee || (linked && linked.assignee) || defaultEngineer(), helpers: draft.helpers,
      devices: draft.devices.join('、'), parts: draft.parts, remark: draft.remark,
      urgency: draft.urgency, solved: draft.result === 'fixed',
      status: draft.result === 'fixed' ? 'closed' : 'waiting', result: draft.result,
      logType: draft.type, source: draft.type === 'repair' ? '日志填报' : '主动维护',
      operator: App.operator(), callback: ''
    };
    try {
      if (draft.linkedNo) S.fillLog(draft.linkedNo, payload);
      else S.addLog(payload);
      U.toast(draft.result === 'fixed' ? '日志已提交' : '日志已保存并保留待跟进', 'ok');
      var savedDate = draft.date;
      resetDraft();
      if (window.Views.dailyLog && window.Views.dailyLog.setDate) window.Views.dailyLog.setDate(savedDate);
      App.go('daily-log');
    } catch (e) { U.toast(e.message, 'err'); }
  }

  window.Views = window.Views || {};
  window.Views['log-entry'] = {
    render: render, afterRender: afterRender, read: read, setType: setType, setDate: setDate,
    filterRooms: filterRooms, toggleDevice: toggleDevice, applyTemplate: applyTemplate,
    linkRepair: linkRepair, reset: reset, save: save
  };
  window.Views.logEntry = window.Views['log-entry'];
})();
