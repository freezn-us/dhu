/* 来电登记：客服登记报修 → 生成待填报报修日志 → 工程师在每日工作日志中补录 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;

  var fault = '';
  var urgency = '常规';
  var autoEngineer = true;
  var pickedKbIds = [];  // 来电登记时引用的知识库条目

  function nowInput() {
    var d = new Date();
    return S.dateKey(d) + 'T' + S.pad(d.getHours()) + ':' + S.pad(d.getMinutes());
  }

  // 当天当班工程师（排班日历为空时退回全部启用工程师）
  function dutyEngineers() {
    var all = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    var duty = S.getDuty(U.todayStr());
    if (!duty.length) return all;
    var list = all.filter(function (e) { return duty.indexOf(e.name) >= 0; });
    return list.length ? list : all;
  }

  // 协助人：头像徽章芯片，选项为当班人员 - 责任人，默认选中其余全部
  var HELPER_COLORS = ['#1677ff', '#722ed1', '#13c2c2', '#fa8c16', '#52c41a', '#eb2f96', '#2f54eb', '#d46b08'];
  function helperColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return HELPER_COLORS[h % HELPER_COLORS.length];
  }
  function helpersHtml(excludeName) {
    var duty = dutyEngineers();
    var rest = duty.filter(function (e) { return e.name !== excludeName; });
    var names = rest.map(function (e) { return e.name; });
    if (!names.length) return '<div class="helpers-empty">' + U.icon('users', 14) + ' 当天仅一名当班人员，无需协助人</div>';
    return '<div class="helpers-box" id="i-helpers">' +
      '<div class="helpers-head"><span class="helpers-title">' + U.icon('users', 15) + '协助人</span>' +
      '<span class="helpers-count" id="i-helpers-count">已选 ' + names.length + '/' + names.length + '</span>' +
      '<span class="helpers-acts"><button type="button" onclick="Views.intake.helpersAll(true)">全选</button><button type="button" onclick="Views.intake.helpersAll(false)">清空</button></span></div>' +
      '<div class="helpers-list">' +
      names.map(function (n) {
        var c = helperColor(n);
        return '<button type="button" class="helper-chip on" data-name="' + U.esc(n) + '" style="--hc:' + c + '" onclick="Views.intake.toggleHelper(this)">' +
          '<i class="h-ava">' + U.esc(n.slice(0, 1)) + '</i><span class="h-name">' + U.esc(n) + '</span><i class="h-check">' + U.icon('check', 11) + '</i></button>';
      }).join('') +
      '</div><div class="helpers-note">默认全选除责任人外的当班人员；协助人与责任人不能重复</div></div>';
  }
  function toggleHelper(btn) {
    btn.classList.toggle('on');
    updateHelperCount();
  }
  function helpersAll(on) {
    document.querySelectorAll('#i-helpers .helper-chip').forEach(function (el) { el.classList.toggle('on', on); });
    updateHelperCount();
  }
  function updateHelperCount() {
    var wrap = document.getElementById('i-helpers');
    var el = document.getElementById('i-helpers-count');
    if (!wrap || !el) return;
    var all = wrap.querySelectorAll('.helper-chip').length;
    var on = wrap.querySelectorAll('.helper-chip.on').length;
    el.textContent = '已选 ' + on + '/' + all;
  }

  function collectHelpers() {
    var wrap = document.getElementById('i-helpers');
    if (!wrap) return [];
    return Array.prototype.map.call(wrap.querySelectorAll('.helper-chip.on'), function (el) { return el.dataset.name; });
  }

  function stageOptions() {
    var st = S.getState();
    var list = st.settings.lessonStages || [];
    var def = st.settings.defaultStage || list[0] || '';
    return list.map(function (s) {
      return '<option value="' + U.esc(s) + '"' + (s === def ? ' selected' : '') + '>' + U.esc(s) + '</option>';
    }).join('');
  }

  function render() {
    var st = S.getState();
    var today = U.todayStr();
    var todayList = st.tickets.filter(function (t) { return S.fmtDate(t.createdAt) === today; });
    var engineers = dutyEngineers();
    var duty = S.getDuty(today);
    var week = S.weekInfo(today);
    var roomOpts = st.settings.rooms.map(function (r) {
      return '<option value="' + U.esc(r.no) + '">' + U.esc(r.building) + (r.capacity ? ' · ' + r.capacity + ' 座' : '') + '</option>';
    }).join('');

    return '' +
      '<div class="page-head"><div><div class="page-title">来电登记</div>' +
      '<div class="page-sub">客服接听报修电话（内线 ' + U.esc(st.settings.hotline) + '）→ 登记信息 → 生成待填报报修日志 → 工程师在「每日工作日志」中补录处理过程</div></div>' +
      '<div class="head-acts"><button class="btn btn-ghost" onclick="App.go(\'daily-log\')">' + U.icon('calendar') + '待填报日志</button></div></div>' +

      '<div class="grid grid-2" style="align-items:start">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('phone') + '来电报修登记</h3><span class="more" style="cursor:default;color:#8f959e">今日已登记 ' + todayList.length + ' 条</span></div>' +

      '<div class="row-2"><div class="field"><label>教室编号<span class="req">*</span></label>' +
      '<input class="input mono" id="i-room" list="room-list" maxlength="8" placeholder="如 2113" oninput="Views.intake.roomChanged()" style="letter-spacing:1px;font-size:14px">' +
      '<datalist id="room-list">' + roomOpts + '</datalist><div class="hint" id="i-room-hint">4 位数字，首位为教学楼号（1 一教 / 2 二教 / 4 四教）</div></div>' +
      '<div class="field"><label>来电人 / 联系方式</label><div class="row-2" style="gap:8px">' +
      '<input class="input" id="i-caller" placeholder="如 张老师"><input class="input" id="i-phone" placeholder="内线 8214"></div>' +
      '<div class="hint">只记录来电人称呼即可，不强制教师端操作</div></div></div>' +

      '<div class="field"><label>故障类型<span class="req">*</span></label><div class="pick-row" id="i-faults">' +
      st.settings.faultTypes.map(function (f) {
        return '<span class="pick' + (fault === f.name ? ' on' : '') + '" onclick="Views.intake.pickFault(\'' + U.esc(f.name) + '\')">' + U.esc(f.name) + '</span>';
      }).join('') + '</div>' +
      '<div id="i-kb-hint" style="margin-top:8px"></div></div>' +

      '<div class="field"><label>故障现象 / 来电原话<span class="req">*</span></label>' +
      '<textarea class="input" id="i-desc" rows="3" placeholder="按来电原话记录，如：投影有图像但没有声音，课件视频放不出来"></textarea>' +
      '<div class="hint">描述越具体，工程师越能判断要带的工具和备件</div></div>' +

      '<div class="field"><label>阶段</label><select class="input" id="i-stage">' + stageOptions() + '</select>' +
      '<div class="hint">用于报表按阶段统计，可在「基础配置 → 日志阶段」增删改名</div></div>' +

      '<div class="row-2"><div class="field"><label>设备类别</label><input class="input" id="i-device" list="device-list" placeholder="如 投影仪 / 中控 / 无线麦">' +
      '<datalist id="device-list"><option value="投影仪"><option value="中控/讲台电脑"><option value="扩音设备"><option value="网络/云桌面"><option value="线材/外设"><option value="实物展台"></datalist></div>' +
      '<div class="field"><label>来电时间<span class="req">*</span></label><input class="input" id="i-time" type="datetime-local" value="' + nowInput() + '"></div></div>' +

      '<div class="field"><label>紧急程度</label><div class="pick-row" id="i-urg">' +
      ['紧急', '常规', '低'].map(function (u) {
        return '<span class="pick urg' + (urgency === u ? ' on' : '') + '" data-v="' + u + '" onclick="Views.intake.pickUrg(\'' + u + '\')">' + u + (u === '紧急' ? '（课中）' : '') + '</span>';
      }).join('') + '</div><div class="hint">紧急：课中故障，优先处理；常规：按序处理；低：可排队</div></div>' +

      '<div class="field"><label>指派工程师</label><select class="input" id="i-eng" onchange="Views.intake.onAssigneeChange()"><option value="">暂不指派（仅生成待填报日志）</option>' +
      engineers.map(function (e) {
        return '<option value="' + U.esc(e.name) + '">' + U.esc(e.name) + ' · ' + U.esc((e.buildings || []).join(' / ')) + '</option>';
      }).join('') + '</select><div class="hint" id="i-eng-hint">仅显示当天当班人员；填教室后会按楼栋推荐并自动选中</div>' +
      '<div id="i-helpers-wrap">' + helpersHtml('') + '</div></div>' +
      '<button class="btn btn-ghost" style="flex:1" onclick="Views.intake.reset()">' + U.icon('refresh') + '清空</button>' +
      '<button class="btn btn-ghost" style="flex:1.2" onclick="Views.intake.submit(false)">仅生成日志</button>' +
      '<button class="btn btn-orange" style="flex:1.6" onclick="Views.intake.submit(true)">' + U.icon('phone') + '登记并指派</button>' +
      '</div>' +

      '<div>' +
      // 今日当班卡片
      '<div class="card duty-card"><div class="card-head"><div class="duty-head"><h4>' + U.icon('groups') + '今日当班</h4><span class="date-sub">' + U.esc(today) + ' ' + week + '</span></div></div>' +
      '<div class="duty-engineers">' + duty.map(function (n) { return '<span class="de">' + S.esc(n) + '</span>'; }).join('') + '</div>' +
      '<div class="duty-extra">' +
      '<div>维护服务（接线）：<b>' + U.esc(st.settings.org) + '</b> · 内线 <b style="color:#d46b08">' + U.esc(st.settings.hotline) + '</b></div>' +
      (engineers.length ? '<div>值班时段：上午 7:30-11:30 / 下午 13:00-17:00 / 晚上 18:00-21:30</div>' : '') +
      '<div style="color:#8f959e;font-size:11px">排班可在「基础配置 → 排班日历」中设置，工程师楼栋分工见「工程师名单」</div>' +
      '</div></div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>' + U.icon('clock') + '今日受理</h3></div>' +
      '<div class="stat-line"><span>来电 <b>' + todayList.length + '</b></span><span>待填报 <b>' + todayList.filter(function (t) { return t.status === 'new' || t.status === 'assigned'; }).length + '</b></span>' +
      '<span>处理中 <b>' + todayList.filter(function (t) { return ['processing', 'waiting'].indexOf(t.status) >= 0; }).length + '</b></span>' +
      '<span>已记录 <b>' + todayList.filter(function (t) { return t.status === 'closed'; }).length + '</b></span></div>' +
      '<div class="mini-list">' + (todayList.length ? todayList.map(function (t) {
        return '<div class="row" onclick="Views.dailyLog.detail(\'' + U.esc(t.no) + '\')">' +
          '<span class="tag ' + (S.STATUS[t.status] || {}).cls.replace('st-', 'urg-') + '" style="background:' + (S.STATUS[t.status] || {}).color + '22;color:' + (S.STATUS[t.status] || {}).color + '">' + (S.STATUS[t.status] || {}).label + '</span>' +
          '<span class="tt">' + U.esc(t.room) + ' · ' + U.esc(t.desc) + '</span><span class="tm">' + S.fmtDT(t.createdAt).slice(6) + '</span></div>';
      }).join('') : '<div style="padding:18px;text-align:center;color:#b9bec7;font-size:12px">今天还没有来电记录</div>') + '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('arrow') + '业务闭环</h3></div>' +
      '<div style="font-size:12px;color:#646a73;line-height:2.05">' +
      '<div>① 教师致电内线 <b>' + U.esc(st.settings.hotline) + '</b> 报修</div>' +
      '<div>② 客服登记并生成待填报报修日志 <span class="mono" style="color:#1677ff">WL-日期-序号</span></div>' +
      '<div>③ 可按楼栋指派工程师（也可先不指派）</div>' +
      '<div>④ 工程师在「每日工作日志」按上午 / 下午 / 晚上补录处理过程</div>' +
      '<div>⑤ 巡视打卡发现异常也可自动转报修日志</div>' +
      '<div>⑥ 报表自动统计日志量、故障类型、工作量与处理时长</div>' +
      '</div></div></div></div>';
  }

  function roomChanged() {
    var v = document.getElementById('i-room').value.trim();
    var hint = document.getElementById('i-room-hint');
    var b = S.buildingOf(v);
    if (!v) {
      hint.className = 'hint';
      hint.textContent = '4 位数字，首位为教学楼号（1 一教 / 2 二教 / 4 四教）';
    } else {
      var room = S.getState().settings.rooms.filter(function (r) { return r.no === v; })[0];
      if (room) {
        hint.className = 'hint';
        hint.innerHTML = '✓ ' + U.esc(room.building) + ' ' + U.esc(v) + (room.capacity ? ' · ' + room.capacity + ' 座' : '') + ' · 在教室清单中';
      } else {
        hint.className = 'hint';
        hint.innerHTML = '未在教室清单中，将按编号归入 <b>' + U.esc(b) + '</b>；可稍后在「基础配置」补充';
      }
      if (autoEngineer) {
        var allowed = dutyEngineers();
        var rec = S.recommendEngineer(b);
        var pick = rec && allowed.some(function (e) { return e.name === rec.name; }) ? rec
          : (allowed.filter(function (e) { return (e.buildings || []).indexOf(b) >= 0; })[0] || allowed[0]);
        if (pick) {
          document.getElementById('i-eng').value = pick.name;
          document.getElementById('i-eng-hint').textContent = '已按 ' + b + ' 推荐 ' + pick.name + '（当天当班，当前在办最少）';
        }
        renderHelpersInline();
      }
    }
  }

  function pickFault(f) {
    fault = (fault === f ? '' : f);
    pickedKbIds = [];  // 切换故障类型时清空之前的 KB 选择
    reRenderFaults();
    renderKbHint();
  }
  function reRenderFaults() {
    var st = S.getState();
    document.getElementById('i-faults').innerHTML = st.settings.faultTypes.map(function (f) {
      return '<span class="pick' + (fault === f.name ? ' on' : '') + '" onclick="Views.intake.pickFault(\'' + U.esc(f.name) + '\')">' + U.esc(f.name) + '</span>';
    }).join('');
  }

  /** 根据选中的故障类型匹配知识库，渲染推荐卡片 */
  function renderKbHint() {
    var box = document.getElementById('i-kb-hint');
    if (!box) return;
    if (!fault) { box.innerHTML = ''; return; }
    var matches = S.matchKb(fault);
    if (!matches.length) {
      box.innerHTML = '<div style="font-size:12px;color:#8f959e;background:#fafcff;border:1px dashed #dbeafe;border-radius:6px;padding:8px 12px">📚 当前故障类型暂无知识库条目，结案后可一键沉淀经验</div>';
      return;
    }
    var rows = matches.slice(0, 3).map(function (a, idx) {
      var checked = pickedKbIds.indexOf(a.id) >= 0;
      var steps = (a.steps || []).slice(0, 2).join(' → ');
      return '<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:' + (idx === 0 ? '#f6ffed' : '#fafcff') + ';border:1px solid ' + (idx === 0 ? '#b7eb8f' : '#e5e6eb') + ';border-radius:6px;margin-bottom:6px;cursor:pointer">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' data-kb="' + U.esc(a.id) + '" onchange="Views.intake.toggleKb(this)" style="margin-top:3px">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:' + (idx === 0 ? '#389e0d' : '#1f2937') + ';margin-bottom:2px">' + U.esc(a.title) + '</div>' +
        '<div style="font-size:11px;color:#646a73;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(steps) + '</div>' +
        '</div>' +
        (idx === 0 ? '<span style="font-size:10px;color:#389e0d;background:#d9f7be;border-radius:3px;padding:1px 5px;white-space:nowrap">TOP 推荐</span>' : '') +
        '</label>';
    }).join('');
    box.innerHTML = '<div style="font-size:11px;color:#1677ff;margin-bottom:4px;font-weight:600">📚 匹配到 ' + matches.length + ' 条处置经验，勾选后随工单引用</div>' + rows;
  }
  function toggleKb(cb) {
    var id = cb.dataset.kb;
    if (!id) return;
    if (cb.checked) {
      if (pickedKbIds.indexOf(id) < 0) pickedKbIds.push(id);
    } else {
      pickedKbIds = pickedKbIds.filter(function (x) { return x !== id; });
    }
  }
  function pickUrg(u) {
    urgency = u;
    document.querySelectorAll('#i-urg .pick').forEach(function (el) {
      el.classList.toggle('on', el.dataset.v === u);
    });
  }
  function manualEng() {
    autoEngineer = false;
    document.getElementById('i-eng-hint').textContent = '已手动指定工程师';
  }
  function onAssigneeChange() {
    manualEng();
    renderHelpersInline();
  }
  function renderHelpersInline() {
    var eng = document.getElementById('i-eng').value;
    var wrap = document.getElementById('i-helpers-wrap');
    if (wrap) wrap.innerHTML = helpersHtml(eng);
  }

  function reset() {
    document.getElementById('i-room').value = '';
    document.getElementById('i-caller').value = '';
    document.getElementById('i-phone').value = '';
    document.getElementById('i-desc').value = '';
    document.getElementById('i-device').value = '';
    document.getElementById('i-time').value = nowInput();
    document.getElementById('i-eng').value = '';
    document.getElementById('i-eng-hint').textContent = '仅显示当天当班人员；填教室后会按楼栋推荐并自动选中';
    var stageEl = document.getElementById('i-stage');
    if (stageEl) stageEl.value = S.getState().settings.defaultStage || '';
    fault = ''; urgency = '常规'; autoEngineer = true;
    pickedKbIds = [];
    reRenderFaults();
    pickUrg('常规');
    renderKbHint();
    roomChanged();
  }

  function submit(withDispatch) {
    var room = document.getElementById('i-room').value.trim();
    var desc = document.getElementById('i-desc').value.trim();
    var callTime = document.getElementById('i-time').value;
    if (!room) { U.toast('请填写教室编号', 'err'); document.getElementById('i-room').focus(); return; }
    if (!/^[0-9A-Za-z]{3,8}$/.test(room)) { U.toast('教室编号格式不正确，如 2113', 'err'); return; }
    if (!fault) { U.toast('请选择故障类型', 'err'); return; }
    if (!desc) { U.toast('请填写故障现象', 'err'); document.getElementById('i-desc').focus(); return; }
    if (!callTime) { U.toast('请填写来电时间', 'err'); return; }
    var eng = document.getElementById('i-eng').value;
    if (withDispatch && !eng) { U.toast('请选择要指派的工程师', 'err'); return; }
    if (S.parseDT(callTime) > new Date(Date.now() + 10 * 60000)) { U.toast('来电时间不能晚于当前时间', 'err'); return; }

    try {
      var helpers = collectHelpers().join('，');
      var t = S.createTicket({
        room: room, desc: desc, fault: fault, urgency: urgency, createdAt: callTime,
        caller: document.getElementById('i-caller').value.trim(),
        phone: document.getElementById('i-phone').value.trim(),
        device: document.getElementById('i-device').value.trim(),
        source: '电话', operator: '客服 王丽',
        stage: document.getElementById('i-stage').value || '',
        assignee: withDispatch ? eng : '',
        helpers: helpers,
        kbRefs: pickedKbIds.slice()
      });
      if (pickedKbIds.length) {
        S.recordKbHit(t.no, pickedKbIds.slice());
      }
      UI.toast('已生成报修日志 ' + t.no + (withDispatch ? '，指派给 ' + eng : '，可在每日工作日志补录') + (pickedKbIds.length ? ' · 引用 ' + pickedKbIds.length + ' 条知识库' : ''), 'ok');
      reset();
      App.render();
      setTimeout(function () { Views.dailyLog.detail(t.no); }, 60);
    } catch (e) {
      U.toast(e.message, 'err');
    }
  }

  window.Views = window.Views || {};
  window.Views.intake = {
    render: render, mount: function () { autoEngineer = true; fault = ''; urgency = '常规'; pickedKbIds = []; },
    roomChanged: roomChanged, pickFault: pickFault, pickUrg: pickUrg, manualEng: manualEng,
    onAssigneeChange: onAssigneeChange, reset: reset, submit: submit,
    toggleKb: toggleKb, renderKbHint: renderKbHint,
    toggleHelper: toggleHelper, helpersAll: helpersAll
  };
})();
