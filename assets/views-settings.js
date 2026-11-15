/* 基础配置：教室清单 / 故障类型 / 工程师 / 排班 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var roomKw = '';
  var activeTab = 'rooms';
  var curMonth = S.fmtDate(S.nowLocal()).slice(0, 7);  // '2026-11'
  var schedSelected = '';  // 最近点击的日期（Shift 连选的锚点），如 '2026-11-05'
  var schedSel = [];       // 当前选中的日期集合，1 天=单日编辑，≥2 天=批量编辑
  var faultOpen = {};      // 故障类型两级树：按名称记录展开状态

  function buildings() {
    var arr = [];
    S.getState().settings.rooms.forEach(function (r) { if (arr.indexOf(r.building) < 0) arr.push(r.building); });
    return arr;
  }

  function render() {
    var st = S.getState();
    var faultUsed = {};
    st.tickets.forEach(function (t) { faultUsed[t.fault] = (faultUsed[t.fault] || 0) + 1; });
    var engUsed = {};
    st.tickets.forEach(function (t) { if (t.assignee) engUsed[t.assignee] = (engUsed[t.assignee] || 0) + 1; });
    if (activeTab === 'backup') setTimeout(loadBackups, 0);

    var tabs = [
      { k: 'rooms', n: '教室清单', c: st.settings.rooms.length },
      { k: 'faults', n: '故障类型', c: st.settings.faultTypes.length },
      { k: 'engineers', n: '工程师名单', c: st.settings.engineers.filter(function (e) { return e.active !== false; }).length },
      { k: 'roles', n: '角色配置', c: (st.settings.roles || []).length },
      { k: 'stages', n: '日志阶段', c: (st.settings.lessonStages || []).length },
      { k: 'patrol', n: '巡视配置', c: st.settings.patrolItems.length },
      { k: 'schedule', n: '排班日历', c: Object.keys(st.settings.schedule || {}).length },
      { k: 'license', n: '授权信息', c: '' }
    ];
    if (S.isAdmin()) tabs.push({ k: 'backup', n: '数据备份', c: '' });
    var tabsHtml = tabs.map(function (t) {
      return '<button class="' + (activeTab === t.k ? 'on' : '') + '" onclick="Views.settings.switchTab(\'' + t.k + '\')">' + S.esc(t.n) + (t.c !== '' ? '<span class="n">' + t.c + '</span>' : '') + '</button>';
    }).join('');

    return '' +
      '<div class="page-head"><div><div class="page-title">基础配置</div>' +
      '<div class="page-sub">维护教室清单、故障类型字典、工程师名单、角色、巡视计划与检查标准、月度排班；配置仅影响后续新建日志，历史日志保留原值</div></div></div>' +

      '<div class="tabs">' + tabsHtml + '</div>' +

      // Tab 1: 教室清单
      '<div class="tab-pane" id="tab-rooms" style="display:' + (activeTab === 'rooms' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('pin') + '教室清单</h3>' +
      '<span class="more" style="display:flex;gap:6px;align-items:center">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.exportRooms()">' + U.icon('download', 14) + '导出 Excel</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.roomTemplate()">' + U.icon('file', 14) + '下载模板</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.pickRoomFile()">' + U.icon('upload', 14) + '导入 Excel</button>' +
      '<button class="btn btn-primary btn-sm" onclick="Views.settings.roomForm()">' + U.icon('plus') + '新增教室</button>' +
      '<input type="file" id="room-import-file" accept=".xlsx" style="display:none" onchange="Views.settings.roomFile(event)"></span></div>' +
      '<div class="search" style="margin-bottom:8px">' + U.icon('search') + '<input id="room-kw" placeholder="按编号 / 楼栋筛选" value="' + U.esc(roomKw) + '" oninput="Views.settings.searchRoom(this.value)"></div>' +
      '<div class="cfg-list" id="room-list">' + roomsHtml() + '</div>' +
      '<div class="hint">教室按「教学楼 + 区域 + 编号」管理，类型分为普通教室 / 多媒体教室 / 自习室；导入时按「教室编号」查重，相同编号将覆盖原教室信息。</div></div></div>' +

      // Tab 2: 故障类型
      '<div class="tab-pane" id="tab-faults" style="display:' + (activeTab === 'faults' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('tool') + '故障类型 / 故障表现</h3>' +
      '<span class="more" style="display:flex;gap:6px;align-items:center">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.exportFaults()">' + U.icon('download', 14) + '下载</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.faultTemplate()">' + U.icon('file', 14) + '下载模板</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.pickFaultFile()">' + U.icon('upload', 14) + '上传</button>' +
      '<input type="file" id="fault-import-file" accept=".xlsx" style="display:none" onchange="Views.settings.faultFile(event)"></span></div>' +
      '<div style="display:flex;gap:7px;margin-bottom:10px"><input class="input" id="fault-add" placeholder="新增故障类型（一级），如 录播故障" style="flex:1">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.settings.addFault()">' + U.icon('plus') + '添加</button></div>' +
      '<div class="fault-tree">' + st.settings.faultTypes.map(function (f, fi) {
        var open = !!faultOpen[f.name];
        var syms = f.symptoms || [];
        return '<div class="ft-group' + (open ? ' open' : '') + '">' +
          '<div class="ft-head" onclick="Views.settings.toggleFault(' + fi + ')">' +
          '<i class="ft-caret">' + U.icon('arrow', 12) + '</i>' +
          '<i class="ft-dot" style="background:' + f.color + '"></i>' +
          '<span class="ft-name">' + U.esc(f.name) + '</span>' +
          '<span class="ft-count">' + syms.length + ' 表现 · ' + (faultUsed[f.name] || 0) + ' 单</span>' +
          '<span class="acts" onclick="event.stopPropagation()">' +
          '<button title="编辑类型名称" onclick="Views.settings.faultForm(' + fi + ')">' + U.icon('edit', 14) + '</button>' +
          '<button title="删除类型" onclick="Views.settings.removeFault(' + fi + ')">' + U.icon('trash', 14) + '</button></span></div>' +
          (open ? '<div class="ft-body">' +
            (syms.length ? syms.map(function (s, si) {
              return '<div class="ft-item"><span class="ft-text">' + U.esc(s) + '</span>' +
                '<span class="acts"><button title="编辑" onclick="Views.settings.symptomForm(' + fi + ',' + si + ')">' + U.icon('edit', 13) + '</button>' +
                '<button title="删除" onclick="Views.settings.removeSym(' + fi + ',' + si + ')">' + U.icon('trash', 13) + '</button></span></div>';
            }).join('') : '<div class="hint" style="padding:2px 0 8px">暂无故障表现，可在下方添加</div>') +
            '<div class="ft-add"><input class="input" id="sym-add-' + fi + '" placeholder="新增故障表现（二级），如 开机无响应" onkeydown="if(event.key===\'Enter\')Views.settings.addSym(' + fi + ')">' +
            '<button class="btn btn-ghost btn-sm" onclick="Views.settings.addSym(' + fi + ')">' + U.icon('plus') + '添加</button></div>' +
          '</div>' : '') +
        '</div>';
      }).join('') + '</div>' +
      '<div class="hint">故障类型为一级菜单、故障表现为二级菜单；「下载」导出当前字典，「上传」按同名类型合并（新增类型/补充表现，不删除原有表现）；点击类型行展开或收起。</div></div></div>' +

      // Tab 3: 工程师名单
      '<div class="tab-pane" id="tab-engineers" style="display:' + (activeTab === 'engineers' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('users') + '工程师名单</h3><span class="more"><button class="btn btn-ghost btn-sm" onclick="Views.settings.engineerForm()">' + U.icon('plus') + '新增</button></span></div>' +
      '<div class="cfg-list" style="max-height:480px">' + st.settings.engineers.map(function (e) {
        return '<div class="cfg-row">' +
          '<span style="width:26px;height:26px;border-radius:50%;background:#d6e4ff;color:#1677ff;display:grid;place-items:center;font-size:11px;font-weight:600">' + U.esc(e.name.slice(0, 1)) + '</span>' +
          '<div><div style="font-weight:500">' + U.esc(e.name) + (e.active === false ? ' <span class="tag" style="background:#f4f5f7;color:#8f959e">停用</span>' : '') + '</div>' +
          '<div class="meta">' + U.esc((e.buildings || []).join(' / ') || '机动') + ' · ' + U.esc(e.phone || '未留电话') + ' · ' + (engUsed[e.name] || 0) + ' 单</div></div>' +
          '<div class="acts"><button title="编辑" onclick="Views.settings.engineerForm(\'' + U.esc(e.name) + '\')">' + U.icon('edit', 14) + '</button>' +
          '<button title="' + (e.active === false ? '启用' : '停用') + '" onclick="Views.settings.toggleEngineer(\'' + U.esc(e.name) + '\')">' + U.icon(e.active === false ? 'check' : 'close', 14) + '</button>' +
          '<button title="删除" onclick="Views.settings.removeEngineer(\'' + U.esc(e.name) + '\')">' + U.icon('trash', 14) + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="hint">停用后不再出现在指派推荐；删除前需先处理完名下未完结日志。</div></div></div>' +

      // Tab: 角色配置
      '<div class="tab-pane" id="tab-roles" style="display:' + (activeTab === 'roles' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('users') + '角色配置</h3><span class="more" style="cursor:default">' + (st.settings.roles || []).length + ' 个角色</span></div>' +
      '<div style="display:flex;gap:7px;margin-bottom:10px"><input class="input" id="role-add" placeholder="新增角色，如 实习生" style="flex:1">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.settings.addRole()">' + U.icon('plus') + '添加</button></div>' +
      '<div class="cfg-list" style="max-height:400px">' + (st.settings.roles || []).map(function (r) {
        return '<div class="cfg-row"><span style="width:26px;height:26px;border-radius:50%;background:#f0f5ff;color:#2f54eb;display:grid;place-items:center;font-size:11px;font-weight:600">' + U.esc(r.slice(0, 1)) + '</span>' +
          '<span style="font-weight:500">' + U.esc(r) + '</span>' +
          '<div class="acts" style="margin-left:auto"><button title="删除" onclick="Views.settings.removeRole(\'' + U.esc(r) + '\')">' + U.icon('trash', 14) + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="hint">角色用于「用户与权限」中给用户标注身份；删除角色不影响已有账号，历史账号保留原角色名。新建账号时只能从现有角色中选择。</div></div></div>' +

      // Tab 4: 日志阶段
      '<div class="tab-pane" id="tab-stages" style="display:' + (activeTab === 'stages' ? 'block' : 'none') + '">' +
      stagePaneHtml() + '</div>' +

      // Tab 5: 巡视配置
      '<div class="tab-pane" id="tab-patrol" style="display:' + (activeTab === 'patrol' ? 'block' : 'none') + '">' +
      patrolPaneHtml() + '</div>' +

      '<div class="tab-pane" id="tab-schedule" style="display:' + (activeTab === 'schedule' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('calendar') + '月度排班</h3>' +
      '<span class="more" style="display:flex;gap:6px;align-items:center">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.exportSchedule()">' + U.icon('download', 14) + '导出本月</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.scheduleTemplate()">' + U.icon('file', 14) + '下载模板</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.pickScheduleFile()">' + U.icon('upload', 14) + '导入排班</button>' +
      '<input type="file" id="sched-import-file" accept=".xlsx" style="display:none" onchange="Views.settings.scheduleFile(event)"></span></div>' +
      scheduleHtml() + '</div></div>' +

      // Tab 8: 授权信息
      '<div class="tab-pane" id="tab-license" style="display:' + (activeTab === 'license' ? 'block' : 'none') + '">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('shield') + '授权信息</h3></div>' +
      '<div id="lic-box"><div class="hint">正在读取授权信息...</div></div></div></div>' +

      // Tab 7: 数据备份与恢复（仅管理员）
      (S.isAdmin() ?
      '<div class="tab-pane" id="tab-backup" style="display:' + (activeTab === 'backup' ? 'block' : 'none') + '">' +
      backupPaneHtml() + '</div>' : '');
  }

  // ---------- 数据备份 / 恢复 ----------
  function backupPaneHtml() {
    return '<div class="card"><div class="card-head"><h3>' + U.icon('database') + '数据库备份</h3>' +
      '<span class="more"><button class="btn btn-primary btn-sm" id="btn-backup" onclick="Views.settings.doBackup()">' + U.icon('download', 14) + '立即备份</button></span></div>' +
      '<div class="hint" style="margin-bottom:10px">一键生成包含<b>全部数据</b>的备份文件：全部工单与处理记录、日常 / 巡视日志、教室清单与设备台账、用户账号（密码加盐哈希加密存储）、角色权限与系统配置等，可直接用于整站恢复。</div>' +
      '<div id="backup-result"></div></div>' +

      '<div class="card" style="margin-top:12px"><div class="card-head"><h3>' + U.icon('upload') + '从备份恢复</h3>' +
      '<span class="more"><button class="btn btn-ghost btn-sm" style="color:#f5222d" onclick="Views.settings.pickRestoreFile()">' + U.icon('upload', 14) + '选择备份文件并恢复</button>' +
      '<input type="file" id="restore-file" accept=".db" style="display:none" onchange="Views.settings.restoreFile(event)"></span></div>' +
      '<div class="hint">选择本机的 <b>.db</b> 备份文件即可整站恢复。恢复前系统会自动为当前数据生成一份兜底备份，恢复完成后所有登录会话失效，需使用备份中的账号重新登录。</div></div>' +

      '<div class="card" style="margin-top:12px"><div class="card-head"><h3>' + U.icon('shield') + '备份与恢复逻辑说明</h3></div>' +
      '<div style="font-size:12.5px;color:#5a6472;line-height:1.9">' +
      '<b>备份逻辑</b><br>1. 系统全部业务数据保存在单一 SQLite 数据库中，一次备份即生成完整快照；<br>2. 使用 SQLite 在线备份接口生成一致性快照，备份期间不影响正常报修与录入；<br>3. 备份文件双份保存：浏览器自动下载到本机下载目录，服务器同时在数据目录 backups/ 下留存副本；<br>4. 服务器副本最多保留最近 20 份手动备份，更早的自动滚动清理，避免占满磁盘。<br>' +
      '<b style="margin-top:8px;display:inline-block">恢复逻辑</b><br>1. 上传备份文件后先校验文件头与关键表结构，防止误传无关文件；<br>2. 替换前自动为当前数据生成兜底备份（pre_restore_*.db），误操作可回滚；<br>3. 原子替换数据库文件并自动执行结构升级，兼容旧版本生成的备份；<br>4. 恢复后原登录会话全部失效，需使用备份内的账号密码重新登录。</div></div>' +

      '<div class="card" style="margin-top:12px"><div class="card-head"><h3>' + U.icon('download') + '本机桌面图标</h3>' +
      '<span class="more"><button class="btn btn-ghost btn-sm" onclick="App.createShortcut()">' + U.icon('download', 14) + '创建桌面快捷方式</button></span></div>' +
      '<div class="hint">给当前这台电脑生成一个「' + U.esc('东华大学多媒体教室运维系统') + '」桌面图标，双击直接进入系统，省去开浏览器输网址。' +
      '服务器本机会写入公共桌面；局域网内其他电脑会下载一个 .url 文件，拖到桌面即可。地址变更后重新生成一次。</div></div>' +

      '<div class="card" style="margin-top:12px"><div class="card-head"><h3>' + U.icon('file') + '服务器备份记录</h3>' +
      '<span class="more"><button class="btn btn-ghost btn-sm" onclick="Views.settings.loadBackups()">' + U.icon('refresh', 14) + '刷新</button></span></div>' +
      '<div id="backup-list"><div class="empty" style="padding:18px">加载中…</div></div></div>';
  }

  function loadBackups() {
    var box = document.getElementById('backup-list');
    if (!box) return;
    box.innerHTML = '<div class="empty" style="padding:18px">加载中…</div>';
    S.listDbBackups().then(function (res) {
      var rows = (res.files || []).map(function (f) {
        return '<div class="cfg-row">' +
          '<span style="width:26px;height:26px;border-radius:8px;background:' + (f.auto ? '#fff7e6' : '#e6f4ff') + ';color:' + (f.auto ? '#d48806' : '#1677ff') + ';display:grid;place-items:center">' + U.icon(f.auto ? 'shield' : 'database', 14) + '</span>' +
          '<div><div style="font-weight:500;font-size:12.5px">' + U.esc(f.name) + (f.auto ? ' <span class="tag" style="background:#fff7e6;color:#d48806">恢复前自动备份</span>' : '') + '</div>' +
          '<div class="meta">' + U.esc(f.time) + ' · ' + (f.size / 1024).toFixed(1) + ' KB</div></div></div>';
      }).join('');
      box.innerHTML = '<div class="hint" style="margin-bottom:8px">服务器保存位置：<code>' + U.esc(res.dir || '') + '</code></div>' +
        (rows || '<div class="empty" style="padding:18px">暂无备份记录</div>');
    }).catch(function (e) {
      box.innerHTML = '<div class="empty" style="padding:18px">' + U.esc(e.message || '加载失败') + '</div>';
    });
  }

  function doBackup() {
    var btn = document.getElementById('btn-backup');
    if (btn) { btn.disabled = true; btn.innerHTML = '正在备份…'; }
    S.createDbBackup().then(function (info) {
      var el = document.getElementById('backup-result');
      if (el) el.innerHTML = '<div class="hint" style="background:#f6ffed;border:1px solid #b7eb8f;border-radius:8px;padding:10px 12px;color:#389e0d">' +
        U.icon('check', 14) + ' 备份完成，浏览器已开始下载 <b>' + U.esc(info.name) + '</b><br>' +
        '<span style="color:#5a6472">服务器留存副本：<code>' + U.esc(info.path || '') + '</code></span></div>';
      U.toast('备份完成，已提示保存位置');
      loadBackups();
    }).catch(function (e) {
      U.toast(e.message || '备份失败');
    }).then(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = U.icon('download', 14) + '立即备份'; }
    });
  }

  function pickRestoreFile() {
    var el = document.getElementById('restore-file');
    if (el) el.click();
  }

  function restoreFile(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    U.confirm('从备份恢复',
      '将用备份文件 <b>' + U.esc(f.name) + '</b>（' + (f.size / 1024).toFixed(1) + ' KB）覆盖当前系统的<b>全部数据</b>（工单、日志、教室、账号、配置）。<br>恢复前会自动为当前数据生成兜底备份；<b style="color:#f5222d">恢复后所有登录会话失效，需重新登录。</b>',
      function () {
        U.toast('正在恢复数据…');
        S.restoreDbBackup(f).then(function (res) {
          U.toast(res.message || '恢复完成，请重新登录');
          setTimeout(function () { S.logout(); location.reload(); }, 1500);
        }).catch(function (err) {
          U.toast(err.message || '恢复失败');
        });
      }, '立即恢复', true);
  }


  // ---------- 日志阶段配置 ----------
  function stagePaneHtml() {
    var st = S.getState();
    var list = st.settings.lessonStages || [];
    var def = st.settings.defaultStage || '';
    var rows = list.map(function (s, i) {
      return '<div class="cfg-row">' +
        '<button class="btn ' + (s === def ? 'btn-primary' : 'btn-ghost') + ' btn-sm" style="min-width:74px" onclick="Views.settings.setDefaultStage(' + i + ')">' +
          (s === def ? '默认' : '设为默认') + '</button>' +
        '<input class="inp sm" style="flex:1" value="' + S.esc(s) + '" onchange="Views.settings.renameStage(' + i + ', this.value)">' +
        '<div class="acts"><button title="删除" onclick="Views.settings.removeStage(' + i + ')">' + U.icon('trash', 14) + '</button></div></div>';
    }).join('');
    return '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '日志阶段</h3>' +
      '<span class="more" style="cursor:default">' + list.length + ' 项 · 默认：' + S.esc(def || '—') + '</span></div>' +
      '<div style="display:flex;gap:7px;margin-bottom:10px"><input class="input" id="stage-add" placeholder="新增阶段，如 午间维护" style="flex:1">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.settings.addStage()">' + U.icon('plus') + '添加</button></div>' +
      '<div class="cfg-list" style="max-height:400px">' + (rows || '<div class="empty" style="padding:18px">暂无阶段</div>') + '</div>' +
      '<div class="hint">「新增记录」时可从这些阶段中选择，默认选中「' + S.esc(def || '—') + '」。改名只影响后续新建日志，历史记录保留原阶段名称；没有阶段的历史记录显示「未标注」。</div></div>';
  }

  function stageList() { return (S.getState().settings.lessonStages || []).slice(); }
  function saveStages(list, def) {
    try {
      S.updateLessonStages(list, def);
      U.toast('日志阶段配置已保存', 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function addStage() {
    var v = fieldVal('stage-add');
    if (!v) { U.toast('请填写阶段名称', 'warn'); return; }
    var list = stageList();
    if (list.indexOf(v) >= 0) { U.toast('阶段已存在', 'warn'); return; }
    list.push(v);
    saveStages(list, S.getState().settings.defaultStage);
  }
  function renameStage(i, v) {
    var list = stageList();
    var old = list[i];
    if (old === undefined) return;
    v = String(v || '').trim();
    if (!v) { U.toast('阶段名称不能为空', 'warn'); App.render(); return; }
    if (v !== old && list.indexOf(v) >= 0) { U.toast('阶段已存在', 'warn'); App.render(); return; }
    list[i] = v;
    saveStages(list, S.getState().settings.defaultStage === old ? v : S.getState().settings.defaultStage);
  }
  function removeStage(i) {
    var list = stageList();
    if (list.length <= 1) { U.toast('至少保留一个阶段', 'warn'); return; }
    var name = list[i];
    U.confirm('删除阶段', '确定删除阶段「<b>' + U.esc(name) + '</b>」？历史日志保留原阶段名称。', function () {
      list = stageList();
      var idx = list.indexOf(name);
      if (idx >= 0) list.splice(idx, 1);
      saveStages(list, S.getState().settings.defaultStage);
    }, '删除', true);
  }
  function setDefaultStage(i) {
    var list = stageList();
    if (!list[i]) return;
    saveStages(list, list[i]);
  }

  // ---------- 巡视配置 ----------
  function patrolPaneHtml() {
    var st = S.getState();
    var periods = st.settings.patrolPeriods;
    var items = st.settings.patrolItems;
    var periodHtml = periods.map(function (p, i) {
      return '<div style="border:1px solid #e5e6eb;border-radius:8px;padding:12px">' +
        '<div style="font-weight:700;margin-bottom:8px;color:' + p.color + '">' + (i + 1) + '. ' + S.esc(p.name) + '巡检</div>' +
        '<div class="hint" style="margin:0 0 2px">时段名称</div>' +
        '<input id="pp-name-' + p.key + '" class="inp sm" style="width:100%;margin-bottom:8px" value="' + S.esc(p.name) + '">' +
        '<div class="hint" style="margin:0 0 2px">时间段（如 7:30-11:30）</div>' +
        '<input id="pp-time-' + p.key + '" class="inp sm" style="width:100%;margin-bottom:8px" value="' + S.esc(p.time) + '">' +
        '<div class="hint" style="margin:0 0 2px">巡视范围</div>' +
        '<input id="pp-plan-' + p.key + '" class="inp sm" style="width:100%;margin-bottom:8px" value="' + S.esc(p.plan) + '">' +
        '<div class="hint" style="margin:0 0 2px">计划说明（巡检日志的默认描述）</div>' +
        '<textarea id="pp-patrol-' + p.key + '" class="inp" style="width:100%;height:62px;resize:vertical">' + S.esc(p.patrol) + '</textarea>' +
      '</div>';
    }).join('');

    var itemHtml = items.map(function (it, i) {
      return '<div class="patrol-item-row" data-pkey="' + S.esc(it.key) + '" style="display:grid;grid-template-columns:26px minmax(0,1fr) minmax(0,1.6fr) auto;gap:8px;align-items:center;margin-bottom:8px">' +
        '<span class="std-no">' + (i + 1) + '</span>' +
        '<input class="inp sm pi-name" value="' + S.esc(it.name) + '" placeholder="检查项名称">' +
        '<input class="inp sm pi-std" value="' + S.esc(it.std) + '" placeholder="检查标准">' +
        '<button class="btn btn-danger-ghost btn-sm" onclick="Views.settings.removePatrolItem(\'' + S.esc(it.key) + '\')">删除</button>' +
      '</div>';
    }).join('');

    return '<div class="card"><div class="card-head"><h3>' + U.icon('check') + '每日巡视计划</h3>' +
      '<span class="more">配置巡视管理页每个时段的名称、时间、巡视范围与计划说明</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">' + periodHtml + '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('check') + '巡视检查标准</h3>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.addPatrolItem()">+ 新增检查项</button></div>' +
      '<div>' + itemHtml + '</div>' +
      '<div class="hint">修改后，巡视打卡弹窗与「巡视检查标准」卡片立即使用新标准；已打卡的历史记录保留当时结果。</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '正常打卡默认内容</h3>' +
      '<span class="more">全部检查项正常时写入巡检日志</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div><div class="hint" style="margin:0 0 2px">默认工作内容</div>' +
      '<input id="pd-summary" class="inp sm" style="width:100%" value="' + S.esc(st.settings.patrolNormalSummary) + '"></div>' +
      '<div><div class="hint" style="margin:0 0 2px">默认处理结果</div>' +
      '<input id="pd-action" class="inp sm" style="width:100%" value="' + S.esc(st.settings.patrolNormalAction) + '"></div>' +
      '</div>' +
      '<div class="hint">可用占位符：{时段}（上午/下午/晚上）、{日期}（2026-11-07）、{项数}（当前检查项总数）。</div></div>' +

      '<div style="margin-top:4px"><button class="btn btn-primary" onclick="Views.settings.savePatrolConfig()">' + U.icon('check') + '保存巡视配置</button></div>';
  }

  function fieldVal(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }

  function collectPatrolConfig() {
    var periods = S.PERIODS.map(function (p) {
      return { key: p.key, name: fieldVal('pp-name-' + p.key), time: fieldVal('pp-time-' + p.key), plan: fieldVal('pp-plan-' + p.key), patrol: fieldVal('pp-patrol-' + p.key) };
    });
    var items = [];
    var rows = document.querySelectorAll('#tab-patrol .patrol-item-row');
    for (var i = 0; i < rows.length; i++) {
      items.push({
        key: rows[i].getAttribute('data-pkey'),
        name: (rows[i].querySelector('.pi-name') || {}).value || '',
        std: (rows[i].querySelector('.pi-std') || {}).value || ''
      });
    }
    return { periods: periods, items: items, normalSummary: fieldVal('pd-summary'), normalAction: fieldVal('pd-action') };
  }

  function savePatrolConfig() {
    try {
      S.updatePatrolConfig(collectPatrolConfig());
      U.toast('巡视配置已保存，巡视管理页立即生效', 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function addPatrolItem() {
    try {
      var cfg = collectPatrolConfig();
      cfg.items.push({ key: 'pi' + Date.now(), name: '新检查项', std: '请填写检查标准' });
      S.updatePatrolConfig(cfg);
      U.toast('已新增检查项，可继续修改名称与标准后保存', 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function removePatrolItem(key) {
    try {
      var cfg = collectPatrolConfig();
      if (cfg.items.length <= 1) throw new Error('至少保留一个巡视检查项');
      cfg.items = cfg.items.filter(function (it) { return it.key !== key; });
      S.updatePatrolConfig(cfg);
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function scheduleHtml() {
    // 生成月历
    var year = parseInt(curMonth.slice(0, 4), 10);
    var month = parseInt(curMonth.slice(5, 7), 10);
    var first = new Date(year, month - 1, 1);
    var firstDay = first.getDay();  // 0=Sun
    var daysInMonth = new Date(year, month, 0).getDate();
    var todayStr = S.fmtDate(S.nowLocal());
    var sched = S.getScheduleRange(curMonth);
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    var cells = [];

    // 前置空格
    for (var i = 0; i < firstDay; i++) cells.push('<div class="sched-cell empty"></div>');
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = curMonth + '-' + S.pad(d);
      var list = sched[ds] || [];
      var isToday = ds === todayStr;
      var isSel = schedSel.indexOf(ds) >= 0;
      cells.push('<div class="sched-cell' + (isSel ? ' selected' : '') + '" onclick="Views.settings.schedPick(\'' + ds + '\', event)">' +
        '<div class="d"><span class="' + (isToday ? 'today' : '') + '">' + d + '</span></div>' +
        (list.length ? '<div class="s">' +
          (list.length <= 3 ? list.map(function (n) { return '<span>' + S.esc(n) + '</span>'; }).join('') :
            list.slice(0, 2).map(function (n) { return '<span>' + S.esc(n) + '</span>'; }).join('') +
            '<span class="more">+' + (list.length - 2) + ' 人</span>') +
          '</div>' : '<div class="s" style="color:#b9bec7;font-size:11px">—</div>') +
        '</div>');
    }

    var editorHtml = '';
    var engs = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    if (schedSel.length === 1) {
      var selDay = schedSel[0];
      var curList = sched[selDay] || [];
      // 上一天
      var selDate = new Date(selDay);
      var prev = new Date(selDate); prev.setDate(prev.getDate() - 1);
      var prevDS = S.dateKey(prev);
      var prevList = sched[prevDS] || [];
      var canCopyPrev = prevList.length > 0;
      editorHtml = '<div class="sched-editor">' +
        '<div class="se-title"><span>' + U.icon('calendar') + '</span>编辑 <span class="se-date">' + selDay + '</span> 的排班工程师' +
        '<span class="hint" style="font-weight:400">Ctrl+点击可多选日期，Shift+点击连选区间</span></div>' +
        '<div class="se-current"><span>当前：</span>' +
        (curList.length ? curList.map(function (n) { return '<span>' + S.esc(n) + '<b onclick="Views.settings.schedRemove(\'' + selDay + '\',\'' + S.esc(n) + '\')" title="移除">×</b></span>'; }).join('') :
        '<span style="background:#fff3e0;border:1px dashed #ffbb96;color:#d46b08">未排班（默认所有 active 工程师）</span>') +
        '</div>' +
        '<div class="se-pick">' + engs.map(function (e) {
          var on = curList.indexOf(e.name) >= 0;
          return '<span class="pick' + (on ? ' on' : '') + '" onclick="Views.settings.schedToggle(\'' + selDay + '\',\'' + S.esc(e.name) + '\')">' + S.esc(e.name) + '</span>';
        }).join('') + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedClear(\'' + selDay + '\')">清空排班</button>' +
        (canCopyPrev ? '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedCopyPrev(\'' + selDay + '\',\'' + prevDS + '\')">' + U.icon('arrow') + '复制 ' + prevDS + ' 排班</button>' : '') +
        '</div></div>';
    } else if (schedSel.length > 1) {
      var sorted = schedSel.slice().sort();
      editorHtml = '<div class="sched-editor">' +
        '<div class="se-title"><span>' + U.icon('calendar') + '</span>批量编辑 <span class="se-date">已选 ' + sorted.length + ' 天</span>' +
        '<span class="hint" style="font-weight:400">Ctrl+点击增删日期，Shift+点击连选区间</span></div>' +
        '<div class="se-current">' + sorted.map(function (ds2) {
          return '<span>' + ds2.slice(5) + '<b onclick="Views.settings.schedUnsel(\'' + ds2 + '\')" title="移出选择">×</b></span>';
        }).join('') + '</div>' +
        '<div class="se-pick" id="m-picks">' + engs.map(function (e) {
          return '<span class="pick" data-n="' + S.esc(e.name) + '" onclick="this.classList.toggle(\'on\')">' + S.esc(e.name) + '</span>';
        }).join('') + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-primary btn-sm" onclick="Views.settings.schedApplyMulti()">' + U.icon('check', 14) + '应用到所选 ' + sorted.length + ' 天</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedClearMulti()">批量清空</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedSelReset()">取消选择</button>' +
        '</div>' +
        '<div class="hint" style="margin-top:6px">应用后将覆盖所选日期原有排班</div>' +
        '</div>';
    }

    // 导航（前后月份）
    var prevMonth = new Date(year, month - 2, 1);
    var nextMonth = new Date(year, month, 1);
    var prevYM = prevMonth.getFullYear() + '-' + S.pad(prevMonth.getMonth() + 1);
    var nextYM = nextMonth.getFullYear() + '-' + S.pad(nextMonth.getMonth() + 1);

    return '<div class="sched-wrap">' +
      '<div class="sched-header">' +
        '<div class="sched-nav">' +
          '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedMonth(\'' + prevYM + '\')">' + U.icon('arrow') + '</button>' +
          '<span class="sched-month">' + year + ' 年 ' + month + ' 月</span>' +
          '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedMonth(\'' + nextYM + '\')">' + U.icon('arrow') + '</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="Views.settings.schedMonth(\'' + S.fmtDate(S.nowLocal()).slice(0, 7) + '\')" style="margin-left:8px">本月</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<button class="btn btn-primary btn-sm" onclick="Views.settings.batchOpen()">' + U.icon('zap') + '批量排班</button>' +
          '<span class="hint">每天可排多人；Ctrl+点击多选日期，Shift+点击连选区间，可批量排班</span>' +
        '</div>' +
      '</div>' +
      '<div class="sched-cal">' +
        weekdays.map(function (w) { return '<div class="sched-wk">' + w + '</div>'; }).join('') +
        cells.join('') +
      '</div>' +
      editorHtml +
    '</div>';
  }

  // ---------- 教室清单 / 排班日历：导入导出 ----------
  function readXlsx(file, cb) {
    if (!/\.xlsx$/i.test(file.name)) { U.toast('仅支持 .xlsx 文件', 'err'); return; }
    if (!U.hasXLSX()) {
      U.ensureXLSX().then(function () { readXlsx(file, cb); }, function () {});
      return;
    }
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

  function exportRooms() {
    var wb = S.buildRoomsWorkbook();
    if (U.downloadWorkbook('教室清单_' + S.fmtDate(S.nowLocal()) + '.xlsx', wb)) {
      U.toast('教室清单已导出（含字体、底色与表头样式）', 'ok');
    }
  }
  function roomTemplate() {
    var wb = S.buildRoomsWorkbook(true);
    if (U.downloadWorkbook('教室清单导入模板.xlsx', wb)) {
      U.toast('模板已下载：按表头填写后即可批量导入，相同编号会覆盖原教室', 'ok');
    }
  }
  function pickRoomFile() {
    var el = document.getElementById('room-import-file');
    if (el) el.click();
  }
  function roomFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    readXlsx(file, function (wb) {
      var p = S.previewRoomImport(wb);
      if (!p.items.length) { U.toast('未识别到教室数据，请使用「下载模板」中的表头（需包含 教室编号）', 'err'); return; }
      var msg = '共解析 <b>' + p.total + '</b> 行：新增 <b>' + p.added + '</b> 间，覆盖 <b>' + p.updated + '</b> 间' +
        (p.skipped ? '，跳过 ' + p.skipped + ' 行（缺少教室编号）' : '') +
        '。<br>教室编号相同的记录将以本次上传内容为准。';
      U.confirm('导入教室清单', msg, function () {
        var r = S.commitRoomImport(p.items);
        U.toast('已导入教室清单：新增 ' + r.added + ' 间，覆盖 ' + r.updated + ' 间', 'ok');
        App.render();
      }, '确认导入');
    });
  }

  function scheduleTitle() {
    return parseInt(curMonth.slice(0, 4), 10) + '年' + parseInt(curMonth.slice(5, 7), 10) + '月';
  }
  function exportSchedule() {
    var wb = S.buildScheduleWorkbook(curMonth, false);
    if (U.downloadWorkbook('排班日历_' + scheduleTitle() + '.xlsx', wb)) {
      U.toast('本月排班已导出（' + scheduleTitle() + '）', 'ok');
    }
  }
  function scheduleTemplate() {
    var wb = S.buildScheduleWorkbook(curMonth, true);
    if (U.downloadWorkbook('排班日历导入模板_' + scheduleTitle() + '.xlsx', wb)) {
      U.toast('排班模板已下载：在「值班工程师」列填写姓名即可批量排班', 'ok');
    }
  }
  function pickScheduleFile() {
    var el = document.getElementById('sched-import-file');
    if (el) el.click();
  }
  function scheduleFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    readXlsx(file, function (wb) {
      var p = S.previewScheduleImport(wb, curMonth);
      if (!p.items.length) { U.toast('未识别到排班数据，请使用「下载模板」中的表头（日期 / 值班工程师）', 'err'); return; }
      var msg = '共解析 <b>' + p.total + '</b> 天：新增 <b>' + p.added + '</b> 天，覆盖 <b>' + p.overwritten + '</b> 天' +
        (p.skipped ? '，跳过 ' + p.skipped + ' 行（日期格式不正确或缺少日期）' : '') +
        (p.unknown.length ? '<br>以下姓名不在工程师名单中：' + U.esc(p.unknown.slice(0, 6).join('、')) + (p.unknown.length > 6 ? ' 等' : '') : '') +
        '。<br>同一日期重复上传时以本次内容为准。';
      U.confirm('导入排班日历', msg, function () {
        var r = S.commitScheduleImport(p.items);
        U.toast('已导入排班：新增 ' + r.added + ' 天，覆盖 ' + r.overwritten + ' 天', 'ok');
        App.render();
      }, '确认导入');
    });
  }

  function switchTab(name) {
    activeTab = name;
    App.render();
    if (name === 'backup') loadBackups();
    if (name === 'license') loadLicense();
  }

  // ---------- 授权信息 ----------
  var licCache = null;

  function loadLicense() {
    var box = document.getElementById('lic-box');
    if (box) box.innerHTML = '<div class="hint">正在读取授权信息...</div>';
    S.licenseStatus().then(function (st) { licCache = st; renderLicense(st); })
      .catch(function (e) { if (box) box.innerHTML = '<div class="hint">读取失败：' + U.esc(e.message || e) + '</div>'; });
  }

  function licStateMeta(st) {
    var map = {
      valid: { t: '已授权', c: '#389e0d', bg: '#f6ffed' },
      trial: { t: '授权有效', c: '#d46b08', bg: '#fff7e6' },
      grace: { t: '已到期 · 宽限期（只读）', c: '#d4380d', bg: '#fff2e8' },
      expired: { t: '已过期 · 停止服务', c: '#cf1322', bg: '#fff1f0' },
      invalid: { t: '授权异常', c: '#cf1322', bg: '#fff1f0' }
    };
    return map[st.state] || map.invalid;
  }

  function renderLicense(st) {
    var box = document.getElementById('lic-box');
    if (!box) return;
    var m = licStateMeta(st);
    var days = st.days_left;
    var daysTxt;
    if (st.state === 'expired') {
      daysTxt = '已过期 ' + Math.abs(days) + ' 天';
    } else if (st.state === 'grace') {
      daysTxt = '宽限期剩余 ' + (7 - Math.abs(days)) + ' 天';
    } else if (days <= 30) {
      daysTxt = '即将到期 · 请续期';
    } else {
      daysTxt = '有效期至 ' + (st.expires || '—');
    }
    var row = function (k, v) {
      return '<div class="cfg-row"><span style="color:#646a73">' + k + '</span><span style="margin-left:auto;font-weight:600">' + v + '</span></div>';
    };
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="background:' + m.bg + ';color:' + m.c + ';border-radius:4px;padding:3px 10px;font-size:12.5px;font-weight:600">' + m.t + '</span>' +
      '<span style="font-size:13px;color:#646a73">' + U.esc(st.org || '—') + ' · ' + U.esc(st.edition || '—') + ' · ' + daysTxt + '</span></div>' +
      (st.reason ? '<div class="hint" style="color:' + m.c + ';margin-bottom:8px">' + U.esc(st.reason) + '</div>' : '') +
      '<div class="cfg-list">' +
      row('授权单位', U.esc(st.org || '—')) +
      row('版本 / 用户数', U.esc(st.edition || '—') + ' · ' + (st.max_users || '—') + ' 用户') +
      row('有效期', U.esc(st.issued || '—') + ' 至 <b>' + U.esc(st.expires || '—') + '</b>') +
      row('本机机器码', '<span class="mono" id="lic-machine" style="font-size:13px;font-weight:700;letter-spacing:.5px">' + U.esc(st.machine || '—') + '</span>') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.settings.copyMachineCode()">' + U.icon('file', 14) + '复制机器码</button>' +
      (S.isAdmin() ? '<button class="btn btn-primary btn-sm" onclick="Views.settings.licenseForm()">' + U.icon('upload', 14) + '导入授权文件</button>' : '') +
      '</div>' +
      '<div class="hint" style="margin-top:10px">续期方式：把上面的「本机机器码」发给厂商，厂商签发授权后用「导入授权文件」选择文件并保存即可，无需重装系统。</div>';
  }

  function copyMachineCode() {
    var st = licCache;
    if (!st || !st.machine) { U.toast('暂无可复制的机器码', 'warn'); return; }
    var done = function () { U.toast('机器码已复制：' + st.machine, 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(st.machine).then(done, function () { U.toast('复制失败，请手动选择文本', 'warn'); });
    } else {
      U.toast('机器码：' + st.machine, 'ok');
    }
  }

  function licenseForm() {
    var body =
      '<div class="fr"><label>选择授权文件<span class="lbl-note">直接选择厂商发来的 license.json，内容会自动填入下方</span></label>' +
      '<input type="file" class="inp" id="lic-file" accept=".json,.lic,.txt,application/json"></div>' +
      '<div class="fr"><label>授权文件内容<span class="lbl-note">也可把内容整段粘贴到这里</span></label>' +
      '<textarea class="inp" id="lic-text" rows="9" placeholder=\'{"v":1,"org":"东华大学",...}\' style="font-family:ui-monospace,Consolas,monospace;font-size:12px"></textarea></div>' +
      '<div class="hint">导入前会校验签名与机器码；校验不通过不会覆盖现有授权。</div>';
    U.modal('导入授权文件', body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.settings.saveLicense()">校验并导入</button>');
    var picker = document.getElementById('lic-file');
    if (picker) picker.addEventListener('change', function () { readLicenseFile(picker); });
  }

  // 选择授权文件后读入文本框，导入流程与手工粘贴完全一致
  function readLicenseFile(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { U.toast('授权文件过大，请确认文件是否正确', 'err'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '').replace(/^\uFEFF/, '').trim();
      var ta = document.getElementById('lic-text');
      if (ta) ta.value = text;
      if (text) U.toast('已读取 ' + f.name + '，点「校验并导入」完成导入', 'ok');
      else U.toast('文件内容为空，请重新选择', 'warn');
    };
    reader.onerror = function () { U.toast('文件读取失败，请重试或改为粘贴内容', 'err'); };
    reader.readAsText(f, 'utf-8');
  }

  function saveLicense() {
    var el = document.getElementById('lic-text');
    var text = el ? el.value.trim() : '';
    if (!text) { U.toast('请选择授权文件或粘贴授权内容', 'warn'); return; }
    S.licenseImport(text).then(function (r) {
      U.toast('授权导入成功：' + (r.license && r.license.org ? r.license.org : ''), 'ok');
      UI.closeModal();
      loadLicense();
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function (e) { U.toast(e.message || '导入失败', 'err'); });
  }

  function schedMonth(ym) {
    curMonth = ym;
    schedSelected = '';
    schedSel = [];
    App.render();
  }
  function schedPick(date, ev) {
    ev = ev || window.event || {};
    if (ev.shiftKey && schedSelected && schedSelected !== date) {
      // Shift+点击：以上次点击日期为锚点连选区间（仅限当前月份）
      var d1 = new Date(schedSelected), d2 = new Date(date);
      if (d1 > d2) { var tmp = d1; d1 = d2; d2 = tmp; }
      for (var d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
        var ds = S.dateKey(d);
        if (ds.indexOf(curMonth) === 0 && schedSel.indexOf(ds) < 0) schedSel.push(ds);
      }
    } else if (ev.ctrlKey || ev.metaKey) {
      // Ctrl+点击：把该日加入/移出多选集合
      var i = schedSel.indexOf(date);
      if (i >= 0) schedSel.splice(i, 1); else schedSel.push(date);
      schedSelected = date;
    } else {
      // 普通点击：单选
      schedSel = [date];
      schedSelected = date;
    }
    App.render();
  }
  function schedUnsel(date) {
    var i = schedSel.indexOf(date);
    if (i >= 0) schedSel.splice(i, 1);
    App.render();
  }
  function schedSelReset() {
    schedSel = [];
    schedSelected = '';
    App.render();
  }
  function schedApplyMulti() {
    var names = [];
    document.querySelectorAll('#m-picks .pick.on').forEach(function (el) { names.push(el.dataset.n); });
    if (!names.length) { U.toast('请选择至少一名工程师', 'err'); return; }
    try {
      var count = S.batchScheduleDates(schedSel, names);
      U.toast('已将 ' + names.join('、') + ' 应用到 ' + count + ' 天的排班', 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function schedClearMulti() {
    U.confirm('批量清空排班', '确定清空所选 <b>' + schedSel.length + '</b> 天的排班？清空后这些日期默认显示所有 active 工程师。', function () {
      try {
        var count = S.batchClearSchedule(schedSel);
        U.toast('已清空 ' + count + ' 天的排班', 'ok');
        App.render();
      } catch (e) { U.toast(e.message, 'err'); }
    }, '清空', true);
  }
  function schedToggle(date, name) {
    var sched = S.getScheduleRange(curMonth);
    var list = (sched[date] || []).slice();
    var idx = list.indexOf(name);
    if (idx >= 0) list.splice(idx, 1); else list.push(name);
    S.setSchedule(date, list);
    App.render();
  }
  function schedRemove(date, name) {
    var sched = S.getScheduleRange(curMonth);
    var list = (sched[date] || []).slice();
    var idx = list.indexOf(name);
    if (idx >= 0) { list.splice(idx, 1); S.setSchedule(date, list); }
    App.render();
  }
  function schedClear(date) {
    U.confirm('清空排班', '确定清空 <b>' + S.esc(date) + '</b> 的排班？清空后当日默认显示所有 active 工程师。', function () {
      S.setSchedule(date, []);
      App.render();
    }, '清空', true);
  }
  function schedCopyPrev(date, prevDate) {
    try {
      var list = S.copySchedule(prevDate, date);
      U.toast('已从 ' + prevDate + ' 复制排班：' + list.join('、'), 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  // 批量排班弹窗
  function batchOpen() {
    var today = S.fmtDate(S.nowLocal());
    var monthStart = curMonth + '-01';
    var engs = S.getState().settings.engineers.filter(function (e) { return e.active !== false; });
    U.modal('批量排班',
      '<div class="form">' +
      '<div class="alert info">选中的日期范围将统一设置相同的排班工程师；已有的排班会被覆盖。</div>' +
      '<div class="row-2"><div class="field"><label>起始日期</label><input class="input" id="b-from" type="date" value="' + monthStart + '"></div>' +
      '<div class="field"><label>结束日期</label><input class="input" id="b-to" type="date" value="' + curMonth + '-31"></div></div>' +
      '<div class="hint" style="margin-bottom:8px">快捷：' +
      '<a href="javascript:Views.settings.batchSet(\'' + monthStart + '\',\'' + curMonth + '-31\')" style="color:#1677ff;margin-right:12px">本月全部</a>' +
      '<a href="javascript:Views.settings.batchSet(\'' + today + '\',\'' + today + '\')" style="color:#1677ff;margin-right:12px">仅今天</a>' +
      '</div>' +
      '<div class="field"><label>排班工程师（点击 toggle，可多选）</label>' +
      '<div class="pick-row" id="b-picks">' + engs.map(function (e) {
        return '<span class="pick" data-n="' + S.esc(e.name) + '" onclick="this.classList.toggle(\'on\')">' + S.esc(e.name) + '</span>';
      }).join('') + '</div></div>' +
      '</div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.settings.batchSave()">确认批量设置</button>');
  }
  function batchSet(from, to) {
    document.getElementById('b-from').value = from;
    document.getElementById('b-to').value = to;
  }
  function batchSave() {
    var from = document.getElementById('b-from').value;
    var to = document.getElementById('b-to').value;
    var names = [];
    document.querySelectorAll('#b-picks .pick.on').forEach(function (el) { names.push(el.dataset.n); });
    if (!from || !to) { U.toast('请选择日期范围', 'err'); return; }
    if (!names.length) { U.toast('请选择至少一名工程师', 'err'); return; }
    try {
      var count = S.batchSchedule(from, to, names);
      U.closeModal();
      U.toast('已批量设置 ' + count + ' 天的排班：' + names.join('、'), 'ok');
      App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  // ===== 教室 / 故障 / 工程师（原有函数） =====
  function roomsHtml() {
    var st = S.getState();
    var list = st.settings.rooms.filter(function (r) {
      if (!roomKw) return true;
      var k = roomKw.toLowerCase();
      return (r.no + ' ' + r.building + ' ' + (r.zone || '') + ' ' + (r.roomType || '')).toLowerCase().indexOf(k) >= 0;
    }).slice(0, 120);
    if (!list.length) return '<div style="padding:20px;text-align:center;color:#b9bec7;font-size:12px">没有匹配的教室</div>';
    return list.map(function (r) {
      return '<div class="cfg-row"><b>' + U.esc(r.no) + '</b><span class="meta">' + U.esc(r.building) +
        (r.zone ? ' · ' + U.esc(r.zone) : '') +
        (r.roomType ? ' · ' + U.esc(r.roomType) : '') +
        (r.capacity ? ' · ' + r.capacity + ' 座' : '') + '</span>' +
        (r.active === false ? '<span class="tag" style="background:#f4f5f7;color:#8f959e">停用</span>' : '') +
        '<div class="acts"><button title="编辑" onclick="Views.settings.roomForm(\'' + U.esc(r.no) + '\')">' + U.icon('edit', 14) + '</button>' +
        '<button title="' + (r.active === false ? '启用' : '停用') + '" onclick="Views.settings.toggleRoom(\'' + U.esc(r.no) + '\')">' + U.icon(r.active === false ? 'check' : 'close', 14) + '</button>' +
        '<button title="删除" onclick="Views.settings.removeRoom(\'' + U.esc(r.no) + '\')">' + U.icon('trash', 14) + '</button></div></div>';
    }).join('') + (st.settings.rooms.length > 120 && !roomKw ? '<div class="hint" style="padding:8px">仅显示前 120 间，可用搜索定位</div>' : '');
  }

  function searchRoom(v) {
    roomKw = v;
    document.getElementById('room-list').innerHTML = roomsHtml();
  }

  var BUILDING_OPTS = ['一教', '二教', '三教', '四教', '化工楼', '中南楼', '机房', '其他'];

  function roomForm(no) {
    var r = no ? S.getState().settings.rooms.filter(function (x) { return x.no === no; })[0] : null;
    if (no && !r) return;
    var bOpts = BUILDING_OPTS.map(function (b) {
      return '<option value="' + b + '"' + (r && r.building === b ? ' selected' : '') + '>' + b + '</option>';
    }).join('');
    var zOpts = S.ROOM_ZONES.map(function (z) {
      return '<option value="' + z + '"' + (r && r.zone === z ? ' selected' : '') + '>' + z + '</option>';
    }).join('');
    var tOpts = S.ROOM_TYPES.map(function (t) {
      return '<option value="' + t + '"' + ((r ? r.roomType : '多媒体教室') === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    U.modal((r ? '编辑教室 ' + r.no : '新增教室'),
      '<div class="row-2"><div class="field"><label>教学楼<span class="req">*</span></label><select class="input" id="r-building">' + bOpts + '</select></div>' +
      '<div class="field"><label>教室区域<span class="req">*</span></label><select class="input" id="r-zone">' + zOpts + '</select></div></div>' +
      '<div class="row-2"><div class="field"><label>教室编号<span class="req">*</span></label><input class="input" id="r-no" value="' + (r ? U.esc(r.no) : '') + '" placeholder="如 2311"></div>' +
      '<div class="field"><label>教室类型<span class="req">*</span></label><select class="input" id="r-type">' + tOpts + '</select></div></div>' +
      '<div class="field"><label>容量（座位数）</label><input class="input" id="r-cap" type="number" min="0" value="' + (r && r.capacity ? r.capacity : '') + '" placeholder="如 60"></div>' +
      '<div class="hint">历史日志保留原值；停用教室不在状态墙显示。</div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.settings.saveRoom(' + (r ? '\'' + U.esc(no) + '\'' : 'null') + ')">保存</button>');
  }
  function saveRoom(no) {
    try {
      var patch = {
        no: document.getElementById('r-no').value.trim(),
        building: document.getElementById('r-building').value,
        zone: document.getElementById('r-zone').value,
        roomType: document.getElementById('r-type').value
      };
      var cap = document.getElementById('r-cap').value;
      patch.capacity = cap === '' ? null : parseInt(cap, 10);
      if (no) S.updateRoom(no, patch);
      else S.addRoom(patch);
      U.closeModal(); U.toast('已保存教室 ' + patch.no, 'ok'); App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function toggleRoom(no) {
    var r = S.getState().settings.rooms.filter(function (x) { return x.no === no; })[0];
    S.updateRoom(no, { active: r.active === false });
    App.render();
  }
  function removeRoom(no) {
    U.confirm('删除教室', '确定删除教室 <b>' + U.esc(no) + '</b>？历史日志不受影响。', function () {
      S.removeRoom(no); U.toast('已删除', 'ok'); App.render();
    }, '删除', true);
  }

  function faultAt(fi) { return S.getState().settings.faultTypes[fi] || null; }
  function addFault() {
    var v = document.getElementById('fault-add').value.trim();
    try { S.addFaultType(v); faultOpen[v] = true; U.toast('已添加故障类型「' + v + '」', 'ok'); App.render(); }
    catch (e) { U.toast(e.message, 'err'); }
  }
  function removeFault(fi) {
    var f = faultAt(fi);
    if (!f) return;
    var name = f.name;
    var n = S.getState().tickets.filter(function (t) { return t.fault === name; }).length;
    U.confirm('删除故障类型', '「' + U.esc(name) + '」及其 ' + (f.symptoms || []).length + ' 条故障表现将被删除；已被 ' + n + ' 条日志使用，历史日志保留原值，但新建日志不再可选。确定删除？', function () {
      try { S.removeFaultType(name); delete faultOpen[name]; U.toast('已删除', 'ok'); App.render(); }
      catch (e) { U.toast(e.message, 'err'); }
    }, '删除', true);
  }
  function toggleFault(fi) {
    var f = faultAt(fi);
    if (!f) return;
    faultOpen[f.name] = !faultOpen[f.name];
    App.render();
  }
  function faultForm(fi) {
    var f = faultAt(fi);
    if (!f) return;
    var old = f.name;
    U.modal('编辑故障类型', '<div class="field"><label>类型名称（一级）<span class="req">*</span></label><input class="input" id="ft-name" value="' + U.esc(old) + '"></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" onclick="Views.settings.saveFaultForm(\'' + U.esc(old) + '\')">保存</button>');
  }
  function saveFaultForm(old) {
    var el = document.getElementById('ft-name');
    var v = el ? el.value.trim() : '';
    try {
      S.renameFaultType(old, v);
      if (faultOpen[old]) { delete faultOpen[old]; faultOpen[v] = true; }
      U.closeModal(); U.toast('已保存', 'ok'); App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function addSym(fi) {
    var f = faultAt(fi);
    if (!f) return;
    var el = document.getElementById('sym-add-' + fi);
    var v = el ? el.value.trim() : '';
    try { S.addSymptom(f.name, v); U.toast('已添加故障表现', 'ok'); App.render(); }
    catch (e) { U.toast(e.message, 'err'); }
  }
  function symptomForm(fi, si) {
    var f = faultAt(fi);
    if (!f) return;
    var old = (f.symptoms || [])[si];
    if (old == null) return;
    U.modal('编辑故障表现', '<div class="field"><label>所属类型</label><input class="input" value="' + U.esc(f.name) + '" disabled></div>' +
      '<div class="field"><label>故障表现（二级）<span class="req">*</span></label><input class="input" id="sym-text" value="' + U.esc(old) + '"></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" onclick="Views.settings.saveSymptomForm(' + fi + ',' + si + ')">保存</button>');
  }
  function saveSymptomForm(fi, si) {
    var f = faultAt(fi);
    if (!f) return;
    var old = (f.symptoms || [])[si];
    var el = document.getElementById('sym-text');
    var v = el ? el.value.trim() : '';
    try { S.updateSymptom(f.name, old, v); U.closeModal(); U.toast('已保存', 'ok'); App.render(); }
    catch (e) { U.toast(e.message, 'err'); }
  }
  function removeSym(fi, si) {
    var f = faultAt(fi);
    if (!f) return;
    var s = (f.symptoms || [])[si];
    if (s == null) return;
    try { S.removeSymptom(f.name, s); U.toast('已删除故障表现', 'ok'); App.render(); }
    catch (e) { U.toast(e.message, 'err'); }
  }
  function exportFaults() {
    if (U.downloadWorkbook('故障字典_' + S.fmtDate(S.nowLocal()) + '.xlsx', S.buildFaultDictWorkbook(false))) {
      U.toast('故障字典已下载（故障类型 + 故障表现）', 'ok');
    }
  }
  function faultTemplate() {
    if (U.downloadWorkbook('故障字典导入模板.xlsx', S.buildFaultDictWorkbook(true))) {
      U.toast('模板已下载：按表头填写后即可上传合并', 'ok');
    }
  }
  function pickFaultFile() {
    var el = document.getElementById('fault-import-file');
    if (el) el.click();
  }
  function faultFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    readXlsx(file, function (wb) {
      var p = S.previewFaultImport(wb);
      if (!p.items.length) { U.toast('未识别到故障数据，请使用「下载模板」中的表头（需包含 故障类型）', 'err'); return; }
      var msg = '共解析 <b>' + p.total + '</b> 行：新增类型 <b>' + p.added + '</b> 个，合并已有类型 <b>' + p.updated + '</b> 个，新增故障表现 <b>' + p.newSym + '</b> 条' +
        (p.skipped ? '，跳过 ' + p.skipped + ' 行（缺少故障类型）' : '') +
        '。<br>同名类型仅补充表现，不会删除原有表现。';
      U.confirm('上传故障字典', msg, function () {
        var r = S.commitFaultImport(p.items);
        U.toast('已上传：新增类型 ' + r.added + ' 个，新增表现 ' + r.newSym + ' 条', 'ok');
        App.render();
      }, '确认上传');
    });
  }

  function addRole() {
    var v = document.getElementById('role-add').value.trim();
    try { S.addRole(v); U.toast('已添加角色「' + v + '」', 'ok'); App.render(); }
    catch (e) { U.toast(e.message, 'err'); }
  }
  function removeRole(name) {
    U.confirm('删除角色', '删除角色「' + U.esc(name) + '」后，新建账号不再可选；已使用该角色的账号保留原角色名。确定删除？', function () {
      try { S.removeRole(name); U.toast('已删除', 'ok'); App.render(); }
      catch (e) { U.toast(e.message, 'err'); }
    }, '删除', true);
  }

  function engineerForm(name) {
    var st = S.getState();
    var e = name ? st.settings.engineers.filter(function (x) { return x.name === name; })[0] : null;
    var bs = buildings();
    var picked = e ? (e.buildings || []) : [];
    U.modal((e ? '编辑' : '新增') + '工程师',
      '<div class="row-2"><div class="field"><label>姓名<span class="req">*</span></label><input class="input" id="e-name" value="' + U.esc(e ? e.name : '') + '" placeholder="如 王师傅"></div>' +
      '<div class="field"><label>联系电话</label><input class="input" id="e-phone" value="' + U.esc(e ? e.phone : '') + '" placeholder="手机 / 内线"></div></div>' +
      '<div class="field"><label>负责楼栋</label><div class="pick-row" id="e-buildings">' + bs.map(function (b) {
        return '<span class="pick' + (picked.indexOf(b) >= 0 ? ' on' : '') + '" data-b="' + U.esc(b) + '" onclick="this.classList.toggle(\'on\')">' + U.esc(b) + '</span>';
      }).join('') + '</div><div class="hint">指派时优先推荐负责该楼栋且当前在办最少的工程师。</div></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" onclick="Views.settings.saveEngineer(' + (e ? '\'' + U.esc(name) + '\'' : 'null') + ')">保存</button>');
  }
  function saveEngineer(editName) {
    var name = document.getElementById('e-name').value.trim();
    var phone = document.getElementById('e-phone').value.trim();
    var bs = [];
    document.querySelectorAll('#e-buildings .pick.on').forEach(function (el) { bs.push(el.dataset.b); });
    try {
      if (editName) S.updateEngineer(editName, { name: name, phone: phone, buildings: bs });
      else S.addEngineer({ name: name, phone: phone, buildings: bs });
      U.closeModal(); U.toast('已保存工程师 ' + name, 'ok'); App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }
  function toggleEngineer(name) {
    var e = S.getState().settings.engineers.filter(function (x) { return x.name === name; })[0];
    S.updateEngineer(name, { active: e.active === false });
    App.render();
  }
  function removeEngineer(name) {
    U.confirm('删除工程师', '确定删除 <b>' + U.esc(name) + '</b>？名下未完结日志需先处理或改派。', function () {
      try { S.removeEngineer(name); U.toast('已删除', 'ok'); App.render(); }
      catch (e) { U.toast(e.message, 'err'); }
    }, '删除', true);
  }

  window.Views = window.Views || {};
  window.Views.settings = {
    render: render,
    switchTab: switchTab, schedMonth: schedMonth, schedPick: schedPick,
    loadLicense: loadLicense, copyMachineCode: copyMachineCode, licenseForm: licenseForm, saveLicense: saveLicense,
    schedUnsel: schedUnsel, schedSelReset: schedSelReset, schedApplyMulti: schedApplyMulti, schedClearMulti: schedClearMulti,
    schedToggle: schedToggle, schedRemove: schedRemove, schedClear: schedClear,
    schedCopyPrev: schedCopyPrev, batchOpen: batchOpen, batchSet: batchSet, batchSave: batchSave,
    searchRoom: searchRoom, roomForm: roomForm, saveRoom: saveRoom,
    toggleRoom: toggleRoom, removeRoom: removeRoom, addFault: addFault, removeFault: removeFault,
    toggleFault: toggleFault, faultForm: faultForm, saveFaultForm: saveFaultForm,
    addSym: addSym, symptomForm: symptomForm, saveSymptomForm: saveSymptomForm, removeSym: removeSym,
    exportFaults: exportFaults, faultTemplate: faultTemplate, pickFaultFile: pickFaultFile, faultFile: faultFile,
    addRole: addRole, removeRole: removeRole,
    engineerForm: engineerForm, saveEngineer: saveEngineer, toggleEngineer: toggleEngineer, removeEngineer: removeEngineer,
    savePatrolConfig: savePatrolConfig, addPatrolItem: addPatrolItem, removePatrolItem: removePatrolItem,
    addStage: addStage, renameStage: renameStage, removeStage: removeStage, setDefaultStage: setDefaultStage,
    exportRooms: exportRooms, roomTemplate: roomTemplate, pickRoomFile: pickRoomFile, roomFile: roomFile,
    exportSchedule: exportSchedule, scheduleTemplate: scheduleTemplate, pickScheduleFile: pickScheduleFile, scheduleFile: scheduleFile,
    doBackup: doBackup, pickRestoreFile: pickRestoreFile, restoreFile: restoreFile, loadBackups: loadBackups
  };
})();
