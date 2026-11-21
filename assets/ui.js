/* 通用 UI 工具：图标、提示、抽屉、弹窗、图表、文件下载 */
(function () {
  'use strict';

  var P = {
    school: '<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>',
    ticket: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    server: '<rect x="2" y="3" width="20" height="7" rx="1.5"/><rect x="2" y="14" width="20" height="7" rx="1.5"/><path d="M6 6.5h.01M6 17.5h.01"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pin: '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 .4L6.7 11.6 6.3 8.7l2.9.4a4 4 0 0 0 5.5-2.8z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    mobile: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 18h6"/>',
    grid: '<path d="M9 3H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM19 3h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2zM19 13h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z"/>',
    kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8l-6.2 3.2L7 14.2 2 9.3l6.9-1z"/>',
    bag: '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    room: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.file) + '</svg>';
  }

  function toast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(function () { el.className = 'toast' + (type ? ' ' + type : ''); }, 2600);
  }

  function esc(s) { return window.Store.esc(s); }

  // 抽屉
  var drawerEl, maskEl;
  function ensureDrawer() {
    if (drawerEl) return;
    drawerEl = document.getElementById('drawer');
    maskEl = document.getElementById('mask');
    maskEl.addEventListener('click', closeDrawer);
  }
  function openDrawer(title, tags, body, foot, opts) {
    ensureDrawer();
    opts = opts || {};
    document.getElementById('drawer-title').innerHTML = title;
    document.getElementById('drawer-tags').innerHTML = tags || '';
    document.getElementById('drawer-body').innerHTML = body;
    document.getElementById('drawer-foot').innerHTML = foot || '';
    drawerEl.classList.add('show');
    maskEl.classList.add('show');
    drawerEl.dataset.no = opts.no || '';
    document.body.style.overflow = 'hidden';
    var bodyEl = document.getElementById('drawer-body');
    if (opts.scrollTop !== false) bodyEl.scrollTop = 0;
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('show');
    maskEl.classList.remove('show');
    document.body.style.overflow = '';
    if (window.Views && window.currentRoute === 'tickets' && window.Views.tickets && typeof window.Views.tickets.refresh === 'function') window.Views.tickets.refresh();
  }

  // 弹窗
  function modal(title, body, foot, opts) {
    opts = opts || {};
    var el = document.getElementById('modal-mask');
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-foot').innerHTML = foot || '';
    el.classList.add('show');
    el.dataset.wide = opts.wide ? '1' : '';
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    var el = document.getElementById('modal-mask');
    el.classList.remove('show');
    document.body.style.overflow = '';
  }
  function confirmBox(title, text, onOk, okLabel, danger) {
    modal(title, '<div style="font-size:13px;line-height:1.8;color:#646a73">' + text + '</div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn ' + (danger ? 'btn-orange' : 'btn-primary') + '" id="confirm-ok">' + (okLabel || '确认') + '</button>');
    document.getElementById('confirm-ok').onclick = function () { closeModal(); onOk(); };
  }

  // 文件下载
  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function csvText(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        var s = cell == null ? '' : String(cell);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }
  function downloadCSV(filename, rows) {
    // 中文 Windows 下 Excel 双击打开 UTF-8 CSV 容易乱码，改由服务端按 GB18030 生成
    var token = '';
    try { token = localStorage.getItem('dhu_ops_token') || ''; } catch (e) {}
    fetch('/api/export/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ filename: filename, rows: rows })
    }).then(function (res) {
      if (!res.ok) throw new Error('导出失败');
      return res.blob();
    }).then(function (blob) {
      downloadBlob(filename, blob);
    }).catch(function () {
      // 服务端不可用（如以 file:// 打开）时回退为本地 UTF-8 BOM
      downloadBlob(filename, new Blob(['\uFEFF' + csvText(rows)], { type: 'text/csv;charset=utf-8' }));
    });
  }
  function hasXLSX() { return typeof window.XLSX !== 'undefined'; }

  // ---- 第三方库按需加载：首屏只加载业务代码，重型库在首次使用时再拉取 ----
  var vendorLoading = {};
  function loadVendor(src) {
    if (!vendorLoading[src]) {
      vendorLoading[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () {
          delete vendorLoading[src];
          var err = new Error('组件加载失败：' + src);
          U.toast(err.message, 'err');
          reject(err);
        };
        document.head.appendChild(s);
      });
    }
    return vendorLoading[src];
  }
  function ensureXLSX() {
    return hasXLSX() ? Promise.resolve() : loadVendor('vendor/xlsx.full.min.js');
  }
  function ensurePDFLibs() {
    if (window.jspdf && window.html2canvas) return Promise.resolve();
    return Promise.all([
      window.jspdf ? null : loadVendor('vendor/jspdf.umd.min.js'),
      window.html2canvas ? null : loadVendor('vendor/html2canvas.min.js')
    ]);
  }

  function downloadXLSX(filename, sheets) {
    if (!hasXLSX()) {
      // 首次导出时才加载 Excel 库，加载失败再回退 CSV
      ensureXLSX().then(function () {
        downloadXLSX(filename, sheets);
      }, function () {
        downloadCSV(filename.replace(/\.xlsx$/, '.csv'), sheets[0].rows);
      });
      return true;
    }
    var wb = window.XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var ws = window.XLSX.utils.aoa_to_sheet(s.rows);
      if (s.widths) ws['!cols'] = s.widths.map(function (w) { return { wch: w }; });
      window.XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    window.XLSX.writeFile(wb, filename);
    return true;
  }
  function downloadWorkbook(filename, wb) {
    if (!hasXLSX()) {
      ensureXLSX().then(function () { downloadWorkbook(filename, wb); }, function () {});
      return true;
    }
    window.XLSX.writeFile(wb, filename);
    return true;
  }
  // 直接下载静态文件（如附件原样模板），保留原文件的样式与格式
  function downloadUrl(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
  function downloadJSON(filename, obj) {
    downloadBlob(filename, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  }

  // ---- 图表（纯 SVG，无外网依赖）----
  function lineChart(series, opts) {
    opts = opts || {};
    var w = opts.width || 620, h = opts.height || 180, padL = 30, padR = 12, padT = 12, padB = 24;
    var max = Math.max(1, Math.max.apply(null, series.map(function (s) { return s.value; })));
    var stepX = series.length > 1 ? (w - padL - padR) / (series.length - 1) : 0;
    var pts = series.map(function (s, i) {
      var x = padL + i * stepX;
      var y = padT + (h - padT - padB) * (1 - s.value / max);
      return { x: x, y: y, v: s.value, label: s.label };
    });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (h - padB) + ' L' + pts[0].x.toFixed(1) + ' ' + (h - padB) + ' Z';
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var y = padT + (h - padT - padB) * g / 3;
      var val = Math.round(max * (3 - g) / 3);
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '" stroke="#f0f2f5"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="#b9bec7">' + val + '</text>';
    }
    var labels = pts.map(function (p, i) {
      if (series.length > 12 && i % 2 === 1) return '';
      return '<text x="' + p.x + '" y="' + (h - 7) + '" text-anchor="middle" font-size="9" fill="#b9bec7">' + esc(p.label) + '</text>';
    }).join('');
    var dots = pts.map(function (p) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="2.6" fill="#1677ff"><title>' + esc(p.label) + '：' + p.v + ' 单</title></circle>';
    }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" role="img">' +
      grid + '<path d="' + area + '" fill="rgba(22,119,255,.07)"/>' +
      '<path d="' + path + '" stroke="#1677ff" stroke-width="2" fill="none" stroke-linejoin="round"/>' + dots + labels + '</svg>';
  }
  function donutChart(items, opts) {
    opts = opts || {};
    var total = items.reduce(function (a, b) { return a + b.count; }, 0);
    var size = opts.size || 132, r = size / 2 - 10, cx = size / 2, cy = size / 2;
    if (!total) return '<div style="height:' + size + 'px;display:grid;place-items:center;color:#b9bec7;font-size:12px">暂无数据</div>';
    var start = -Math.PI / 2, segs = '';
    items.forEach(function (it) {
      var frac = it.count / total;
      if (frac <= 0) return;
      var end = start + frac * Math.PI * 2;
      var x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
      var x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      var large = frac > 0.5 ? 1 : 0;
      segs += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' + it.color + '" opacity=".92"><title>' + esc(it.name) + '：' + it.count + ' 单</title></path>';
      start = end;
    });
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' + segs +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 14) + '" fill="#fff"/>' +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="18" font-weight="700" fill="#1f2329">' + total + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="9.5" fill="#8f959e">日志总数</text></svg>';
  }
  function hbars(items, color) {
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.count; })));
    return '<div class="bars">' + items.map(function (it) {
      var w = Math.round(it.count / max * 100);
      return '<div class="bar-row"><span class="lb" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
        '<span class="track"><i style="width:' + w + '%;' + (color ? 'background:' + color : '') + '"></i></span>' +
        '<span class="n">' + it.count + '</span></div>';
    }).join('') + '</div>';
  }
  function vbars(items) {
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.count; })));
    return '<div style="display:flex;align-items:flex-end;gap:10px;height:190px;padding:8px 4px 0">' + items.map(function (it) {
      var h = Math.round(it.count / max * 140);
      var col = it.color || '#1677ff';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0">' +
        '<span style="font-size:10px;color:#8f959e">' + it.count + '</span>' +
        '<div style="width:100%;max-width:34px;height:' + Math.max(3, h) + 'px;background:linear-gradient(180deg,' + col + 'cc,' + col + ');border-radius:5px 5px 0 0" title="' + esc(it.name) + '：' + it.count + '"></div>' +
        '<span style="font-size:10px;color:#646a73;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + esc(it.name) + '</span></div>';
    }).join('') + '</div>';
  }

  // ---- 自定义日历控件（替代原生 input[type=date]，行为完全可控）----
  // 用法：UI.datepicker({ id, value, max, onPick, width })
  //   value/max: 'YYYY-MM-DD'，max 之后的日期置灰不可选
  //   onPick: 选中后执行的 JS 模板字符串，__V__ 会被替换为带引号的日期值
  var dpState = { id: null, mode: 'day', vy: 0, vm: 0 };

  function datepicker(opts) {
    var w = opts.width ? ' style="width:' + opts.width + 'px"' : '';
    return '<span class="dp" id="dp-' + opts.id + '" data-value="' + esc(opts.value || '') + '" data-max="' + esc(opts.max || '') + '" data-onpick="' + esc(opts.onPick || '') + '">' +
      '<button type="button" class="dp-box"' + w + ' onclick="UI.dp.toggle(\'' + opts.id + '\')">' +
      icon('calendar', 14) + '<span class="dp-val" id="dp-val-' + opts.id + '">' + esc(opts.value || '选择日期') + '</span>' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>' +
      '</button></span>';
  }

  function dpRoot(id) { return document.getElementById('dp-' + id); }
  function dpParse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function dpPad(n) { return (n < 10 ? '0' : '') + n; }

  function dpPanel() {
    var p = document.getElementById('dp-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'dp-panel';
    p.className = 'dp-panel';
    p.style.display = 'none';
    document.body.appendChild(p);
    document.addEventListener('mousedown', function (e) {
      if (p.style.display === 'none') return;
      if (p.contains(e.target)) return;
      var root = dpState.id && dpRoot(dpState.id);
      if (root && root.contains(e.target)) return;
      dpClose();
    });
    window.addEventListener('scroll', function () { if (dpState.id) dpClose(); }, true);
    window.addEventListener('resize', function () { if (dpState.id) dpClose(); });
    return p;
  }

  function dpToggle(id) {
    if (dpState.id === id) { dpClose(); return; }
    var root = dpRoot(id);
    if (!root) return;
    var cur = dpParse(root.dataset.value) || dpParse(root.dataset.max) || dpParse(todayStr());
    dpState.id = id; dpState.mode = 'day'; dpState.vy = cur.y; dpState.vm = cur.m;
    dpRender();
    var p = dpPanel();
    p.style.display = 'block';
    var r = root.getBoundingClientRect();
    var pw = 252, ph = p.offsetHeight;
    var left = Math.min(r.left, window.innerWidth - pw - 10);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    p.style.left = Math.max(8, left) + 'px';
    p.style.top = top + 'px';
  }
  function dpClose() {
    var p = document.getElementById('dp-panel');
    if (p) p.style.display = 'none';
    dpState.id = null;
  }

  function dpRender() {
    var p = dpPanel();
    var root = dpRoot(dpState.id);
    if (!root) { dpClose(); return; }
    var max = root.dataset.max || '';
    var val = root.dataset.value || '';
    var today = todayStr();
    var arrowL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>';
    var arrowR = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
    var label, body;
    if (dpState.mode === 'day') {
      var startWd = (new Date(dpState.vy, dpState.vm - 1, 1).getDay() + 6) % 7; // 周一为一周起始
      var days = new Date(dpState.vy, dpState.vm, 0).getDate();
      var cells = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="dp-wd">' + w + '</div>'; }).join('');
      for (var i = 0; i < startWd; i++) cells += '<div></div>';
      for (var d = 1; d <= days; d++) {
        var ds = dpState.vy + '-' + dpPad(dpState.vm) + '-' + dpPad(d);
        var dis = max && ds > max;
        var cls = 'dp-cell' + (dis ? ' dis' : '') + (ds === val ? ' sel' : '') + (ds === today && !dis ? ' today' : '');
        cells += '<button type="button" class="' + cls + '"' + (dis ? ' disabled' : ' onclick="UI.dp.pick(\'' + ds + '\')"') + '>' + d + '</button>';
      }
      label = '<button type="button" class="dp-label" onclick="UI.dp.setMode(\'month\')">' + dpState.vy + ' 年 ' + dpState.vm + ' 月</button>';
      body = '<div class="dp-grid">' + cells + '</div>';
    } else if (dpState.mode === 'month') {
      label = '<button type="button" class="dp-label" onclick="UI.dp.setMode(\'year\')">' + dpState.vy + ' 年</button>';
      var mc = '';
      for (var m = 1; m <= 12; m++) {
        mc += '<button type="button" class="dp-mcell' + (m === dpState.vm ? ' sel' : '') + '" onclick="UI.dp.pickMonth(' + m + ')">' + m + ' 月</button>';
      }
      body = '<div class="dp-mgrid">' + mc + '</div>';
    } else {
      var y0 = dpState.vy - 5;
      label = '<span class="dp-label" style="cursor:default">' + y0 + ' - ' + (y0 + 11) + '</span>';
      var yc = '';
      for (var y = y0; y < y0 + 12; y++) {
        yc += '<button type="button" class="dp-mcell' + (y === dpState.vy ? ' sel' : '') + '" onclick="UI.dp.pickYear(' + y + ')">' + y + '</button>';
      }
      body = '<div class="dp-mgrid">' + yc + '</div>';
    }
    var todayDis = max && today > max;
    p.innerHTML = '<div class="dp-head">' +
      '<button type="button" class="dp-nav" onclick="UI.dp.nav(-1)">' + arrowL + '</button>' + label +
      '<button type="button" class="dp-nav" onclick="UI.dp.nav(1)">' + arrowR + '</button></div>' + body +
      '<div class="dp-foot">' +
      (todayDis ? '<span></span>' : '<button type="button" onclick="UI.dp.pick(UI.todayStr())">今天</button>') +
      '<button type="button" onclick="UI.dp.close()">关闭</button></div>';
  }

  function dpNav(dir) {
    if (dpState.mode === 'day') {
      dpState.vm += dir;
      if (dpState.vm < 1) { dpState.vm = 12; dpState.vy--; }
      if (dpState.vm > 12) { dpState.vm = 1; dpState.vy++; }
    } else if (dpState.mode === 'month') {
      dpState.vy += dir;
    } else {
      dpState.vy += dir * 12;
    }
    dpRender();
  }
  function dpSetMode(mode) { dpState.mode = mode; dpRender(); }
  function dpPickMonth(m) { dpState.vm = m; dpState.mode = 'day'; dpRender(); }
  function dpPickYear(y) { dpState.vy = y; dpState.mode = 'month'; dpRender(); }

  function dpPick(ds) {
    var root = dpRoot(dpState.id);
    if (!root) { dpClose(); return; }
    var max = root.dataset.max || '';
    if (max && ds > max) { toast('不能选择今天之后的日期', 'err'); return; }
    var cb = root.dataset.onpick || '';
    root.dataset.value = ds;
    var lbl = document.getElementById('dp-val-' + dpState.id);
    if (lbl) lbl.textContent = ds;
    dpClose();
    if (cb) {
      try { (new Function(cb.replace(/__V__/g, JSON.stringify(ds))))(); }
      catch (e) { console.error(e); }
    }
  }

  function todayStr() { return window.Store.dateKey(new Date()); }
  function monthStart() {
    var d = new Date();
    return window.Store.dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function daysAgoStr(n) {
    var d = new Date();
    return window.Store.dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n));
  }
  function durationText(min) {
    if (min == null) return '—';
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' 小时' + (m ? ' ' + m + ' 分' : '');
  }

  window.UI = {
    icon: icon, toast: toast, esc: esc, openDrawer: openDrawer, closeDrawer: closeDrawer,
    modal: modal, closeModal: closeModal, confirm: confirmBox,
    downloadBlob: downloadBlob, downloadCSV: downloadCSV, downloadXLSX: downloadXLSX, downloadWorkbook: downloadWorkbook, downloadUrl: downloadUrl, downloadJSON: downloadJSON, hasXLSX: hasXLSX,
    ensureXLSX: ensureXLSX, ensurePDFLibs: ensurePDFLibs,
    lineChart: lineChart, donutChart: donutChart, hbars: hbars, vbars: vbars,
    todayStr: todayStr, monthStart: monthStart, daysAgoStr: daysAgoStr, durationText: durationText,
    datepicker: datepicker,
    dp: {
      toggle: dpToggle, close: dpClose, nav: dpNav, setMode: dpSetMode,
      pickMonth: dpPickMonth, pickYear: dpPickYear, pick: dpPick
    }
  };
})();
