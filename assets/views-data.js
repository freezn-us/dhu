/* 数据导入 / 导出 / 备份恢复 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var preview = null;
  var restorePending = null;
  var importOpts = { skipPatrol: false };

  function render() {
    var st = S.getState();
    var bytes = 0;
    try { bytes = (localStorage.getItem(S.KEY) || '').length; } catch (e) {}
    var kb = Math.round(bytes / 1024);
    var last = st.tickets.length ? st.tickets.reduce(function (a, t) {
      return S.parseDT(t.createdAt) > S.parseDT(a.createdAt) ? t : a;
    }) : null;

    return '' +
      '<div class="page-head"><div><div class="page-title">导入 / 导出</div>' +
      '<div class="page-sub">批量导入历史日志、导出 Excel 报表、备份与恢复本机全部数据（换电脑或清理浏览器前请先备份）</div></div></div>' +

      '<div class="grid grid-2" style="align-items:start;margin-bottom:16px">' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('upload') + '批量导入日志</h3><span class="more" style="cursor:default">XLSX</span></div>' +
      '<div class="dropzone" id="dropzone" onclick="document.getElementById(\'file-import\').click()" ondragover="Views.data.dragOver(event)" ondragleave="Views.data.dragLeave(event)" ondrop="Views.data.dropFile(event)">' +
      U.icon('upload', 36) + '<b>点击选择，或把文件拖到这里</b><span>仅支持 .xlsx；系统会自动识别「东华大学每日运维日志」多 sheet 格式，重复日志不会重复导入</span></div>' +
      '<input type="file" id="file-import" class="hidden" accept=".xlsx" onchange="Views.data.pickFile(event)">' +
      '<div style="margin:12px 0 4px;font-size:12px;color:#646a73;line-height:1.8">' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">' +
      '<input type="checkbox" ' + (importOpts.skipPatrol ? 'checked' : '') + ' onchange="Views.data.setImportOpt(\'skipPatrol\', this.checked)" style="cursor:pointer">' +
      '东华日报专用：跳过巡检行（默认不勾选，全量导入含巡检行）</label>' +
      '<span style="font-size:11px;color:#8f959e;margin-left:22px">默认导入文件中的全部记录；只有勾选后才排除巡检/运维保障行</span></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.data.template(\'xlsx\')">' + U.icon('download') + '下载 Excel 模板（东华日志版式）</button>' +
      '<span style="font-size:11px;color:#b9bec7;align-self:center">日志编号可留空，系统自动生成</span></div>' +
      '<div id="import-result" style="margin-top:14px">' + (preview ? previewHtml() : '') + '</div></div>' +

      '<div><div class="card" style="margin-bottom:16px"><div class="card-head"><h3>' + U.icon('database') + '本机数据现状</h3></div>' +
      '<div class="kv-grid" style="grid-template-columns:1fr 1fr;gap:10px">' +
      '<div><div style="font-size:11px;color:#8f959e">日志总数</div><div style="font-size:20px;font-weight:700">' + st.tickets.length + ' <small style="font-size:11px;color:#8f959e">条</small></div></div>' +
      '<div><div style="font-size:11px;color:#8f959e">存储占用</div><div style="font-size:20px;font-weight:700">' + kb + ' <small style="font-size:11px;color:#8f959e">KB</small></div></div>' +
      '<div><div style="font-size:11px;color:#8f959e">教室 / 故障类型</div><div style="font-size:13px;font-weight:500">' + st.settings.rooms.length + ' 间 / ' + st.settings.faultTypes.length + ' 类</div></div>' +
      '<div><div style="font-size:11px;color:#8f959e">工程师</div><div style="font-size:13px;font-weight:500">' + st.settings.engineers.filter(function (e) { return e.active !== false; }).length + ' 人</div></div>' +
      '<div><div style="font-size:11px;color:#8f959e">最近一条</div><div style="font-size:12px;font-weight:500">' + (last ? S.fmtFull(last.createdAt) : '—') + '</div></div>' +
      '<div><div style="font-size:11px;color:#8f959e">存储状态</div><div style="font-size:12px;font-weight:500;color:' + (S.isStorageOK() ? '#52c41a' : '#f5222d') + '">' + (S.isStorageOK() ? 'localStorage 正常' : '写入失败') + '</div></div></div></div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>' + U.icon('download') + '导出 / 备份</h3></div>' +
      '<div style="font-size:12px;color:#646a73;line-height:1.8;margin-bottom:10px">Excel 导出统一采用「东华大学多媒体教室每日运维工作日志」版式（与纸质日志一致，每天一个工作表，含时段、序号、教室编号、工作内容、故障类型、处理结果、责任人、备注）。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<span style="font-size:12px;color:#646a73">时间区间</span>' +
      '<input type="month" id="exp-from" class="inp sm" style="width:150px" value="' + S.fmtDate(S.nowLocal()).slice(0, 7) + '">' +
      '<span style="font-size:12px;color:#8f959e">至</span>' +
      '<input type="month" id="exp-to" class="inp sm" style="width:150px" value="' + S.fmtDate(S.nowLocal()).slice(0, 7) + '">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.data.exportRange()">' + U.icon('download') + '按区间导出</button>' +
      '<span style="font-size:11px;color:#8f959e">以月为最小单位，导出该区间内每天的表</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.data.exportAllExcel()">' + U.icon('download') + '导出全部日志 Excel</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.data.backup()">' + U.icon('download') + '导出备份 JSON</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'file-restore\').click()">' + U.icon('upload') + '从备份恢复</button></div>' +
      '<input type="file" id="file-restore" class="hidden" accept=".json" onchange="Views.data.restoreFile(event)">' +
      '<div class="hint" style="margin-top:9px">备份 JSON 含全部日志与配置，可换电脑恢复；恢复会覆盖当前全部数据，操作前建议先导出一份当前备份。</div></div>' +

      '<div class="card"><div class="card-head"><h3 style="color:#646a73">' + U.icon('alert') + '演示数据与清空</h3></div>' +
      '<div style="font-size:12px;color:#646a73;line-height:1.8;margin-bottom:10px">系统首次打开会自动生成一批演示日志与巡视记录。正式使用前可「清空日志」保留教室 / 故障类型 / 工程师配置。</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost btn-sm" onclick="Views.data.resetDemo()">' + U.icon('refresh') + '重生成演示数据</button>' +
      '<button class="btn btn-danger-ghost btn-sm" onclick="Views.data.clearTickets()">' + U.icon('trash') + '清空全部日志</button></div></div></div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '导入字段说明</h3></div>' +
      '<div style="font-size:12px;color:#646a73;line-height:1.9">' +
      '<b>通用格式必填：</b>来电时间、教室、故障类型、故障现象。' +
      '<b>通用选填：</b>日志编号、报修人、联系电话、设备、紧急度、状态、工程师、指派/开始/完成时间、处理措施、更换耗材、是否解决、回访结果、满意度、备注。' +
      '<br><b>时间格式：</b>2026-11-05 08:40 / 2026/11/5 8:40 / Excel 日期单元格均可。' +
      '<b>状态：</b>待填报、已指派、处理中、待跟进、已处理、已记录、已取消（未填按待填报）。' +
      '<br><b>容错：</b>故障类型支持包含匹配（如「中控」可匹配「中控/开机故障」）；错误行会列出原因并跳过，不影响其他行导入。' +
      '<br><b>东华每日运维日志：</b>系统自动识别多 sheet（X月X日）格式；每个 sheet 三行表头（大标题 / 日期+当值人员 / 字段表头），字段顺序为「时段、序号、教室编号、工作内容、故障类型、处理结果、责任人、备注」。日期从各 sheet 第二行正则提取，时段合并单元格向下填充；故障类型「正常」按服务类导入；责任人多人组合只取首位，其余进备注；全部日志按已记录写入。默认全量导入（含巡检行），勾选「跳过巡检行」才会排除。</div></div>';
  }

  function previewHtml() {
    if (!preview) return '';
    var p = preview;
    var isDaily = p.detected === 'daily';
    var dup = p.duplicates || 0;
    var canImport = p.ok.length - dup;
    var topInfo = U.esc(p.fileName) + '：<b>' + U.esc(p.formatLabel || '通用格式') + '</b>' +
      (isDaily && p.sheetsSeen ? ' · 跨 ' + p.sheetsSeen.length + ' 个 sheet' : '') +
      ' · 可导入 <b>' + p.ok.length + '</b> 条' +
      (dup ? ' · 重复 <b>' + dup + '</b> 条（系统中已存在，将跳过）' : '') +
      (p.errors.length ? ' · 失败 <b>' + p.errors.length + '</b>' : '') +
      (p.warnings.length ? ' · 提醒 <b>' + p.warnings.length + '</b>' : '') +
      (isDaily && p.skippedPatrol ? ' · 已跳过巡检 ' + p.skippedPatrol + ' 行' : '');
    return '<div class="alert ' + (canImport ? 'ok' : (dup ? 'warn' : 'err')) + '">' + topInfo + '</div>' +
      (dup ? '<div class="alert warn" style="margin-top:4px">该文件中有 ' + dup + ' 条日志与系统已有记录完全相同，重复数据不会再次导入。</div>' : '') +
      (isDaily ? '<div class="alert warn" style="font-size:11.5px;margin-top:4px">东华日报格式说明：日期从各 sheet 第二行提取；时段合并单元格向下填充；故障类型「正常」按「服务类」导入；责任人多人组合只取首位为主责，其余进备注；全部日志状态按「已记录」写入（日报均为已处理记录）。</div>' : '') +
      (p.errors.length ? '<div class="alert err" style="max-height:170px;overflow:auto;margin-top:6px"><b>以下行未导入：</b><br>' + p.errors.slice(0, 12).map(function (e) {
        var sheetTag = e.sheet ? '(sheet「' + U.esc(e.sheet) + '」) ' : '';
        return sheetTag + '第 ' + e.line + ' 行：' + U.esc(e.msg);
      }).join('<br>') + (p.errors.length > 12 ? '<br>… 另有 ' + (p.errors.length - 12) + ' 行' : '') + '</div>' : '') +
      (p.warnings.length ? '<div class="alert warn" style="max-height:120px;overflow:auto;margin-top:6px">' + p.warnings.slice(0, 8).map(function (w) {
        return (w.sheet ? 'sheet「' + U.esc(w.sheet) + '」' : '第 ' + w.line + ' 行') + '：' + U.esc(w.msg);
      }).join('<br>') + '</div>' : '') +
      (canImport ? '<div class="preview-table" style="margin-top:8px"><table><thead><tr><th>日志编号</th><th>来电时间</th><th>教室</th><th>故障类型</th><th>现象</th><th>状态</th><th>工程师</th></tr></thead><tbody>' +
        p.ok.slice(0, 6).map(function (t) {
          return '<tr><td class="t-no">' + U.esc(t.no) + '</td><td class="mono" style="font-size:10.5px">' + S.fmtFull(t.createdAt) + '</td><td>' + U.esc(t.room) + '</td><td>' + U.esc(t.fault) + '</td><td>' + U.esc(t.desc) + '</td><td>' + (S.STATUS[t.status] || {}).label + '</td><td>' + U.esc(t.assignee || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="Views.data.confirmImport()">确认导入 ' + canImport + ' 条</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="Views.data.cancelPreview()">取消</button></div>' : '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="Views.data.cancelPreview()">关闭</button></div>');
  }

  function pickFile(e) {
    var file = e.target.files && e.target.files[0];
    if (file) readFile(file);
    e.target.value = '';
  }
  function dropFile(e) {
    e.preventDefault();
    document.getElementById('dropzone').classList.remove('drag');
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readFile(file);
  }
  function dragOver(e) { e.preventDefault(); document.getElementById('dropzone').classList.add('drag'); }
  function dragLeave(e) { document.getElementById('dropzone').classList.remove('drag'); }

  function readFile(file) {
    if (!/\.xlsx$/i.test(file.name)) { U.toast('仅支持 .xlsx 文件', 'err'); return; }
    if (!U.hasXLSX()) {
      // Excel 库按需加载，加载完成后再解析
      U.ensureXLSX().then(function () { readFile(file); }, function () {});
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var result, fmtLabel = '通用格式';
        if (U.hasXLSX()) {
          var wb = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
          if (S.isDailyWorkbook(wb)) {
            // 东华大学每日运维日志格式：多 sheet，3 行表头，日期在各 sheet row2
            result = S.parseDailyWorkbook(wb, { skipPatrol: importOpts.skipPatrol });
            fmtLabel = '东华每日运维日志';
          } else {
            // 通用格式：只取第一个 sheet，sheet_to_json
            var first = wb.SheetNames && wb.SheetNames[0];
            var ws = first ? wb.Sheets[first] : null;
            if (!ws) throw new Error('Excel 中没有可读取的工作表');
            var rows = window.XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
            result = S.parseRows(rows);
          }
        } else {
          U.toast('未加载 Excel 解析库，无法解析 .xlsx 文件', 'err');
          return;
        }
        result.fileName = file.name;
        result.formatLabel = fmtLabel;
        result.duplicates = S.dupeCount(result.ok);
        preview = result;
        renderPreviewBox();
        U.toast(result.ok.length ? ('解析完成 · ' + fmtLabel + ' · 可导入 ' + result.ok.length + ' 条') : '没有可导入的数据', result.ok.length ? 'ok' : 'err');
      } catch (err) {
        console.error(err);
        U.toast('文件解析失败：' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPreviewBox() {
    var box = document.getElementById('import-result');
    if (box) box.innerHTML = previewHtml();
  }

  function confirmImport() {
    if (!preview || !preview.ok.length) return;
    try {
      var r = S.commitImport(preview.ok);
      preview = null;
      var msg = '新增 ' + r.added + ' 条日志';
      if (r.duplicates) msg += '，跳过重复 ' + r.duplicates + ' 条（同一日志不可重复上传）';
      U.toast(msg, r.added ? 'ok' : 'err');
      App.render();
    } catch (e) { U.toast('导入失败：' + e.message, 'err'); }
  }
  function cancelPreview() { preview = null; renderPreviewBox(); }

  // 模板：直接使用附件原件（样式、字体、底色原样保留）
  function template() {
    U.downloadUrl('assets/donghua-daily-log-template.xlsx', '东华每日运维日志模板.xlsx');
    U.toast('模板已下载（附件原件，样式格式不变）', 'ok');
  }

  function backup() {
    var d = new Date();
    var name = 'dhu-ops-backup-' + S.dateKey(d).replace(/-/g, '') + '-' + S.pad(d.getHours()) + S.pad(d.getMinutes()) + '.json';
    U.downloadJSON(name, S.buildBackup());
    U.toast('备份已导出：' + name, 'ok');
  }
  function exportAllExcel() {
    var st = S.getState();
    if (!st.tickets.length) { U.toast('还没有日志可导出', 'err'); return; }
    var wb = S.buildDailyWorkbook(st.tickets);
    if (U.downloadWorkbook('运维工作日志_' + U.todayStr() + '.xlsx', wb)) {
      U.toast('运维工作日志 Excel 已导出（东华每日运维日志版式，每天一个工作表）', 'ok');
    } else {
      U.toast('未加载 Excel 库，导出失败', 'err');
    }
  }

  // 时间区间导出：以月为最小单位，每个月生成一个独立 Excel 文件（不合并跨月数据）
  function exportRange() {
    var fe = document.getElementById('exp-from');
    var te = document.getElementById('exp-to');
    var from = fe ? fe.value : '';
    var to = te ? te.value : '';
    if (!from || !to) { U.toast('请选择起止月份', 'err'); return; }
    if (from > to) { U.toast('起始月份不能晚于结束月份', 'err'); return; }
    var st = S.getState();
    var months = [];
    var y = +from.slice(0, 4), m = +from.slice(5, 7);
    var ey = +to.slice(0, 4), em = +to.slice(5, 7);
    while (y * 12 + m <= ey * 12 + em) {
      months.push(y + '-' + S.pad(m));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    var files = 0, days = 0, pending = months.length;
    function finish() {
      pending--;
      if (pending > 0) return;
      if (!files) { U.toast('所选区间内没有日志可导出', 'err'); return; }
      U.toast('已按月导出 ' + files + ' 个独立文件（' + from + ' 至 ' + to + '，共 ' + days + ' 天日志）', 'ok');
    }
    // 逐月生成并间隔触发下载，避免浏览器把多个文件合并或拦截
    months.forEach(function (mk, idx) {
      setTimeout(function () {
        var wb = S.buildDailyWorkbook(st.tickets, mk, mk);
        if (!wb.SheetNames || !wb.SheetNames.length) { finish(); return; }   // 该月无日志则不出文件
        var filename = '运维工作日志_' + mk.slice(0, 4) + '年' + (+mk.slice(5, 7)) + '月.xlsx';
        if (U.downloadWorkbook(filename, wb)) { files++; days += wb.SheetNames.length; }
        finish();
      }, idx * 600);
    });
  }

  function restoreFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var obj = JSON.parse(ev.target.result);
        if (!obj || obj.app !== 'dhu-ops' || !Array.isArray(obj.tickets)) throw new Error('不是本系统导出的备份文件');
        restorePending = obj;
        U.confirm('恢复备份', '备份时间：' + U.esc(obj.exportedAt || '未知') + '<br>日志 <b>' + obj.tickets.length + '</b> 条，教室 <b>' + (obj.settings.rooms || []).length + '</b> 间。<br>当前数据将被<b>完全覆盖</b>，确定继续？', function () {
          try {
            S.restoreBackup(restorePending);
            U.toast('已恢复备份：' + restorePending.tickets.length + ' 条日志', 'ok');
            App.render();
          } catch (err) { U.toast('恢复失败：' + err.message, 'err'); }
        }, '覆盖并恢复', true);
      } catch (err) { U.toast('读取失败：' + err.message, 'err'); }
    };
    reader.readAsText(file);
  }

  function resetDemo() {
    U.confirm('重生成演示数据', '将清空现有日志并用演示数据重新填充（保留当前教室 / 故障类型 / 工程师配置）。确定继续？', function () {
      S.resetDemo();
      U.toast('演示数据已重新生成', 'ok');
      App.render();
    }, '重新生成', true);
  }
  function clearTickets() {
    U.confirm('清空全部日志', '将删除<b>全部日志与巡视记录</b>，基础配置保留。此操作不可撤销，建议先导出备份。确定继续？', function () {
      S.clearAll();
      U.toast('已清空全部日志，可以开始正式使用', 'ok');
      App.render();
    }, '确认清空', true);
  }

  window.Views = window.Views || {};
  window.Views.data = {
    render: render, pickFile: pickFile, dropFile: dropFile, dragOver: dragOver, dragLeave: dragLeave,
    confirmImport: confirmImport, cancelPreview: cancelPreview, template: template,
    backup: backup, exportAllExcel: exportAllExcel, exportRange: exportRange, restoreFile: restoreFile,
    resetDemo: resetDemo, clearTickets: clearTickets,
    setImportOpt: function (k, v) { importOpts[k] = v; }
  };
})();
