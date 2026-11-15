/* 日志填报：每日工作日志（默认当天）
 * UI 与交互逻辑参照 prototype-daily-log-v1：
 * 表头（日期/当班人员/操作行）→ 待填报报修条 → 三时段表格（巡检行置顶）→ 右侧统计栏
 * 弹窗：新增/编辑（教室校验+快捷短语+责任人多选+处理状态）、批量录入、快捷短语库
 * 权限：管理员可编辑/删除任意日志；普通用户仅可编辑/删除当天的日志
 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;

  // 快捷短语库（真实高频处置话术）
  var QK = [
    { a: '中控/讲台电脑开机无响应，重启后恢复', b: '重启后恢复正常', f: '中控/开机故障', n: 47 },
    { a: '投影仪无信号，重新插拔 HDMI 线后正常', b: '重插线后恢复', f: '投影仪问题', n: 38 },
    { a: '投影画面偏色/发暗，调整分辨率与亮度后恢复', b: '已恢复正常', f: '投影仪问题', n: 23 },
    { a: '无线麦克风无声，更换电池后正常', b: '换电池后正常', f: '音频/麦克风', n: 31 },
    { a: '音响有啸叫，调整音量与频道后正常', b: '已恢复正常', f: '音频/麦克风', n: 18 },
    { a: '课件无法播放，转码/更换播放器后正常', b: '已恢复正常', f: '网络/软件', n: 15 },
    { a: '网络认证失败，重新认证后恢复', b: '已恢复正常', f: '网络/软件', n: 12 },
    { a: '实物展台无法对焦，调整焦距后正常', b: '已恢复正常', f: '线材/其他', n: 9 },
    { a: 'VGA/HDMI 线接触不良，更换备用线后恢复', b: '换线后正常', f: '线材/其他', n: 21 },
    { a: '中控屏幕不亮，检查电源/电闸后恢复', b: '已恢复正常', f: '中控/开机故障', n: 8 },
    { a: '教师咨询设备使用，现场讲解操作方法', b: '已现场指导', f: '正常', n: 26 },
    { a: '临时借用无线麦克风/翻页笔，已登记归还', b: '已登记归还', f: '正常', n: 14 },
    { a: '课前设备开机自检，全部正常', b: '全部正常', f: '正常', n: 56 },
    { a: '课后设备复位归整，关闭电源', b: '已完成', f: '正常', n: 44 },
    { a: '投影灯泡亮度衰减，已登记待更换', b: '待跟进（已报配件）', f: '投影仪问题', n: 5 },
    { a: '黑板/智慧屏触控失灵，重启后恢复', b: '重启后恢复', f: '网络/软件', n: 7 },
    { a: '录播无法启动，检查存储空间后恢复', b: '已恢复正常', f: '网络/软件', n: 4 },
    { a: '讲台门锁/插座松动，已加固并报后勤', b: '已报后勤跟进', f: '线材/其他', n: 3 }
  ];

  // 故障标签固定配色（与原型一致），未匹配的类型回退到 settings 配置色
  var FCLS = { '中控/开机故障': 'ft-zk', '投影仪问题': 'ft-ty', '音频/麦克风': 'ft-yp', '网络/软件': 'ft-wl', '线材/其他': 'ft-xc', '正常': 'ft-ok' };
  var FCOLOR = { '中控/开机故障': '#f5222d', '投影仪问题': '#1677ff', '音频/麦克风': '#fa8c16', '网络/软件': '#13c2c2', '线材/其他': '#8f959e', '正常': '#52c41a' };

  // 处理状态三选一（存储英文 key，与 store.resultInfo 一致）
  var RESULTS = [
    { key: 'fixed', label: '已修复' },
    { key: 'follow', label: '待跟进' },
    { key: 'unfixed', label: '未解决' }
  ];

  var curDate = S.fmtDate(S.nowLocal());
  var DUTY_KEY = 'dhu_ops_duty_v1';
  var editNo = null, pendingNo = null;
  var qkFilter = 'all';
  var PD_SIZE = 4;                 // 待填报 / 待跟进 每页条数
  var pendPage = 1, followPage = 1;

  // ---------- 当班人员（只读展示，来源于「基础配置 → 排班日历」） ----------
  // 当前登录用户姓名（用于新增/批量录入时默认责任人）
  // 仅当登录账号能对应到「工程师名单」里的真实人员时才返回，避免管理员账号被当成责任人
  function meName() {
    var engs = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    var cands = [S.displayName(), S.currentUser()];
    for (var i = 0; i < cands.length; i++) {
      var n = cands[i];
      if (n && engs.some(function (e) { return e.name === n; })) return n;
    }
    return '';
  }

  function dutyOf(date) {
    var sched = (S.getState().settings.schedule || {})[date] || [];
    if (sched.length) return sched.slice();
    try {
      var all = JSON.parse(localStorage.getItem(DUTY_KEY) || '{}');
      if (all[date] && all[date].length) return all[date];
    } catch (e) {}
    var engs = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    var names = engs.slice(0, 3).map(function (e) { return e.name; });
    if (App.role().key === 'engineer' && names.indexOf(App.role().name) < 0) names.unshift(App.role().name);
    return names;
  }
  // 只隐藏真正「尚未填报」的单子；未解决 / 待跟进的日志同样在日志表中展示
  function openLogs(date) {
    var hidden = ['new', 'assigned', 'processing'];
    return S.logsByDate(date).filter(function (t) { return hidden.indexOf(t.status) < 0; });
  }

  // 故障选项 = 配置项 + 正常
  function faults() {
    var names = S.getState().settings.faultTypes.map(function (f) { return f.name; });
    if (names.indexOf('正常') < 0) names.push('正常');
    return names;
  }
  function faultOptions(sel) {
    return '<option value="">请选择</option>' + faults().map(function (f) {
      return '<option value="' + S.esc(f) + '"' + (f === sel ? ' selected' : '') + '>' + S.esc(f) + '</option>';
    }).join('');
  }
  function ftagHtml(fault) {
    if (!fault) return '<span class="ftag" style="color:#c9cdd4">—</span>';
    if (FCLS[fault]) return '<span class="ftag ' + FCLS[fault] + '">' + S.esc(fault) + '</span>';
    var ft = S.getState().settings.faultTypes.filter(function (f) { return f.name === fault; })[0];
    var c = (ft && ft.color) || '#8f959e';
    return '<span class="ftag" style="background:' + c + '1a;color:' + c + '">' + S.esc(fault) + '</span>';
  }
  function faultColor(name) {
    if (FCOLOR[name]) return FCOLOR[name];
    var ft = S.getState().settings.faultTypes.filter(function (f) { return f.name === name; })[0];
    return (ft && ft.color) || '#8f959e';
  }

  // 工作台「填写今日日志」：进入每日工作日志页并直接打开新增记录
  function addToday() {
    App.go('daily-log');
    setTimeout(function () {
      if (location.hash === '#/daily-log') openAdd();
    }, 80);
  }

  // 普通用户仅可修改/删除当天的日志（不限填报人；巡检记录始终不可改）
  function canModify(t) {
    if (!t || S.isPatrolLog(t)) return false;
    if (S.isAdmin()) return true;
    return (t.date || S.fmtDate(t.createdAt)) === S.fmtDate(S.nowLocal());
  }

  // 待填报 / 待跟进 分页（每页 PD_SIZE 条，紧凑页码）
  function pagerHtml(page, total, fn) {
    if (total <= 1) return '';
    var nums = '';
    for (var i = 1; i <= total; i++) {
      nums += '<button class="' + (i === page ? 'on' : '') + '" onclick="Views.dailyLog.' + fn + '(' + i + ')">' + i + '</button>';
    }
    return '<div class="pg-nums">' + nums + '</div>';
  }
  function pendPageTo(p) { pendPage = Math.max(1, p || 1); refresh(); }
  function followPageTo(p) { followPage = Math.max(1, p || 1); refresh(); }

  // ---------- 页面 ----------
  function render() {
    var date = curDate;
    var done = openLogs(date);
    var pending = S.pendingRepairs();
    var following = S.waitingRepairs();
    var pendPages = Math.max(1, Math.ceil(pending.length / PD_SIZE));
    if (pendPage > pendPages) pendPage = pendPages;
    var pendRows = pending.slice((pendPage - 1) * PD_SIZE, pendPage * PD_SIZE);
    var followPages = Math.max(1, Math.ceil(following.length / PD_SIZE));
    if (followPage > followPages) followPage = followPages;
    var followRows = following.slice((followPage - 1) * PD_SIZE, followPage * PD_SIZE);
    var patrol = S.patrolSummary(date);
    var duty = dutyOf(date);
    var week = S.weekInfo(date);
    var isToday = date === S.fmtDate(S.nowLocal());

    // 近 30 天高发教室
    var from30 = S.addMin(S.nowLocal(), -30 * 1440).slice(0, 10);
    var recent = S.logsBetween(from30, date).filter(function (t) { return t.room; });
    var roomCount = {};
    recent.forEach(function (t) { roomCount[t.room] = (roomCount[t.room] || 0) + 1; });
    var topRooms = Object.keys(roomCount).sort(function (a, b) { return roomCount[b] - roomCount[a]; }).slice(0, 5);

    // 故障分布
    var distMap = {};
    done.forEach(function (t) {
      var f = S.isPatrolLog(t) ? '正常' : (t.fault || '正常');
      distMap[f] = (distMap[f] || 0) + 1;
    });
    var distRows = Object.keys(distMap).sort(function (a, b) { return distMap[b] - distMap[a]; });
    var distTotal = done.length || 1;

    var html = '<div class="dl-scope">' +

      // 纸质日志表头
      '<div class="sheet-head"><div class="sheet-title">东华大学多媒体教室每日运维工作日志</div>' +
      '<div class="sheet-meta">' +
        '<div class="row"><span class="k">日期</span>' + U.datepicker({ id: 'dl-date', value: date, max: S.fmtDate(S.nowLocal()), onPick: 'Views.dailyLog.setDate(__V__)', width: 150 }) +
          (isToday ? '' : '<button class="btn btn-ghost btn-sm" style="margin-left:6px" onclick="Views.dailyLog.setDate(\'' + S.fmtDate(S.nowLocal()) + '\')">回到今天</button>') +
          '<span class="sheet-week">' + week + '</span>' + (isToday ? '<span class="tag tag-blue">今天</span>' : '') + '</div>' +
        '<div class="row"><span class="k">当班人员</span><div class="duty-box">' +
          duty.map(function (n) { return '<span class="duty-tag">' + S.esc(n) + '</span>'; }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="head-acts">' +
        '<button class="btn btn-primary btn-sm" onclick="Views.dailyLog.add()">' + U.icon('plus') + '新增记录</button>' +
        '<button class="btn btn-green btn-sm" onclick="Views.dailyLog.batch()">' + U.icon('list') + '批量录入（同类故障多教室）</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.phrases()">' + U.icon('zap') + '快捷短语</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.saveSheet()">保存今日日志</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.exportDay()">' + U.icon('download') + '导出Excel</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="window.print()">' + U.icon('print') + '打印</button>' +
        '<span class="sync-note">' + (S.isAdmin() ? '' : (isToday ? '仅可修改/删除当天日志 · ' : '历史日期日志仅可查看 · ')) + '数据已自动保存</span>' +
      '</div></div>' +

      // 待填报报修
      (pending.length ? '<div class="pending-bar"><div class="hd">' + U.icon('alert') + '待填报报修单<span class="n">' + pending.length + '</span>' +
        '<a onclick="App.go(\'intake\')">去登记新报修 →</a></div><div class="pd-list">' +
        pendRows.map(function (t) {
          return '<div class="pd-item"><span class="no">' + S.esc(t.no) + '</span>' +
            '<span class="room">' + S.esc(t.room || '—') + '</span>' +
            '<span class="desc">' + S.esc(t.desc) + '</span>' +
            (t.urgency === '紧急' ? '<span class="tag tag-red">紧急</span>' : '') +
            '<span class="tm">' + S.fmtDT(t.createdAt) + (t.assignee ? ' · ' + S.esc(t.assignee) : '') + '</span>' +
            '<button class="btn btn-primary btn-sm" onclick="Views.dailyLog.fillTicket(\'' + S.esc(t.no) + '\')">填报处理结果</button></div>';
        }).join('') +
        pagerHtml(pendPage, pendPages, 'pendPageTo') +
      '</div></div>' : '') +

      // 待跟进报修
      (following.length ? '<div class="pending-bar waiting"><div class="hd">' + U.icon('clock') + '待跟进报修单<span class="n">' + following.length + '</span>' +
        '<a onclick="App.go(\'tickets\')">全部记录 →</a></div><div class="pd-list">' +
        followRows.map(function (t) {
          return '<div class="pd-item"><span class="no">' + S.esc(t.no) + '</span>' +
            '<span class="room">' + S.esc(t.room || '—') + '</span>' +
            '<span class="desc">' + S.esc(t.desc) + '</span>' +
            '<span class="tm">' + S.fmtDT(t.createdAt) + (t.assignee ? ' · ' + S.esc(t.assignee) : '') + '</span>' +
            '<button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.detail(\'' + S.esc(t.no) + '\')">查看</button></div>';
        }).join('') +
        pagerHtml(followPage, followPages, 'followPageTo') +
      '</div></div>' : '') +

      // 主体：三时段 + 右侧统计栏
      '<div class="dl-wrap"><div class="wrap-main">' +
        S.PERIODS.map(function (p) { return periodSection(p, done); }).join('') +
      '</div>' +
      '<aside class="side">' +
        '<div class="side-card"><h3>' + U.icon('chart', 14) + '今日汇总</h3>' +
          '<div class="big-n">' + done.length + '<small>条记录</small></div>' +
          (distRows.length ? '<div class="dist">' + distRows.map(function (f) {
            return '<div class="dist-row"><span class="n">' + S.esc(f) + '</span><span class="bar"><i style="width:' + Math.round(distMap[f] / distTotal * 100) + '%;background:' + faultColor(f) + '"></i></span><span class="v">' + distMap[f] + '</span></div>';
          }).join('') + '</div>' : '<div class="side-empty">当天还没有日志记录</div>') +
        '</div>' +
        '<div class="side-card"><h3>' + U.icon('check', 14) + '三时段巡检确认</h3>' +
          patrol.list.map(function (p) {
            var pi = S.periodInfo(p.period);
            var ok = p.status === 'done';
            return '<div class="chk ' + (ok ? 'ok' : 'no') + '"><i class="dot"></i><b>' + pi.name + '巡检</b><span>' + pi.time + ' · ' + (ok ? '已确认' : '待打卡') + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="side-card"><h3>' + U.icon('room', 14) + '高发教室 TOP5</h3>' +
          (topRooms.length ? topRooms.map(function (r, i) {
            return '<div class="kv"><span>' + (i + 1) + '. ' + S.esc(r) + '</span><b style="color:var(--red)">' + roomCount[r] + ' 次</b></div>';
          }).join('') : '<div class="side-empty">暂无数据</div>') +
        '</div>' +
        '<div class="side-card"><h3>' + U.icon('zap', 14) + '填报要点</h3>' +
          '<div class="tip-list"><div>教室编号填 4 位数字（如 2113）</div><div>工作内容写清「现象 + 处置」</div><div>未解决事项在备注注明后续计划</div><div>多人协作记得都选上责任人</div></div>' +
        '</div>' +
      '</aside></div>' +
    '</div>';
    return html;
  }

  function periodSection(p, rowsAll) {
    var rows = rowsAll.filter(function (t) { return t.period === p.key; })
      .sort(function (a, b) { return (S.isPatrolLog(b) ? 1 : 0) - (S.isPatrolLog(a) ? 1 : 0); });
    var faultN = rows.filter(function (t) { return !S.isPatrolLog(t) && t.fault && t.fault !== '正常' && t.fault !== '服务类'; }).length;
    var ico = p.key === 'am' ? 'sun' : p.key === 'pm' ? 'clock' : 'moon';

    var html = '<div class="period"><div class="period-head">' +
      '<div class="ico" style="background:' + p.color + '">' + U.icon(ico, 16) + '</div>' +
      '<div><div class="nm">' + p.name + '</div><div class="tm">' + p.time + '</div></div>' +
      '<span class="cnt">' + rows.length + ' 条 · 故障 ' + faultN + ' 项</span>' +
      '<div class="acts"><button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.add(\'' + p.key + '\')">' + U.icon('plus', 12) + '新增</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.dailyLog.batch(\'' + p.key + '\')">' + U.icon('list', 12) + '批量</button></div></div>' +
      '<table class="log"><thead><tr><th style="width:34px">序号</th><th style="width:88px">教室编号</th><th style="width:84px">阶段</th><th>工作内容</th><th style="width:110px">故障类型</th><th style="width:150px">处理结果</th><th style="width:110px">责任人</th><th style="width:120px">备注</th><th style="width:58px"></th></tr></thead><tbody>';

    if (!rows.length) {
      html += '<tr class="empty-row"><td colspan="9">暂无记录，点击右上角「新增」开始填报</td></tr>';
    } else {
      rows.forEach(function (t, i) {
        var isPat = S.isPatrolLog(t);
        var owners = (t.assignee || '') + (t.helpers ? '，' + t.helpers : '');
        var acts;
        if (isPat) {
          acts = '<button class="ico-btn ok" title="巡检已确认" onclick="event.stopPropagation();Views.dailyLog.patrolDone()">' + U.icon('check', 13) + '</button>';
        } else {
          acts = '<button class="ico-btn" title="复制为新行" onclick="event.stopPropagation();Views.dailyLog.dup(\'' + t.no + '\')">' + U.icon('copy', 13) + '</button>';
          if (canModify(t)) {
            acts += '<button class="ico-btn" title="编辑" onclick="event.stopPropagation();Views.dailyLog.edit(\'' + t.no + '\')">' + U.icon('edit', 13) + '</button>' +
                    '<button class="ico-btn danger" title="删除" onclick="event.stopPropagation();Views.dailyLog.del(\'' + t.no + '\')">' + U.icon('trash', 13) + '</button>';
          }
        }
        html += '<tr' + (isPat ? ' class="patrol"' : '') + ' onclick="Views.dailyLog.detail(\'' + t.no + '\')">' +
          '<td class="seq">' + (i + 1) + '</td>' +
          '<td class="room-cell' + (t.room ? '' : ' empty') + '">' + (t.room ? S.esc(t.room) : '—') + '</td>' +
          '<td class="stage-cell" style="font-size:12px;color:' + (t.stage ? '#5a6472' : '#c9cdd4') + '">' + S.esc(t.stage || '未标注') + '</td>' +
          '<td class="task-cell">' + S.esc(t.summary || t.desc) + '</td>' +
          '<td>' + (isPat ? '<span class="ftag ft-ok">正常</span>' : ftagHtml(t.fault)) + '</td>' +
          '<td class="res-tx">' + (t.action ? S.esc(t.action) : '<span style="color:#c9cdd4">—</span>') + '</td>' +
          '<td class="owners">' + S.esc(owners || '—') + '</td>' +
          '<td class="note-cell">' + (t.remark ? S.esc(t.remark) : '') + '</td>' +
          '<td onclick="event.stopPropagation()"><div class="row-acts">' + acts + '</div></td></tr>';
      });
    }

    html += '</tbody></table></div>';
    return html;
  }

  // ---------- 弹窗：新增 / 编辑 ----------
  function stages() { return S.getState().settings.lessonStages || []; }
  function stageOptions(sel, keepEmpty) {
    var list = stages();
    var def = keepEmpty ? (sel || '') : (sel || S.getState().settings.defaultStage || list[0] || '');
    var html = keepEmpty ? '<option value=""' + (def ? '' : ' selected') + '>未标注</option>' : '';
    if (sel && list.indexOf(sel) < 0) html += '<option value="' + S.esc(sel) + '" selected>' + S.esc(sel) + '（已停用）</option>';
    return html + list.map(function (s) {
      return '<option value="' + S.esc(s) + '"' + (s === def ? ' selected' : '') + '>' + S.esc(s) + '</option>';
    }).join('');
  }

  function openAdd(period, preset, pendNo) {
    preset = preset || {};
    editNo = preset.editNo || null;
    pendingNo = pendNo || null;
    var periodKey = period || preset.period || S.periodOf(S.nowLocal());
    var duty = dutyOf(curDate);
    var me = meName();
    var selAssignee = preset._assignee || me || (duty[0] || '');
    var selHelpers = preset._helpers || null;  // null = 默认全选 duty - assignee
    var resultVal = preset._result || 'fixed';

    var body = '<div class="dl-scope">' +
      '<div class="grid2">' +
        '<div class="fr"><label>时段 <b>*</b></label><select class="inp" id="f-period" onchange="Views.dailyLog.syncSub()">' +
          S.PERIODS.map(function (p) { return '<option value="' + p.key + '"' + (p.key === periodKey ? ' selected' : '') + '>' + p.name + '（' + p.time + '）</option>'; }).join('') + '</select></div>' +
        '<div class="fr"><label>教室编号</label><input class="inp" id="f-room" maxlength="6" placeholder="如 2113（可留空）" value="' + S.esc(preset.room || '') + '" oninput="Views.dailyLog.checkRoom()">' +
          '<div class="hint" id="roomHint">4 位数字；首位为教学楼号（1=一教，2=二教）。不关联具体教室可留空。</div></div>' +
      '</div>' +
      '<div class="fr"><label>阶段</label><select class="inp" id="f-stage">' + stageOptions(preset.stage || '', !!editNo) + '</select></div>' +
      '<div class="fr"><label>处理时长</label><div class="dur-box">' +
        '<div class="dur-step">' +
          '<button type="button" class="dur-btn" title="减少 1 分钟" onclick="Views.dailyLog.stepDuration(-1)">−</button>' +
          '<input class="inp dur-inp" id="f-duration" type="number" min="0" max="1440" step="1" value="' + (preset.durationMin != null ? preset.durationMin : 1) + '" oninput="Views.dailyLog.syncDuration()">' +
          '<button type="button" class="dur-btn" title="增加 1 分钟" onclick="Views.dailyLog.stepDuration(1)">＋</button>' +
        '</div><span class="dur-unit">分钟</span>' +
        '<span class="dur-quick"><button type="button" onclick="Views.dailyLog.setDuration(3)">3</button><button type="button" onclick="Views.dailyLog.setDuration(5)">5</button><button type="button" onclick="Views.dailyLog.setDuration(10)">10</button></span>' +
      '</div><div class="hint">现场处理用时，用于时效统计</div></div>' +
      '<div class="fr"><label>故障类型 <b>*</b></label><select class="inp" id="f-fault" onchange="Views.dailyLog.onFaultChange()">' + faultOptions(preset.fault) + '</select></div>' +
      '<div class="fr"><label>故障表现<span class="lbl-note">选填，随故障类型联动</span></label><select class="inp" id="f-symptom" onchange="Views.dailyLog.onSymptomChange(\'f\')"></select>' +
        '<div class="hint">选择故障表现后自动填入工作内容，可继续编辑补充</div></div>' +
      '<div class="fr"><label>工作内容（故障现象 / 工作事项） <b>*</b></label><textarea class="inp" id="f-task" rows="2" placeholder="如：中控电脑开机指令无响应 / 小蜜蜂没电 / 老师希望装一根usb延长线">' + S.esc(preset.task || '') + '</textarea>' +
        '<div class="hint">点击下方快捷短语可一键带入「工作内容 + 处理结果 + 故障类型」</div></div>' +
      '<div class="fr"><label>快捷短语（按真实高频记录整理）</label><div class="qk-wrap" id="qkWrap"></div></div>' +
      '<div class="fr"><label>处理结果 <b>*</b></label><textarea class="inp" id="f-result" rows="3" placeholder="如：手动开机 / 更换电池正常；可换行分条记录">' + S.esc(preset.result || '') + '</textarea></div>' +
      '<div class="fr"><label>处理状态</label><div class="owner-pick" id="f-state">' +
        RESULTS.map(function (r) {
          return '<button type="button" class="op' + (resultVal === r.key ? ' on' : '') + '" data-result="' + r.key + '" onclick="this.parentNode.querySelectorAll(\'.op\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">' + r.label + '</button>';
        }).join('') +
      '</div><div class="hint">未解决 / 待跟进的记录会继续出现在「待跟进」列表</div></div>' +
      '<div class="fr"><label>责任人 <b>*</b><span class="lbl-note">单选，仅限当天当班人员</span></label><div class="owner-pick" id="f-assignee">' + ownerSingleChips(selAssignee, duty, 'f-assignee', 'f-helpers') + '</div></div>' +
      '<div class="fr"><label>协助人<span class="lbl-note">多选，默认全选除责任人外的当班人员；不能与责任人重复</span></label>' +
      (function () {
        var ch = helpersChips(selAssignee, selHelpers, duty);
        if (!ch) return '<div class="hint" style="color:var(--faint)">当天仅一名当班人员，无需协助人</div>';
        return '<div class="owner-pick" id="f-helpers">' + ch + '</div>';
      })() + '</div>' +
      '<div class="fr"><label>备注</label><input class="inp" id="f-note" placeholder="选填：需跟进事项、教师姓名、备件消耗等" value="' + S.esc(preset.note || '') + '"></div>' +
    '</div>';
    var foot = '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      (editNo ? '' : '<button class="btn btn-ghost" id="btn-save-add" onclick="Views.dailyLog.saveAdd(true)">' + U.icon('list', 13) + '保存并继续新增</button>') +
      '<button class="btn btn-primary" onclick="Views.dailyLog.saveAdd(false)">' + U.icon('check', 13) + '保存</button>';
    var pi = S.periodInfo(periodKey);
    U.modal('<span class="m-ico">' + U.icon('edit', 18) + '</span>' + (editNo ? '编辑记录' : '新增记录') + '<span class="modal-sub" id="addSub">' + pi.name + ' ' + pi.time + '</span>', body, foot, { wide: true });
    fillSymptoms(preset.symptom || '');
    filterQk();
    checkRoom();
  }

  // 故障表现下拉：随故障类型联动（选填）；无配置时禁用。prefix='f'新增 / 'b'批量
  function fillSymptomsFor(prefix, selected) {
    var sel = document.getElementById(prefix + '-symptom');
    if (!sel) return;
    var fault = gv(prefix + '-fault');
    var f = S.getState().settings.faultTypes.filter(function (x) { return x.name === fault; })[0];
    var syms = (f && Array.isArray(f.symptoms)) ? f.symptoms : [];
    if (!syms.length) {
      sel.innerHTML = '<option value="">暂无故障表现</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">不选择</option>' + syms.map(function (s) {
      return '<option value="' + S.esc(s) + '"' + (s === selected ? ' selected' : '') + '>' + S.esc(s) + '</option>';
    }).join('');
  }
  function fillSymptoms(selected) { fillSymptomsFor('f', selected); }
  // 选择故障表现 → 默认填入工作内容（仅当内容为空或仍是上次自动填充值，避免覆盖手动修改）
  function onSymptomChange(prefix) {
    var sel = document.getElementById(prefix + '-symptom');
    var task = document.getElementById(prefix + '-task');
    if (!sel || !task) return;
    var v = sel.value;
    var last = task.dataset.symFill || '';
    if (!v) {
      if (task.value === last) { task.value = ''; task.dataset.symFill = ''; }
      return;
    }
    if (task.value.trim() === '' || task.value === last) {
      task.value = v;
      task.dataset.symFill = v;
    }
  }
  // 切换故障类型：刷新快捷短语 + 重置故障表现（清理旧的自动填充，不动手动内容）
  function onFaultChange() {
    filterQk();
    resetSymptomFill('f');
    fillSymptomsFor('f', '');
  }
  function onBatchFaultChange() {
    filterBatchQk();
    resetSymptomFill('b');
    fillSymptomsFor('b', '');
  }
  function resetSymptomFill(prefix) {
    var task = document.getElementById(prefix + '-task');
    if (task && task.dataset.symFill && task.value === task.dataset.symFill) {
      task.value = '';
    }
    if (task) task.dataset.symFill = '';
  }

  function ownerChips(selected, only) {
    var names = only && only.length ? only.slice()
      : S.getState().settings.engineers.filter(function (e) { return e.active !== false; }).map(function (e) { return e.name; });
    (selected || []).forEach(function (n) { if (n && names.indexOf(n) < 0) names.push(n); });
    return names.map(function (n) {
      var on = (selected || []).indexOf(n) >= 0;
      return '<button type="button" class="op' + (on ? ' on' : '') + '" data-name="' + S.esc(n) + '" onclick="this.classList.toggle(\'on\')">' + S.esc(n) + '</button>';
    }).join('');
  }
  function ownerSingleChips(selected, only, onAssigneeId, onHelpersId) {
    var names = only && only.length ? only.slice()
      : S.getState().settings.engineers.filter(function (e) { return e.active !== false; }).map(function (e) { return e.name; });
    (selected ? [selected] : []).forEach(function (n) { if (n && names.indexOf(n) < 0) names.unshift(n); });
    var cb = (onAssigneeId && onHelpersId)
      ? ('Views.dailyLog.onAssigneeChanged(\'' + onAssigneeId + '\', \'' + onHelpersId + '\')')
      : 'this.classList.toggle(\'on\')';
    return names.map(function (n) {
      var on = selected === n;
      return '<button type="button" class="op' + (on ? ' on' : '') + '" data-name="' + S.esc(n) + '" ' +
        'onclick="this.parentNode.querySelectorAll(\'.op\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\');' + cb + '">' +
        S.esc(n) + '</button>';
    }).join('');
  }
  function helpersChips(excludeName, selected, only) {
    var names = (only || []).slice();
    names = names.filter(function (n) { return n !== excludeName; });
    if (!names.length) return '';
    var sel = (selected || []).slice();
    // 默认全选（selected 为空或未提供时）
    if (!selected || !selected.length) sel = names.slice();
    sel = sel.filter(function (n) { return names.indexOf(n) >= 0 && n !== excludeName; });
    return names.map(function (n) {
      var on = sel.indexOf(n) >= 0;
      return '<button type="button" class="op' + (on ? ' on' : '') + '" data-name="' + S.esc(n) + '" onclick="this.classList.toggle(\'on\')">' + S.esc(n) + '</button>';
    }).join('');
  }
  function pickedOwners(wrapId) {
    return Array.prototype.map.call(document.querySelectorAll('#' + wrapId + ' .op.on'), function (el) { return el.dataset.name; });
  }
  function pickedSingle(wrapId) {
    var el = document.querySelector('#' + wrapId + ' .op.on');
    return el ? el.dataset.name : '';
  }

  function onAssigneeChanged(assigneeId, helpersId) {
    var wrap = document.getElementById(helpersId);
    if (!wrap) return;
    var sel = wrap.dataset.sel ? wrap.dataset.sel.split('|').filter(Boolean) : [];
    var duty = dutyOf(curDate);
    var assignee = pickedSingle(assigneeId);
    wrap.innerHTML = helpersChips(assignee, sel, duty);
    wrap.dataset.sel = '';
  }

  function gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  // 处理时长：步进 / 快捷设置 / 读取（0~1440 分钟）
  function stepDuration(delta) {
    var el = document.getElementById('f-duration');
    if (!el) return;
    var v = parseInt(el.value, 10);
    if (isNaN(v)) v = 1;
    el.value = Math.min(1440, Math.max(0, v + delta));
  }
  function setDuration(v) {
    var el = document.getElementById('f-duration');
    if (el) el.value = v;
  }
  function syncDuration() {
    var el = document.getElementById('f-duration');
    if (!el) return;
    var v = parseInt(el.value, 10);
    if (isNaN(v) || v < 0) el.value = 0;
    else if (v > 1440) el.value = 1440;
  }
  function syncSub() {
    var p = S.periodInfo(gv('f-period'));
    var el = document.getElementById('addSub');
    if (el) el.textContent = p.name + ' ' + p.time;
  }
  function checkRoom() {
    var v = gv('f-room').trim();
    var h = document.getElementById('roomHint');
    if (!h) return;
    if (!v) { h.textContent = '4 位数字；首位为教学楼号（1=一教，2=二教）。不关联具体教室可留空。'; h.className = 'hint'; }
    else if (/^\d{3,5}$/.test(v)) { h.textContent = '✓ 识别为 ' + S.buildingOf(v) + ' ' + v + ' 教室'; h.className = 'hint ok'; }
    else { h.textContent = '教室编号应为 3~5 位数字，如 2113'; h.className = 'hint err'; }
  }

  // 快捷短语（表单内）：按所选故障类型过滤
  function filterQk() {
    var el = document.getElementById('qkWrap');
    if (!el) return;
    var fault = gv('f-fault');
    el.innerHTML = QK.map(function (q, i) { return { q: q, i: i }; })
      .filter(function (x) { return !fault || x.q.f === fault; })
      .map(function (x) {
        return '<button type="button" class="qk-item" onclick="Views.dailyLog.useQkInForm(' + x.i + ')">' +
          ftagHtml(x.q.f) + '<span class="qk-t"><span class="qk-a">' + S.esc(x.q.a) + '</span><span class="qk-b">→ ' + S.esc(x.q.b) + '</span></span>' +
          '<span class="qk-n">用过' + x.q.n + '次</span></button>';
      }).join('');
  }
  function useQkInForm(i) {
    var q = QK[i];
    var t = document.getElementById('f-task'), r = document.getElementById('f-result'), f = document.getElementById('f-fault');
    if (t) t.value = q.a;
    if (r) r.value = q.b;
    if (f) { f.value = q.f; filterQk(); resetSymptomFill('f'); fillSymptomsFor('f', ''); }
    U.toast('已填入：' + q.a + ' → ' + q.b, 'ok');
  }

  function readResult() {
    var el = document.querySelector('#f-state .op.on');
    return el ? el.dataset.result : 'fixed';
  }

  function saveAdd(keep) {
    var d = {
      date: curDate,
      period: gv('f-period'),
      stage: gv('f-stage') || '',
      room: gv('f-room').trim(),
      fault: gv('f-fault'),
      symptom: gv('f-symptom') || '',
      desc: gv('f-task').trim(),
      action: gv('f-result').trim(),
      remark: gv('f-note').trim(),
      durationMin: (function () { var v = parseInt(gv('f-duration'), 10); return isNaN(v) ? 1 : Math.min(1440, Math.max(0, v)); })(),
      logType: 'repair'
    };
    // 责任人：单选 chips；协助人：多选 chips（自动剔除责任人）
    d.assignee = pickedSingle('f-assignee') || (dutyOf(curDate)[0] || '');
    var hList = pickedOwners('f-helpers').filter(function (n) { return n !== d.assignee; });
    d.helpers = hList.join('，');

    if (!d.desc) { U.toast('请填写工作内容', 'warn'); return; }
    if (!d.fault) { U.toast('请选择故障类型', 'warn'); return; }
    if (d.fault !== '正常' && !d.action) { U.toast('请填写处理结果', 'warn'); return; }
    if (d.room && !/^\d{3,5}$/.test(d.room)) { U.toast('教室编号为 3~5 位数字', 'warn'); return; }

    var r = readResult();
    d.result = r;
    d.solved = r === 'fixed';
    d.status = r === 'fixed' ? 'closed' : 'waiting';

    try {
      var ticketNo = null;
      var ticketFault = d.fault;
      var ticketAction = d.action;
      if (editNo) {
        S.updateTicket(editNo, {
          date: S.findTicket(editNo) ? S.findTicket(editNo).date : d.date,
          period: d.period, stage: d.stage, room: d.room, fault: d.fault, symptom: d.symptom,
          desc: d.desc, summary: d.desc.slice(0, 30), action: d.action, remark: d.remark,
          durationMin: d.durationMin,
          assignee: d.assignee, helpers: d.helpers,
          result: d.result, solved: d.solved, status: d.status
        });
        ticketNo = editNo;
        U.toast('已保存修改', 'ok');
        U.closeModal();
      } else if (pendingNo) {
        S.fillLog(pendingNo, d);
        ticketNo = pendingNo;
        U.toast('已填报 ' + pendingNo + ' 的处理结果', 'ok');
        U.closeModal();
      } else {
        var newT = S.addLog(d);
        ticketNo = newT.no;
        U.toast(keep ? '已保存，可继续录入' : '已保存', 'ok');
        if (keep) {
          ['f-room', 'f-task', 'f-result', 'f-note'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
          var symEl = document.getElementById('f-symptom'); if (symEl) symEl.value = '';
          checkRoom();
          var task = document.getElementById('f-task');
          if (task) task.focus();
          if (location.hash !== '#/daily-log') App.go('daily-log'); else refresh();
          return;
        }
        U.closeModal();
      }
      // 结案后闭环：弹窗问是否沉淀为知识库经验
      if (d.status === 'closed' && ticketFault && ticketFault !== '正常' && ticketAction && ticketNo) {
        // 异步弹窗，不阻塞页面跳转
        setTimeout(function () {
          askSettleKb(ticketNo, ticketFault, d.desc, ticketAction);
        }, 200);
      }
      // 保存后落在「每日工作日志」页
      if (location.hash !== '#/daily-log') App.go('daily-log'); else refresh();
    } catch (err) { U.toast(err.message || String(err), 'err'); }
  }

  // ---------- 知识库闭环：结案后弹窗问是否沉淀 ----------

  /** 结案后弹窗让用户快速沉淀为知识库文章 */
  function askSettleKb(ticketNo, fault, desc, action) {
    var t = S.findTicket(ticketNo);
    if (!t) return;
    // 如果这条工单已经有 kbRefs 反向指向（说明之前已经沉淀过），跳过
    if ((t.kbRefs || []).length) return;
    var existing = S.kbCountByFault(fault);
    var today = S.fmtDate(t.createdAt || S.nowLocal());
    var suggestTitle = action ? action.slice(0, 18) + '（' + fault + '）' : (desc || '故障处置经验').slice(0, 20);
    var body = '' +
      '<div style="font-size:12px;color:#646a73;background:#fafcff;border-left:3px solid #1677ff;border-radius:4px;padding:8px 12px;margin-bottom:10px">' +
      '结案自动沉淀：工单 <b>' + S.esc(ticketNo) + '</b> · 故障 <b>' + S.esc(fault) + '</b>' +
      (existing > 0 ? ' · 当前分类已有 <b style="color:#389e0d">' + existing + '</b> 条经验' : ' · 当前分类 <b style="color:#d46b08">暂无经验</b>，建议沉淀') +
      '</div>' +
      '<div class="form">' +
      '<div class="form-row full"><label>知识库标题 <span class="req">*</span></label><input class="inp" id="sk-title" value="' + S.esc(suggestTitle) + '" placeholder="如 中控开机无响应处置 SOP"></div>' +
      '<div class="form-row"><label>故障分类</label><input class="inp" value="' + S.esc(fault) + '" disabled style="background:#f0f2f5;color:#646a73"></div>' +
      '<div class="form-row full"><label>适用场景</label><input class="inp" id="sk-scene" value="' + S.esc(desc || '') + '" placeholder="什么时候用这条经验"></div>' +
      '<div class="form-row full"><label>处理步骤（每行一步，已从工单自动带入）</label><textarea class="inp" rows="4" id="sk-steps">' + S.esc(action || '') + '</textarea><div class="hint">已从工单处理结果自动拆分，可在此补充遗漏步骤</div></div>' +
      '<div class="form-row full"><label>注意事项（选填）</label><input class="inp" id="sk-notice" placeholder="如 强电操作须持证完成，更换线材后登记耗材"></div>' +
      '</div>';
    var foot = '<button class="btn btn-ghost" onclick="UI.closeModal()">跳过（已有经验就够了）</button>' +
      '<button class="btn btn-primary" onclick="Views.dailyLog.confirmSettleKb(\'' + S.esc(ticketNo) + '\')">' + U.icon('book') + '沉淀为知识库</button>';
    U.modal('📚 结案沉淀 · 变成可复用经验', body, foot, { wide: true });
  }
  function confirmSettleKb(ticketNo) {
    var title = (document.getElementById('sk-title') || {}).value || '';
    if (!title.trim()) { U.toast('请填写知识库标题', 'warn'); return; }
    var stepsRaw = (document.getElementById('sk-steps') || {}).value || '';
    var extraSteps = stepsRaw.split(/[\n;；]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var scene = (document.getElementById('sk-scene') || {}).value || '';
    var notice = (document.getElementById('sk-notice') || {}).value || '';
    try {
      var a = S.settleToKb(ticketNo, { title: title.trim(), extraSteps: extraSteps, notice: notice });
      U.closeModal();
      U.toast('已沉淀：' + a.title + '（' + a.id + '）', 'ok');
      setTimeout(function () { App.go('kb'); }, 300);
    } catch (e) { U.toast(e.message || String(e), 'err'); }
  }

  // ---------- 行操作 ----------
  function dup(no) {
    var t = S.findTicket(no);
    if (!t) return;
    if (S.isPatrolLog(t)) { U.toast('巡检记录由打卡生成，不可复制', 'warn'); return; }
    openAdd(null, {
      period: t.period,
      stage: t.stage || '',
      durationMin: t.durationMin,
      task: t.summary || t.desc,
      fault: t.fault,
      symptom: t.symptom || '',
      result: t.action,
      note: t.remark,
      _assignee: t.assignee || '',
      _helpers: t.helpers ? t.helpers.split(/[，,\s]+/) : null,
      _result: t.result === 'follow' || t.result === 'unfixed' ? t.result : 'fixed'
    });
    U.toast('已复制为新行，请修改后保存', 'ok');
  }

  function edit(no) {
    var t = S.findTicket(no);
    if (!t) { U.toast('记录不存在', 'warn'); return; }
    if (S.isPatrolLog(t)) { U.toast('巡检打卡记录请前往「巡视管理」查看', 'warn'); return; }
    if (!canModify(t)) { U.toast('普通用户仅可修改当天日志', 'warn'); return; }
    openAdd(null, {
      editNo: no,
      period: t.period,
      stage: t.stage || '',
      durationMin: t.durationMin,
      room: t.room,
      task: t.summary || t.desc,
      fault: t.fault,
      symptom: t.symptom || '',
      result: t.action,
      note: t.remark,
      _assignee: t.assignee || '',
      _helpers: t.helpers ? t.helpers.split(/[，,\s]+/) : null,
      _result: t.result === 'follow' || t.result === 'unfixed' ? t.result : 'fixed'
    });
  }

  function del(no) {
    var t = S.findTicket(no);
    if (!t) return;
    if (S.isPatrolLog(t)) { U.toast('巡检记录不可删除', 'warn'); return; }
    if (!canModify(t)) { U.toast('普通用户仅可删除当天日志', 'warn'); return; }
    U.confirm('删除该记录', '删除后不可恢复，确认删除 ' + no + '（' + S.esc(t.summary || t.desc) + '）吗？', function () {
      S.removeTicket(no);
      U.toast('已删除', 'ok');
      refresh();
    }, '删除', true);
  }

  function patrolDone() { U.toast('巡检已确认', 'ok'); }

  // 待填报报修 → 带入新增弹窗
  function fillFromTicket(no) {
    var t = S.findTicket(no);
    if (!t) { U.toast('未找到报修单 ' + no, 'warn'); return; }
    var d = (t.desc || '') + ' ' + (t.fault || '');
    var f = '';
    if (/中控|开机/.test(d)) f = '中控/开机故障';
    else if (/投影/.test(d)) f = '投影仪问题';
    else if (/音频|话筒|麦克风|音响/.test(d)) f = '音频/麦克风';
    else if (/网络|软件|认证|录播|智慧屏/.test(d)) f = '网络/软件';
    else if (/线|插座|门锁|展台/.test(d)) f = '线材/其他';
    if (faults().indexOf(f) < 0) f = t.fault || '';
    openAdd(null, {
      room: t.room,
      task: (t.desc || '').replace(/^教室设备故障[：:]?/, ''),
      note: '报修单 ' + no,
      stage: t.stage || '',
      fault: f,
      symptom: t.symptom || ''
    }, no);
  }

  // ---------- 批量录入 ----------
  function openBatch(period) {
    var duty = dutyOf(curDate);
    var selOwner = meName() || duty[0] || '';
    var body = '<div class="dl-scope">' +
      '<div class="alert info batch-mode"><b>批量录入模式</b> · 同一故障影响多个教室时，一次填写自动按教室生成多条日志</div>' +
      '<div class="grid2">' +
        '<div class="fr"><label>时段 <b>*</b></label><select class="inp" id="b-period">' +
          S.PERIODS.map(function (p) { return '<option value="' + p.key + '"' + (p.key === period ? ' selected' : '') + '>' + p.name + '（' + p.time + '）</option>'; }).join('') + '</select></div>' +
        '<div class="fr"><label>阶段</label><select class="inp" id="b-stage">' + stageOptions('') + '</select></div>' +
      '</div>' +
      '<div class="fr"><label>故障类型 <b>*</b></label><select class="inp" id="b-fault" onchange="Views.dailyLog.onBatchFaultChange()">' + faultOptions('') + '</select></div>' +
      '<div class="fr"><label>故障表现<span class="lbl-note">选填，随故障类型联动</span></label><select class="inp" id="b-symptom" onchange="Views.dailyLog.onSymptomChange(\'b\')"></select>' +
        '<div class="hint">选择故障表现后自动填入工作内容，可继续编辑补充</div></div>' +
      '<div class="fr"><label>教室编号（多个） <b>*</b></label>' +
        '<textarea class="inp rooms-input" id="b-rooms" placeholder="输入多个教室编号，用空格 / 逗号 / 顿号 / 换行分隔，如：2113 2115 2201" oninput="Views.dailyLog.parseRooms()"></textarea>' +
        '<div class="room-chips" id="bChips"></div>' +
        '<div class="hint" id="bCount">已识别 0 个教室</div></div>' +
      '<div class="fr"><label>工作内容 <b>*</b></label><textarea class="inp" id="b-task" placeholder="简要描述：现象 + 处理过程"></textarea></div>' +
      '<div class="fr"><label>快捷短语（按真实高频记录整理）</label><div class="qk-wrap" id="bQkWrap"></div>' +
        '<div class="hint">点击快捷短语可一键带入「工作内容 + 处理结果 + 故障类型」，再补填教室即可</div></div>' +
      '<div class="fr"><label>处理结果 <b>*</b></label><input class="inp" id="b-result" placeholder="如：重启后恢复正常"></div>' +
      '<div class="fr"><label>责任人 <b>*</b><span class="lbl-note">单选，仅限当天当班人员</span></label><div class="owner-pick" id="b-assignee">' + ownerSingleChips(selOwner, duty, 'b-assignee', 'b-helpers') + '</div></div>' +
      '<div class="fr"><label>协助人<span class="lbl-note">多选，默认全选除责任人外的当班人员；不能与责任人重复</span></label>' +
      (function () {
        var ch = helpersChips(selOwner, null, duty);
        if (!ch) return '<div class="hint" style="color:var(--faint)">当天仅一名当班人员，无需协助人</div>';
        return '<div class="owner-pick" id="b-helpers">' + ch + '</div>';
      })() + '</div>' +
      '<div class="fr"><label>备注</label><input class="inp" id="b-note" placeholder="选填"></div>' +
    '</div>';
    var foot = '<span style="margin-right:auto;font-size:11.5px;color:var(--faint)" id="bCount2">将生成 0 条记录</span>' +
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" id="btn-batch-ok" onclick="Views.dailyLog.doBatch()">' + U.icon('check', 13) + '确认生成</button>';
    U.modal('批量录入 · 同类故障多教室', body, foot, { wide: true });
    parseRooms();
    fillSymptomsFor('b', '');
    filterBatchQk();
  }

  // 快捷短语（批量录入）：按所选故障类型过滤，一键带入内容/结果/故障类型
  function filterBatchQk() {
    var el = document.getElementById('bQkWrap');
    if (!el) return;
    var fault = gv('b-fault');
    el.innerHTML = QK.map(function (q, i) { return { q: q, i: i }; })
      .filter(function (x) { return !fault || x.q.f === fault; })
      .map(function (x) {
        return '<button type="button" class="qk-item" onclick="Views.dailyLog.useQkInBatch(' + x.i + ')">' +
          ftagHtml(x.q.f) + '<span class="qk-t"><span class="qk-a">' + S.esc(x.q.a) + '</span><span class="qk-b">→ ' + S.esc(x.q.b) + '</span></span>' +
          '<span class="qk-n">用过' + x.q.n + '次</span></button>';
      }).join('');
  }
  function useQkInBatch(i) {
    var q = QK[i];
    var t = document.getElementById('b-task'), r = document.getElementById('b-result'), f = document.getElementById('b-fault');
    if (t) t.value = q.a;
    if (r) r.value = q.b;
    if (f) { f.value = q.f; filterBatchQk(); resetSymptomFill('b'); fillSymptomsFor('b', ''); }
    U.toast('已填入：' + q.a + ' → ' + q.b, 'ok');
  }

  function parseRooms() {
    var el = document.getElementById('b-rooms');
    if (!el) return;
    var rooms = el.value.split(/[\s,，、]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var chips = document.getElementById('bChips');
    if (chips) chips.innerHTML = rooms.map(function (r) {
      return '<span class="room-chip' + (/^\d{3,5}$/.test(r) ? '' : ' bad') + '">' + S.esc(r) + '</span>';
    }).join('');
    var c = document.getElementById('bCount');
    if (c) c.textContent = '已识别 ' + rooms.length + ' 个教室';
    var c2 = document.getElementById('bCount2');
    if (c2) c2.textContent = '将生成 ' + rooms.length + ' 条记录';
    var bad = rooms.filter(function (r) { return !/^\d{3,5}$/.test(r); });
    var okBtn = document.getElementById('btn-batch-ok');
    if (okBtn) okBtn.disabled = !rooms.length || bad.length > 0;
  }

  function doBatch() {
    var period = gv('b-period');
    var stage = gv('b-stage') || '';
    var fault = gv('b-fault');
    var symptom = gv('b-symptom') || '';
    var task = gv('b-task').trim();
    var result = gv('b-result').trim();
    var note = gv('b-note').trim();
    var rooms = gv('b-rooms').split(/[\s,，、]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!rooms.length) { U.toast('请填写教室编号', 'warn'); return; }
    if (!fault) { U.toast('请选择故障类型', 'warn'); return; }
    if (!task) { U.toast('请填写工作内容', 'warn'); return; }
    if (!result) { U.toast('请填写处理结果', 'warn'); return; }
    var bad = rooms.filter(function (r) { return !/^\d{3,5}$/.test(r); });
    if (bad.length) { U.toast('教室编号「' + bad.join('、') + '」格式不正确，请修正', 'warn'); return; }

    var assignee = pickedSingle('b-assignee') || (dutyOf(curDate)[0] || '');
    var hList = pickedOwners('b-helpers').filter(function (n) { return n !== assignee; });
    var helpersStr = hList.join('，');
    if (!assignee) { U.toast('请选择责任人', 'warn'); return; }
    var ok = 0;
    rooms.forEach(function (room) {
      try {
        S.addLog({
          date: curDate, period: period, stage: stage, room: room, fault: fault, symptom: symptom,
          desc: task, action: result, remark: note,
          assignee: assignee, helpers: helpersStr,
          durationMin: 20, logType: 'repair',
          result: 'fixed', solved: true, status: 'closed'
        });
        ok++;
      } catch (e) { /* 单条失败继续 */ }
    });
    U.closeModal();
    U.toast('已批量生成 ' + ok +  ' 条记录', 'ok');
    refresh();
  }

  // ---------- 快捷短语库 ----------
  function phrases() {
    qkFilter = 'all';
    U.modal('快捷短语库', '<div class="dl-scope"><div class="qk-filters" id="qkFilters"></div><div class="qk-lib" id="qkLib"></div></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">关闭</button>', { wide: true });
    renderQkLib();
  }
  function renderQkLib() {
    var fEl = document.getElementById('qkFilters');
    if (!fEl) return;
    fEl.innerHTML = ['all'].concat(faults()).map(function (f) {
      return '<button type="button" class="qk-fchip' + (qkFilter === f ? ' on' : '') + '" onclick="Views.dailyLog.qkSet(\'' + S.esc(f) + '\')">' + (f === 'all' ? '全部' : S.esc(f)) + '</button>';
    }).join('');
    var lib = document.getElementById('qkLib');
    lib.innerHTML = QK.map(function (q, i) { return { q: q, i: i }; })
      .filter(function (x) { return qkFilter === 'all' || x.q.f === qkFilter; })
      .map(function (x) {
        return '<button type="button" class="qk-card" onclick="Views.dailyLog.useQkDirect(' + x.i + ')">' +
          '<div class="qa">' + S.esc(x.q.a) + '</div><div class="qb">→ ' + S.esc(x.q.b) + '</div>' +
          '<div class="qm">' + ftagHtml(x.q.f) + '<span class="fn">使用 ' + x.q.n + ' 次</span></div></button>';
      }).join('');
  }
  function qkSet(f) { qkFilter = f; renderQkLib(); }
  function useQkDirect(i) {
    var q = QK[i];
    var period = (curDate === S.fmtDate(S.nowLocal())) ? S.periodOf(S.nowLocal()) : 'am';
    var duty = dutyOf(curDate);
    try {
      S.addLog({
        date: curDate, period: period, stage: S.getState().settings.defaultStage || '', room: '', fault: q.f,
        desc: q.a, action: q.b,
        assignee: duty[0], helpers: duty.slice(1).join('，'),
        durationMin: 20, logType: 'repair',
        result: 'fixed', solved: true, status: 'closed'
      });
      U.closeModal();
      U.toast('已插入到' + S.periodInfo(period).name + '时段，请补充教室编号', 'ok');
      refresh();
    } catch (err) { U.toast(err.message || String(err), 'err'); }
  }

  // ---------- 详情（结构对齐 prototype-classroom-log-viewer-v1：记录信息 kv → 内容/结果 box → 同故障 → 时间人员 → 来源流转时间线） ----------
  function detail(no) {
    var t = S.findTicket(no);
    if (!t) { U.toast('记录不存在', 'warn'); return; }
    var ri = S.resultInfo(t);
    var st = S.STATUS[t.status] || {};
    var si = S.STATUS[t.slaStatus] || null;
    var pi = S.periodInfo(t.period);
    var patrol = S.isPatrolLog(t);
    var bld = t.room ? (t.building || S.buildingOf(t.room)) : '';

    // 同日同故障同处理（便于批量核对）
    var resTx = t.action || t.detail || '';
    var same = (!patrol && t.fault) ? S.logsByDate(t.date).filter(function (x) {
      return x.no !== t.no && x.fault === t.fault && (x.action || x.detail || '') === resTx;
    }) : [];

    // 来源与流转时间线
    var done = t.status === 'closed' || t.status === 'waiting';
    var flow = patrol ? [
      ['固定巡检项（系统预置）', '每日自动生成', 'done', ''],
      ['当班人员逐项确认', '责任人：' + (t.assignee || '—'), 'cur', S.fmtFull(t.createdAt)]
    ] : [
      [t.source === '电话' ? '教师致电报修' : '运维人员现场发现 / 教师口头反映',
        (t.caller ? '来电/反映人：' + t.caller + ' · ' : '') + '来源：' + (t.source || '日志填报'), 'done', ''],
      ['登记' + (done ? '' : '并派单 → 运维人员'), '日志编号 ' + t.no, 'done', S.fmtFull(t.createdAt)],
      ['运维人员到场处理', '责任人：' + (t.assignee || '—') + (t.durationMin != null ? ' · 用时 ' + t.durationMin + ' 分钟' : ''), done ? 'done' : 'cur', ''],
      ['填报每日工作日志', '写入 ' + t.date + ' ' + pi.name + '时段', done ? 'done' : 'cur', '']
    ];

    U.openDrawer('日志详情 · ' + t.no,
      '<span class="tag ' + st.cls + '">' + (st.label || t.status) + '</span>' +
      '<span class="ftag" style="background:' + ri.color + '1a;color:' + ri.color + '">' + ri.label + '</span>',
      '<div class="drawer-sec"><h4>记录信息</h4><div class="kv2">' +
      '<span class="k">日期</span><span class="v">' + S.esc(t.date) + '（' + S.esc(pi.name) + ' ' + S.esc(pi.time) + '）</span>' +
      '<span class="k">阶段</span><span class="v" style="' + (t.stage ? '' : 'color:var(--faint)') + '">' + S.esc(t.stage || '未标注') + '</span>' +
      '<span class="k">教室编号</span><span class="v">' + (t.room
        ? '<span class="mono" style="font-weight:700;color:#0b3d91">' + S.esc(t.room) + '</span>' + (bld ? ' · ' + S.esc(bld) : '')
        : '<span style="color:var(--faint);font-weight:400">未关联教室</span>') + '</span>' +
      '<span class="k">故障类型</span><span class="v">' + (patrol ? '<span class="ftag ft-ok">正常</span>' : ftagHtml(t.fault)) + '</span>' +
      '<span class="k">责任人</span><span class="v">' + S.esc(t.assignee || '—') + '</span>' +
      '<span class="k">协助人</span><span class="v">' + (t.helpers ? S.esc(t.helpers) : '<span style="color:var(--faint)">—</span>') + '</span>' +
      '<span class="k">日志编号</span><span class="v mono" style="color:var(--blue)">' + S.esc(t.no) + '</span>' +
      '</div></div>' +
      '<div class="drawer-sec"><h4>工作内容（故障现象）</h4><div class="box">' + S.esc(t.summary || t.desc || '—') + '</div></div>' +
      (t.detail ? '<div class="drawer-sec"><h4>处理过程</h4><div class="box">' + S.esc(t.detail) + '</div></div>' : '') +
      (t.action ? '<div class="drawer-sec"><h4>处理结果</h4><div class="box ok">' + S.esc(t.action) + '</div></div>' : '') +
      (t.remark ? '<div class="drawer-sec"><h4>备注</h4><div class="box">' + S.esc(t.remark) + '</div></div>' : '') +
      (same.length ?
        '<div class="drawer-sec"><h4>同日同故障同处理（' + same.length + ' 条）</h4><div class="same-list">' +
        same.slice(0, 8).map(function (x) {
          return '<div class="same-item" onclick="Views.dailyLog.detail(\'' + S.esc(x.no) + '\')">' +
            '<span class="mono" style="font-weight:700;color:#0b3d91">' + S.esc(x.room || '—') + '</span>' +
            '<span style="color:var(--faint);font-size:11px">' + S.esc(S.periodInfo(x.period).name) + '</span>' +
            '<span style="margin-left:auto;color:var(--faint);font-size:11px">查看 ›</span></div>';
        }).join('') +
        (same.length > 8 ? '<div style="font-size:11px;color:var(--faint);padding:4px 2px">…等共 ' + same.length + ' 条，可用「批量录入」一次填报</div>' : '') +
        '</div></div>' : '') +
      '<div class="drawer-sec"><h4>时间与人员</h4><div class="drawer-grid">' +
      '<span class="k">登记时间</span><span>' + S.fmtFull(t.createdAt) + '</span>' +
      '<span class="k">处理时长</span><span>' + (t.durationMin != null ? t.durationMin + ' 分钟' : '—') + '</span>' +
      '<span class="k">当前状态</span><span class="tag ' + st.cls + '">' + (st.label || t.status) + '</span>' +
      (si ? '<span class="k">时效</span><span class="tag ' + si.cls + '">' + si.label + '</span>' : '') +
      '</div></div>' +
      '<div class="drawer-sec"><h4>来源与流转</h4><div class="timeline">' +
      flow.map(function (e) {
        return '<div class="tl"><div class="d ' + e[2] + '"></div><div>' +
          '<div class="tt">' + S.esc(e[0]) + '</div><div class="ww">' + S.esc(e[1]) + '</div>' +
          (e[3] ? '<div class="tmm">' + S.esc(e[3]) + '</div>' : '') + '</div></div>';
      }).join('') + '</div></div>',
      '<button class="btn btn-ghost" onclick="Views.dailyLog.copyLog(\'' + S.esc(t.no) + '\')">复制</button>' +
      '<button class="btn btn-ghost" onclick="UI.closeDrawer()">关闭</button>' +
      (['new', 'assigned', 'processing'].indexOf(t.status) >= 0 ?
        '<button class="btn btn-primary" onclick="UI.closeDrawer();Views.dailyLog.fillTicket(\'' + S.esc(t.no) + '\')">填报</button>' : ''));
  }

  // 复制日志内容到剪贴板（兼容 pywebview 无 navigator.clipboard 的环境）
  function copyLog(no) {
    var t = S.findTicket(no);
    if (!t) { U.toast('记录不存在', 'warn'); return; }
    var pi = S.periodInfo(t.period);
    var text = [t.date + ' ' + pi.name + ' · ' + (t.room || '未关联教室') + ' · ' + t.no,
      '阶段：' + (t.stage || '未标注'),
      '工作内容：' + (t.summary || t.desc || '—'),
      t.detail ? '处理过程：' + t.detail : '',
      t.action ? '处理结果：' + t.action : '',
      t.remark ? '备注：' + t.remark : '',
      '责任人：' + (t.assignee || '—')].filter(function (s) { return !!s; }).join('\n');
    var ok = function () { U.toast('已复制该记录内容', 'ok'); };
    var bad = function () { U.toast('复制失败，请手动选择文本', 'warn'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, bad);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : bad(); } catch (e) { bad(); }
      document.body.removeChild(ta);
    }
  }

  // ---------- 表头操作 ----------
  function setDate(d) {
    if (!d) return;
    curDate = d;
    pendPage = 1;
    followPage = 1;
    refresh();
  }
  function saveSheet() { U.toast('数据已实时自动保存，无需手动操作', 'ok'); }
  function exportDay() {
    try {
      var wb = S.buildDailyWorkbook(curDate);
      U.downloadWorkbook(wb.name, wb.sheets);
      U.toast('已导出 ' + wb.name, 'ok');
    } catch (err) { U.toast(err.message || String(err), 'err'); }
  }

  function refresh() { App.render(); }

  window.Views = window.Views || {};
  window.Views.dailyLog = {
    render: render, refresh: refresh,
    setDate: setDate, saveSheet: saveSheet, exportDay: exportDay,
    add: openAdd, addToday: addToday, edit: edit, dup: dup, del: del, detail: detail, copyLog: copyLog, patrolDone: patrolDone,
    saveAdd: saveAdd, syncSub: syncSub, checkRoom: checkRoom, filterQk: filterQk, useQkInForm: useQkInForm,
    stepDuration: stepDuration, setDuration: setDuration, syncDuration: syncDuration,
    fillTicket: fillFromTicket, onAssigneeChanged: onAssigneeChanged,
    batch: openBatch, parseRooms: parseRooms, doBatch: doBatch,
    filterBatchQk: filterBatchQk, useQkInBatch: useQkInBatch,
    pendPageTo: pendPageTo, followPageTo: followPageTo,
    phrases: phrases, qkSet: qkSet, useQkDirect: useQkDirect,
    onFaultChange: onFaultChange, onBatchFaultChange: onBatchFaultChange, onSymptomChange: onSymptomChange,
    fillSymptoms: fillSymptoms, fillSymptomsFor: fillSymptomsFor, askSettleKb: askSettleKb, confirmSettleKb: confirmSettleKb
  };
  window.Views['daily-log'] = window.Views.dailyLog; // 路由键别名
})();
