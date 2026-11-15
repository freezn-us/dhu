/* 巡视管理：每天自动生成上午 / 下午 / 晚上 3 个时段的巡视任务 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var curDate = S.fmtDate(S.nowLocal());

  function render() {
    var date = curDate;
    var summary = S.patrolSummary(date);
    var duty = dutyOf(date);
    var isToday = date === S.fmtDate(S.nowLocal());

    var history = historyRows(7);

    return '<div class="page-head"><div><div class="page-title">巡视管理</div>' +
      '<div class="page-sub">每天自动生成 3 个时段的巡视任务；打卡后自动写入一条巡检日志，发现异常可直接转报修</div></div>' +
      '<div class="head-actions">' + U.datepicker({ id: 'pt-date', value: date, max: S.fmtDate(S.nowLocal()), onPick: 'Views.patrol.setDate(__V__)', width: 150 }) +
      '<button class="btn btn-primary btn-sm" onclick="Views.patrol.gotoLog()">' + U.icon('calendar') + '查看当日日志</button></div></div>' +

      '<div class="patrol-stats">' +
        statCard('今日任务', summary.total, S.PERIODS.length + ' 个时段自动生成', '#1677ff', 'calendar') +
        statCard('已完成', summary.done, '完成率 ' + (summary.total ? Math.round(summary.done / summary.total * 100) : 0) + '%', '#52c41a', 'check') +
        statCard('待打卡', summary.pending, summary.pending ? '请按时完成巡视' : '今日巡视已完成', summary.pending ? '#fa8c16' : '#52c41a', 'clock') +
        statCard('异常项', summary.abnormal, summary.abnormal ? '已生成异常记录' : '暂无异常', summary.abnormal ? '#f5222d' : '#8f959e', 'alert') +
      '</div>' +

      '<div class="grid" style="grid-template-columns:300px minmax(0,1fr);align-items:start">' +
        '<div class="card rail-card"><div class="card-head"><h3>' + U.icon('check') + '每日巡视计划</h3><span class="more">固定 ' + S.PERIODS.length + ' 个时段</span></div>' +
          '<div class="rail-body">' + S.PERIODS.map(function (p) {
            return '<div class="plan-card" style="border-left-color:' + p.color + '">' +
              '<div class="plan-top"><span class="plan-ico" style="background:' + p.color + '18;color:' + p.color + '">' + U.icon(p.key === 'am' ? 'sun' : p.key === 'pm' ? 'clock' : 'moon', 16) + '</span>' +
              '<b>' + p.name + '巡检</b><span class="tag tag-gray">' + p.time + '</span></div>' +
              '<div class="plan-desc">' + S.esc(p.patrol) + '</div>' +
              '<div class="plan-items">' + S.PATROL_ITEMS.slice(0, 3).map(function (it) { return '<span>' + S.esc(it.name) + '</span>'; }).join('') + (S.PATROL_ITEMS.length > 3 ? ' 等 ' + S.PATROL_ITEMS.length + ' 项' : '') + '</div>' +
            '</div>';
          }).join('') +
          '<div class="duty-line">当班人员：' + duty.map(function (n) { return '<span class="tag tag-blue">' + S.esc(n) + '</span>'; }).join('') + '</div>' +
          '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="Views.patrol.checkinAll()">' + U.icon('zap') + '一键打卡全部正常</button>' +
          '</div></div>' +

        '<div><div class="card"><div class="card-head"><h3>' + (isToday ? '今日' : date) + '巡视任务</h3>' +
          '<span class="more">共 ' + summary.total + ' 项 · 来源：自动生成</span></div>' +
          '<div class="table-scroll"><table class="logtable patrol-table"><thead><tr><th>时段</th><th>计划时间</th><th>巡视范围</th><th>负责人</th><th>检查进度</th><th>状态</th><th style="width:150px">操作</th></tr></thead><tbody>' +
          summary.list.map(function (t) { return taskRow(t); }).join('') +
          '</tbody></table></div>' +
          '<div class="add-row"><span class="batch-hint">巡视任务每天 0 点自动生成，无需手工创建；打卡后可在日志中查看</span></div></div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>' + U.icon('shield') + '巡视检查标准</h3></div>' +
          '<div class="std-grid">' + S.PATROL_ITEMS.map(function (it, i) {
            return '<div class="std-item"><span class="std-no">' + (i + 1) + '</span><div><b>' + S.esc(it.name) + '</b><span>' + S.esc(it.std) + '</span></div></div>';
          }).join('') + '</div></div>' +

        '<div class="card" style="margin-top:16px"><div class="card-head"><h3>' + U.icon('chart') + '近 7 天巡视完成情况</h3></div>' +
          '<div class="table-scroll"><table class="logtable"><thead><tr><th>日期</th>' + S.PERIODS.map(function (p) { return '<th>' + S.esc(p.name) + '</th>'; }).join('') + '<th>完成率</th><th>异常</th></tr></thead><tbody>' +
          history.map(function (h) {
            return '<tr><td class="mono">' + h.date + '</td>' + h.slots.map(function (s) {
              return '<td>' + (s.status === 'done' ? '<span class="tag tag-green">' + (s.auto ? '自动完成' : '已打卡') + '</span>' : s.status === 'missed' ? '<span class="tag tag-gray">未打卡</span>' : '<span class="tag tag-orange">待打卡</span>') + '</td>';
            }).join('') + '<td><b>' + h.rate + '%</b></td><td>' + (h.abnormal ? '<span class="tag tag-red">' + h.abnormal + '</span>' : '<span class="tag tag-green">0</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>' +
        '</div>' +
      '</div>';
  }

  function statCard(label, n, sub, color, icon) {
    return '<div class="pstat"><i style="background:' + color + '18;color:' + color + '">' + U.icon(icon, 18) + '</i>' +
      '<div><b>' + n + '</b><span>' + label + '</span><em>' + sub + '</em></div></div>';
  }

  function taskRow(t) {
    var pi = S.periodInfo(t.period);
    var total = S.PATROL_ITEMS.length;
    var done = S.PATROL_ITEMS.filter(function (it) { return (t.results || {})[it.key] === 'pass'; }).length;
    var fail = S.PATROL_ITEMS.filter(function (it) { return (t.results || {})[it.key] === 'fail'; }).length;
    var statusTag = t.status === 'done' ? '<span class="tag tag-green">' + (t.auto ? '自动完成' : '已完成') + '</span>' : t.status === 'missed' ? '<span class="tag tag-gray">未完成</span>' : '<span class="tag tag-orange">待打卡</span>';
    return '<tr><td><b style="color:' + pi.color + '">' + pi.name + '</b></td>' +
      '<td class="mono">' + pi.time + '</td><td>' + S.esc(t.plan || '全校教室') + (t.abnormal ? '<div class="sub" style="color:#f5222d">' + S.esc(t.abnormal) + '</div>' : '') + '</td>' +
      '<td>' + S.esc(t.assignee || '—') + '</td>' +
      '<td>' + (t.status === 'done' ? '<div class="prog"><i style="width:' + Math.round((done + fail) / total * 100) + '%"></i></div><span class="sub">' + done + '/' + total + ' 正常' + (fail ? ' · ' + fail + ' 异常' : '') + '</span>' :
        '<span class="sub">0/' + total + ' 未开始</span>') + '</td>' +
      '<td>' + statusTag + '</td>' +
      '<td>' + (t.status === 'done' ?
        '<button class="btn btn-ghost btn-sm" onclick="Views.patrol.detail(\'' + S.esc(t.id) + '\')">查看记录</button>' :
        '<button class="btn btn-primary btn-sm" onclick="Views.patrol.checkin(\'' + S.esc(t.id) + '\')">' + U.icon('check') + '打卡</button>') + '</td></tr>';
  }

  function historyRows(days) {
    var out = [];
    var st = S.getState();
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var ds = S.dateKey(d);
      var slots = S.PERIODS.map(function (p) {
        var t = (st.patrols || []).filter(function (x) { return x.date === ds && x.period === p.key; })[0];
        return { period: p.key, status: t ? t.status : 'pending', auto: !!(t && t.auto) };
      });
      var done = slots.filter(function (s) { return s.status === 'done'; }).length;
      var abnormal = (st.patrols || []).filter(function (x) { return x.date === ds; }).reduce(function (a, x) {
        return a + Object.keys(x.results || {}).filter(function (k) { return x.results[k] === 'fail'; }).length;
      }, 0);
      out.push({ date: ds, slots: slots, rate: Math.round(done / 3 * 100), abnormal: abnormal });
    }
    return out;
  }

  function dutyOf(date) {
    if (window.Views['daily-log'] && window.Views['daily-log'].dutyOf) return window.Views['daily-log'].dutyOf(date);
    return ['当班工程师'];
  }

  function checkin(id) {
    var t = findTask(id);
    if (!t) { U.toast('巡视任务不存在', 'err'); return; }
    var roomOpts = S.getState().settings.rooms.filter(function (r) { return r.active !== false; }).map(function (r) {
      return { value: r.no, label: r.no, sub: r.building || '' };
    });
    var body = '<div class="form">' +
      '<div class="alert info">' + S.esc(t.name) + ' · ' + S.esc(S.periodInfo(t.period).time) + ' · 请逐项确认检查结果</div>' +
      '<div class="check-grid">' + S.PATROL_ITEMS.map(function (it) {
        return '<div class="check-row"><div><b>' + S.esc(it.name) + '</b><span>' + S.esc(it.std) + '</span></div>' +
          '<div class="seg"><label class="on"><input type="radio" name="ck-' + it.key + '" value="pass" checked onchange="Views.patrol.emitChange()">正常</label>' +
          '<label><input type="radio" name="ck-' + it.key + '" value="fail" onchange="Views.patrol.emitChange()">异常</label></div></div>';
      }).join('') + '</div>' +
      '<div id="abnormal-box" class="abnormal-box" style="display:none">' +
        '<div class="form-row full"><label><b>异常教室</b><span class="hint">输入教室编号搜索，点击选项添加；可多选，每个异常教室将生成一条独立的待填报报修日志</span></label>' +
        '<div class="tag-input" id="p-rooms-wrap">' +
          '<div class="tags" id="p-tags"></div>' +
          '<input class="ti-input" id="p-rooms-input" placeholder="输入教室编号搜索，如 2213">' +
          '<input type="hidden" id="p-rooms" value="">' +
          '<div class="tag-dropdown" id="p-dropdown"></div>' +
        '</div></div>' +
        '<div class="form-row"><label>统一故障类型</label><select id="p-fault" class="inp">' + S.getState().settings.faultTypes.map(function (f) {
          return '<option value="' + S.esc(f.name) + '">' + S.esc(f.name) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="form-row full"><label>异常说明</label><textarea id="p-abnormal" class="inp" rows="2" placeholder="如：2213 无线麦无声、2215 投影偏色，均已排查"></textarea></div>' +
        '<label class="inline-check"><input type="checkbox" id="p-create" checked> 同时为每个异常教室生成「待填报报修日志」</label>' +
      '</div>' +
      '<div class="form-row full"><label>巡视备注</label><textarea id="p-remark" class="inp" rows="2" placeholder="整体情况、遗留问题等"></textarea></div>' +
      '</div>';
    U.modal('巡视打卡 · ' + S.esc(t.name), body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.patrol.saveCheckin(\'' + S.esc(id) + '\')">提交打卡</button>');
    emitChange();
    initPatrolTagInput(roomOpts);
  }

  function findTask(id) {
    return S.getState().patrols.filter(function (p) { return p.id === id; })[0];
  }
  function emitChange() {
    var anyFail = !!document.querySelector('.check-grid input[value="fail"]:checked');
    var box = document.getElementById('abnormal-box');
    if (box) box.style.display = anyFail ? 'block' : 'none';
    document.querySelectorAll('.seg label').forEach(function (l) {
      var input = l.querySelector('input');
      l.classList.toggle('on', input.checked);
    });
  }

  // Tag Input 组件：可输入模糊查询 + 已选 tag + 下拉勾选
  function initPatrolTagInput(opts) {
    var input = document.getElementById('p-rooms-input');
    var hidden = document.getElementById('p-rooms');
    var tagsBox = document.getElementById('p-tags');
    var dropdown = document.getElementById('p-dropdown');
    if (!input) return;
    var allOpts = opts.slice();
    var selected = [];  // {value, label, sub}

    function saveHidden() {
      hidden.value = JSON.stringify(selected.map(function (o) { return o.value; }));
    }
    function renderTags() {
      tagsBox.innerHTML = selected.map(function (o) {
        return '<span class="tag">' + S.esc(o.label) + '<b title="移除" data-v="' + S.esc(o.value) + '">×</b></span>';
      }).join('');
      tagsBox.querySelectorAll('.tag b').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          removeOne(b.dataset.v);
          showDropdown();
        });
      });
      saveHidden();
    }
    function findOpt(v) { return allOpts.find(function (o) { return o.value === v; }); }
    function addOne(v) {
      if (!v || selected.some(function (o) { return o.value === v; })) return;
      var o = findOpt(v);
      if (!o) o = { value: v, label: v, sub: '' };
      selected.push(o);
      renderTags();
    }
    function removeOne(v) {
      selected = selected.filter(function (o) { return o.value !== v; });
      renderTags();
    }
    function showDropdown() {
      var kw = input.value.trim().toLowerCase();
      var filtered = allOpts.filter(function (o) {
        if (!kw) return true;
        return o.value.toLowerCase().indexOf(kw) >= 0 || (o.sub || '').toLowerCase().indexOf(kw) >= 0;
      }).slice(0, 80);
      if (!filtered.length) {
        dropdown.innerHTML = '<div class="ti-empty">没有匹配的教室</div>';
      } else {
        dropdown.innerHTML = filtered.map(function (o) {
          var sel = selected.some(function (s) { return s.value === o.value; });
          return '<div class="ti-item' + (sel ? ' sel' : '') + '" data-v="' + S.esc(o.value) + '">' +
            '<span class="ti-check">' + (sel ? '✓' : ' ') + '</span>' +
            '<span class="ti-label">' + S.esc(o.label) + '</span>' +
            (o.sub ? '<span class="ti-sub">' + S.esc(o.sub) + '</span>' : '') +
            '</div>';
        }).join('');
        dropdown.querySelectorAll('.ti-item').forEach(function (el) {
          el.addEventListener('click', function (e) {
            e.stopPropagation();
            var v = el.dataset.v;
            if (selected.some(function (s) { return s.value === v; })) removeOne(v);
            else addOne(v);
            input.value = '';
            showDropdown();
            input.focus();
          });
        });
      }
      dropdown.classList.add('show');
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', showDropdown);
    input.addEventListener('click', function (e) { e.stopPropagation(); showDropdown(); });
    // 回车快速添加
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var kw = input.value.trim();
        if (!kw) return;
        var hit = allOpts.find(function (o) { return o.value === kw; });
        if (hit) { addOne(hit.value); input.value = ''; showDropdown(); }
        else { addOne(kw); input.value = ''; showDropdown(); }
      } else if (e.key === 'Backspace' && !input.value && selected.length) {
        removeOne(selected[selected.length - 1].value);
        showDropdown();
      }
    });
    // 点击外部关闭下拉
    document.addEventListener('click', function handler(e) {
      if (!document.getElementById('p-rooms-wrap')) { document.removeEventListener('click', handler); return; }
      if (!e.target.closest('#p-rooms-wrap')) dropdown.classList.remove('show');
    });

    renderTags();
    saveHidden();
  }

  function saveCheckin(id) {
    var results = {};
    S.PATROL_ITEMS.forEach(function (it) {
      var el = document.querySelector('input[name="ck-' + it.key + '"]:checked');
      results[it.key] = el ? el.value : 'pass';
    });
    var anyFail = Object.keys(results).some(function (k) { return results[k] === 'fail'; });
    var roomsHidden = document.getElementById('p-rooms');
    var rooms = [];
    if (roomsHidden && roomsHidden.value) {
      try { rooms = JSON.parse(roomsHidden.value); } catch (e) { rooms = []; }
    }
    var abnormal = document.getElementById('p-abnormal') ? document.getElementById('p-abnormal').value.trim() : '';
    var createRepair = document.getElementById('p-create') && document.getElementById('p-create').checked;
    var fault = document.getElementById('p-fault') ? document.getElementById('p-fault').value : '服务类';
    if (anyFail && !rooms.length) { U.toast('请至少选择一个异常教室', 'err'); return; }
    if (anyFail && !abnormal) { U.toast('请填写异常说明', 'err'); return; }
    try {
      var r = S.checkinPatrol(id, {
        results: results, remark: document.getElementById('p-remark').value.trim(),
        abnormal: abnormal, rooms: rooms, createRepair: createRepair, repairFault: fault, by: App.operator()
      });
      U.closeModal();
      var txt = '打卡完成，已生成巡检日志 ' + r.log.no;
      if (r.repairNos && r.repairNos.length) txt += ' · 报修 ' + r.repairNos.join('、');
      U.toast(txt, 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function detail(id) {
    var t = findTask(id);
    if (!t) return;
    var done = t.status === 'done';
    var body = '<div class="form">' +
      '<div class="alert ' + (done ? 'ok' : 'warn') + '">' + S.esc(t.name) + ' · ' + S.esc(t.date) + ' · ' + S.esc(S.periodInfo(t.period).time) +
      ' · ' + (done ? '已于 ' + S.fmtDT(t.at) + ' ' + (t.auto ? '由系统自动完成（超过计划结束时间未打卡）' : '打卡') : '尚未打卡') + '</div>' +
      '<div class="check-grid">' + S.PATROL_ITEMS.map(function (it) {
        var v = t.results[it.key];
        return '<div class="check-row"><div><b>' + S.esc(it.name) + '</b><span>' + S.esc(it.std) + '</span></div>' +
          '<span class="tag ' + (v === 'pass' ? 'tag-green' : v === 'fail' ? 'tag-red' : 'tag-gray') + '">' + (v === 'pass' ? '正常' : v === 'fail' ? '异常' : '未检查') + '</span></div>';
      }).join('') + '</div>' +
      (t.abnormal ? '<div class="alert err">异常：' + S.esc(t.abnormal) + '</div>' : '') +
      (t.logNo ? '<div class="detail-sec"><h4>关联巡检日志</h4><p class="mono">' + S.esc(t.logNo) + '</p></div>' : '') +
      (t.repairNos && t.repairNos.length ? '<div class="alert warn">已生成 <b>' + t.repairNos.length + '</b> 条待填报报修：' + t.repairNos.map(function (n) { return '<span class="mono">' + S.esc(n) + '</span>'; }).join('、') + '</div>' : '') +
      (t.remark ? '<div class="detail-sec"><h4>备注</h4><p>' + S.esc(t.remark) + '</p></div>' : '') +
      '</div>';
    U.openDrawer('巡视记录 · ' + S.esc(t.name), '<span class="tag ' + (done ? 'tag-green' : 'tag-orange') + '">' + (done ? '已完成' : '待打卡') + '</span>', body,
      '<button class="btn btn-ghost" onclick="UI.closeDrawer()">关闭</button>' +
      (t.logNo ? '<button class="btn btn-primary" onclick="UI.closeDrawer();Views.dailyLog.detail(\'' + S.esc(t.logNo) + '\')">查看日志</button>' : ''));
  }

  function checkinAll() {
    var pending = S.patrolSummary(curDate).list.filter(function (p) { return p.status === 'pending'; });
    if (!pending.length) { U.toast('没有待打卡的巡视任务', 'err'); return; }
    U.confirm('一键打卡', '将把 ' + pending.length + ' 个待打卡时段全部标记为「' + S.PATROL_ITEMS.length + ' 项正常」并生成巡检日志，确定吗？', function () {
      var n = 0;
      pending.forEach(function (p) {
        try {
          S.checkinPatrol(p.id, { results: S.PATROL_ITEMS.reduce(function (a, it) { a[it.key] = 'pass'; return a; }, {}), by: App.operator() });
          n++;
        } catch (e) {}
      });
      U.toast('已打卡 ' + n + ' 个时段', 'ok');
      App.render();
    }, '一键打卡');
  }

  function setDate(d) {
    if (!d) return;
    if (d > S.fmtDate(S.nowLocal())) { U.toast('不能选择今天之后的日期', 'err'); App.render(); return; }
    curDate = d; App.render();
  }
  function gotoLog() { App.go('daily-log'); }

  window.Views = window.Views || {};
  window.Views.patrol = {
    render: render, setDate: setDate, gotoLog: gotoLog, checkin: checkin, saveCheckin: saveCheckin,
    detail: detail, emitChange: emitChange, checkinAll: checkinAll
  };
})();
