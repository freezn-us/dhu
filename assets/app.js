/* 应用外壳：导航、角色、路由 */
(function () {
  'use strict';

  var NAV = [
    { group: '概览', items: [['dashboard', '工作台', 'dashboard']] },
    { group: '来电受理', items: [['intake', '来电登记', 'phone']] },
    { group: '日志填报', items: [['daily-log', '每日工作日志', 'calendar'], ['patrol', '巡视管理', 'check']] },
    { group: '查询与分析', items: [['tickets', '日志查询', 'list'], ['reports', '统计报表', 'chart']] },
    { group: '资产与知识', items: [['assets', '教室/设备档案', 'server'], ['kb', '知识库', 'book']] },
    { group: '数据与配置', items: [['data', '导入 / 导出', 'database'], ['settings', '基础配置', 'settings']] },
    { group: '帮助', items: [['help', '使用说明', 'file']] },
    { group: '系统管理', items: [['user-manage', '用户与权限', 'shield'], ['audit', '审计日志', 'file']] }
  ];
  var TITLES = {
    dashboard: ['概览', '工作台'], intake: ['来电受理', '来电登记'],
    'daily-log': ['日志填报', '每日工作日志'], 'log-entry': ['日志填报', '单条日志录入'], patrol: ['日志填报', '巡视管理'],
    tickets: ['查询与分析', '日志查询'], reports: ['查询与分析', '统计报表'],
    assets: ['资产与知识', '教室/设备档案'], kb: ['资产与知识', '知识库'],
    data: ['数据与配置', '导入 / 导出'], settings: ['数据与配置', '基础配置'], help: ['帮助', '使用说明'],
    'user-manage': ['系统管理', '用户与权限'], audit: ['系统管理', '审计日志']
  };
  // 各路由对应的权限点（user-manage 仅管理员可见）
  var ROUTE_PERM = {
    dashboard: 'dashboard', intake: 'intake', 'daily-log': 'daily-log',
    'log-entry': 'log-entry', patrol: 'patrol', tickets: 'tickets',
    reports: 'reports', data: 'data', settings: 'settings', help: 'help',
    assets: 'assets', kb: 'kb',
    'user-manage': 'user-manage', audit: 'audit'
  };
  window.currentRoute = 'dashboard';
  var lastAuditRoute = '';

  // 授权功能位：授权文件 modules 声明可用的业务模块；字段缺失或含 all 时全部放行
  var ROUTE_MODULE = { reports: 'report', kb: 'kb', assets: 'device', audit: 'audit' };
  var LICENSE_MODULES = null;
  function licenseAllows(route) {
    var mod = ROUTE_MODULE[route];
    if (!mod) return true;
    if (!LICENSE_MODULES || !LICENSE_MODULES.length) return true;
    if (LICENSE_MODULES.indexOf('all') >= 0) return true;
    return LICENSE_MODULES.indexOf(mod) >= 0;
  }
  function applyLicenseModules(st) {
    if (!st) return;
    LICENSE_MODULES = st.modules || [];
    buildNav();
    buildMobileNav();
    if (!canView(window.currentRoute)) location.hash = '#/dashboard';
  }

  function canView(route) {
    if (!licenseAllows(route)) return false;
    // 系统管理下的页面仅管理员可见
    if (route === 'audit' || route === 'user-manage') return Store.isAdmin();
    var perm = ROUTE_PERM[route];
    if (!perm) return false;
    return Store.hasPermission(perm);
  }
  function buildNav() {
    var st = Store.getState();
    var pending = st.tickets.filter(function (t) { return t.status === 'new'; }).length;
    var patrolPending = (st.patrols || []).filter(function (p) { return p.date === Store.fmtDate(Store.nowLocal()) && p.status === 'pending'; }).length;
    var html = NAV.map(function (g) {
      var items = g.items.filter(function (it) { return canView(it[0]); });
      if (!items.length) return '';
      return '<div class="menu-group">' + g.group + '</div>' + items.map(function (it) {
        var badge = '';
        if (it[0] === 'daily-log' && pending) badge = '<span class="badge">' + pending + '</span>';
        if (it[0] === 'patrol' && patrolPending) badge = '<span class="badge" style="background:#e6f4ff;color:#1677ff">' + patrolPending + '</span>';
        return '<div class="menu-item" data-route="' + it[0] + '" onclick="App.go(\'' + it[0] + '\')">' + UI.icon(it[2], 17) + '<span>' + it[1] + '</span>' + badge + '</div>';
      }).join('');
    }).join('');
    document.getElementById('nav').innerHTML = html;
  }

  function buildMobileNav() {
    var items = [['dashboard', '工作台', 'dashboard'], ['daily-log', '日志', 'calendar'], ['patrol', '巡视', 'check'], ['reports', '报表', 'chart']].filter(function (it) { return canView(it[0]); });
    document.getElementById('mobile-nav').innerHTML = items.map(function (it) {
      return '<button data-route="' + it[0] + '" onclick="App.go(\'' + it[0] + '\')">' + UI.icon(it[2], 19) + '<span>' + it[1] + '</span></button>';
    }).join('');
  }

  // 登录用户的角色信息（取代原演示身份切换）：key 用于兼容视图中的工程师判断
  var ROLE_KEY_MAP = { '工程师': 'engineer', '客服': 'clerk', '主管': 'manager', '管理员': 'manager' };
  function loginRole() {
    var name = Store.displayName() || Store.currentUser() || '';
    var roleText = Store.userRole() || '';
    return {
      key: ROLE_KEY_MAP[roleText] || 'clerk',
      name: name,
      title: roleText || '用户',
      avatar: name.slice(0, 1)
    };
  }

  function go(route) {
    if (location.hash !== '#/' + route) location.hash = '#/' + route;
    else render();
  }

  function routeFromHash() {
    var m = location.hash.match(/#\/?([a-z-]+)/);
    var r = m ? m[1] : 'dashboard';
    if (!TITLES[r]) r = 'dashboard';
    return r;
  }

  function setActive(route) {
    document.querySelectorAll('.menu-item[data-route]').forEach(function (el) {
      el.classList.toggle('active', el.dataset.route === route);
    });
    document.querySelectorAll('.mobile-nav button[data-route]').forEach(function (el) {
      el.classList.toggle('on', el.dataset.route === route);
    });
    var t = TITLES[route];
    document.getElementById('crumb').innerHTML = t[0] + ' / <b>' + t[1] + '</b>';
    document.title = t[1] + ' — 东华大学多媒体教室运维系统';
  }

  function firstAllowedRoute() {
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].items.length; j++) {
        if (canView(NAV[i].items[j][0])) return NAV[i].items[j][0];
      }
    }
    return 'dashboard';
  }

  function render() {
    currentRoute = routeFromHash();
    // 路由权限守卫：无权限时跳转到第一个可访问页面
    if (!canView(currentRoute)) {
      var fallback = firstAllowedRoute();
      if (fallback !== currentRoute) {
        location.hash = '#/' + fallback;
        return;
      }
    }
    // 审计：记录页面访问（同一路由连续刷新只记一次）
    if (currentRoute !== lastAuditRoute && TITLES[currentRoute]) {
      lastAuditRoute = currentRoute;
      Store.audit('页面', '访问页面', TITLES[currentRoute][1], '');
    }
    try { Store.ensurePatrols(); } catch (e) {}
    setActive(currentRoute);
    buildNav();
    var view = window.Views[currentRoute];
    var main = document.getElementById('view');
    if (!view) {
      main.innerHTML = '<div class="card"><div class="empty">页面不存在</div></div>';
      return;
    }
    try {
      main.innerHTML = view.render();
      if (view.afterRender) view.afterRender();
      if (view.mount) view.mount();
    } catch (e) {
      main.innerHTML = '<div class="card"><div class="alert err">页面渲染出错：' + UI.esc(e.message) + '</div></div>';
      console.error(e);
    }
    updateSaveState();
  }

  function updateSaveState() {
    var el = document.getElementById('save-state');
    if (!el) return;
    if (Store.isStorageOK()) {
      el.className = 'save-state';
      el.innerHTML = '<i></i>已同步到服务器';
      el.title = '';
      el.style.cursor = '';
    } else {
      el.className = 'save-state warn';
      el.innerHTML = '<i></i>保存失败，点击重试';
      el.title = Store.lastError() || '服务器保存失败';
      el.style.cursor = 'pointer';
    }
  }

  function mobilePreview() {
    var w = 430, h = 900;
    try {
      var win = window.open(location.pathname + '#/' + currentRoute, 'dhu_mobile', 'width=' + w + ',height=' + h + ',resizable=yes');
      if (win) win.focus();
      else UI.toast('浏览器拦截了弹出窗口，请手动将窗口宽度缩小到 900px 以下', 'err');
    } catch (e) { UI.toast('请手动缩小窗口宽度预览移动端', 'err'); }
  }

  function bind() {
    document.getElementById('mobile-preview').addEventListener('click', mobilePreview);
    var saveEl = document.getElementById('save-state');
    if (saveEl) {
      saveEl.addEventListener('click', function () {
        if (!Store.isStorageOK()) {
          Store.retrySave();
          UI.toast('正在重试保存…');
        }
      });
    }
    // Store 内部保存失败/恢复时主动刷新顶部指示器，不必等下一次页面渲染
    document.addEventListener('dhu-save-state', updateSaveState);
    window.addEventListener('hashchange', function () { UI.closeDrawer(); render(); });
    document.getElementById('mask').addEventListener('click', UI.closeDrawer);
    document.getElementById('modal-mask').addEventListener('click', function (e) {
      if (e.target.id === 'modal-mask') UI.closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { UI.closeModal(); UI.closeDrawer(); }
    });
  }

  // ---------- 桌面快捷方式 ----------
  // 服务端判断来访是否本机：本机直接在公共桌面生成 .lnk，其他电脑降级为下载 .url
  function createShortcut() {
    Store.createDesktopShortcut().then(function (res) {
      if (res && res.mode === 'lnk') {
        UI.toast('已在桌面创建快捷方式，以后双击即可进入系统', 'ok');
        return;
      }
      downloadShortcutFile();
      UI.toast('已下载快捷方式文件，把它拖到桌面即可', 'ok');
    }).catch(function (e) {
      UI.toast((e && e.message) || '创建快捷方式失败', 'err');
    });
  }

  function downloadShortcutFile() {
    var text = '[InternetShortcut]\r\nURL=' + location.origin + '/\r\n';
    var blob = new Blob([text], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '东华大学多媒体教室运维系统.url';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  window.App = {
    go: go, render: render,
    createShortcut: createShortcut,
    role: loginRole,
    isEngineer: function () { return loginRole().key === 'engineer'; },
    operator: function () { return Store.displayName() || '值班人员'; },
    importLicenseFromLock: importLicenseFromLock,
    readLicenseFileFromLock: readLicenseFileFromLock
  };

  // ---------- 登录 ----------
  function startApp() {
    if (Store.mustChangePassword && Store.mustChangePassword()) { showPwdScreen(); return; }
    Store.licenseStatus().then(function (st) {
      applyLicenseModules(st);
      if (st && st.state === 'expired') {
        renderLoginBadge(Store.displayName() || Store.currentUser());
        renderLicenseLock(st);
        return;
      }
      bootApp();
    }).catch(function () { bootApp(); });
  }
  function bootApp() {
    try { Store.ensurePatrols(); } catch (e) {}
    buildMobileNav();
    bind();
    // 无深链接时默认进入工作台；直接打开 #/daily-log 等链接时保留原路由
    if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/dashboard';
    render();
    if (!Store.isStorageOK()) UI.toast('服务器连接异常，修改可能未保存', 'err');
    showLicenseBadge();
  }
  function showLoginScreen(bootError) {
    var scr = document.getElementById('login-screen');
    scr.style.display = 'flex';
    var pwdScr = document.getElementById('pwd-screen');
    if (pwdScr) pwdScr.style.display = 'none';
    document.getElementById('login-err').textContent = bootError || '';
    // 延迟聚焦登录名；若用户/脚本已开始输入则不抢焦点
    setTimeout(function () {
      var nameEl = document.getElementById('login-name');
      var pwdEl = document.getElementById('login-pwd');
      if (!nameEl) return;
      if (nameEl.value || (pwdEl && pwdEl.value)) return;
      if (document.activeElement === pwdEl) return;
      nameEl.focus();
    }, 60);
    var doLogin = function () {
      var name = document.getElementById('login-name').value;
      var pwd = document.getElementById('login-pwd').value;
      var btn = document.getElementById('login-btn');
      btn.disabled = true;
      document.getElementById('login-err').textContent = '';
      Store.login(name, pwd).then(function (u) {
        scr.style.display = 'none';
        renderLoginBadge(u);
        if (Store.mustChangePassword && Store.mustChangePassword()) {
          showPwdScreen(pwd);
          UI.toast('首次登录，请先修改初始密码', 'ok');
          return;
        }
        startApp();
        UI.toast('欢迎，' + u, 'ok');
      }).catch(function (e) {
        document.getElementById('login-err').textContent = e.message;
        document.getElementById('login-pwd').select();
      }).then(function () { btn.disabled = false; });
    };
    document.getElementById('login-btn').onclick = doLogin;
    document.getElementById('login-pwd').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    document.getElementById('login-name').onkeydown = function (e) { if (e.key === 'Enter') document.getElementById('login-pwd').focus(); };
  }
  // 首次登录强制改密：改密前不加载业务数据，成功后才进入系统
  function showPwdScreen(prefillOld) {
    var scr = document.getElementById('pwd-screen');
    if (!scr) return;
    document.getElementById('login-screen').style.display = 'none';
    scr.style.display = 'flex';
    var errEl = document.getElementById('pwd-err');
    var oldEl = document.getElementById('pwd-old');
    var newEl = document.getElementById('pwd-new');
    var cfmEl = document.getElementById('pwd-confirm');
    var btn = document.getElementById('pwd-btn');
    errEl.textContent = '';
    oldEl.value = prefillOld || '';
    newEl.value = '';
    cfmEl.value = '';
    document.getElementById('pwd-sub').textContent =
      (Store.displayName() || Store.currentUser() || '') + '，首次登录必须修改初始密码后才能继续使用';
    setTimeout(function () { newEl.focus(); }, 60);
    function submit() {
      errEl.textContent = '';
      var o = oldEl.value, n = newEl.value, c = cfmEl.value;
      if (!o) { errEl.textContent = '请输入当前密码'; return; }
      if (n.length < 10) { errEl.textContent = '新密码至少 10 位'; return; }
      if (n !== c) { errEl.textContent = '两次输入的新密码不一致'; return; }
      if (n === o) { errEl.textContent = '新密码不能与原密码相同'; return; }
      btn.disabled = true;
      Store.changePassword(o, n, c).then(function () {
        // 改密成功后必须先加载业务数据，再进入主界面；否则空 state 会被后续保存覆盖
        return Store.load();
      }).then(function () {
        oldEl.value = ''; newEl.value = ''; cfmEl.value = '';
        scr.style.display = 'none';
        startApp();
        UI.toast('密码修改成功', 'ok');
      }).catch(function (e) {
        errEl.textContent = (e && e.message) || '修改失败，请重试';
      }).then(function () { btn.disabled = false; });
    }
    btn.onclick = submit;
    cfmEl.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    document.getElementById('pwd-cancel').onclick = function () {
      Store.logout();
      location.reload();
    };
  }

  function renderLoginBadge(name) {
    var badge = document.getElementById('login-user');
    var out = document.getElementById('logout-btn');
    if (!name) { badge.style.display = 'none'; out.style.display = 'none'; return; }
    var dname = Store.displayName() || name;
    document.getElementById('login-avatar').textContent = dname.slice(0, 1).toUpperCase();
    document.getElementById('login-name-text').textContent = dname === name ? dname : dname + '（' + name + '）';
    badge.style.display = 'inline-flex';
    out.style.display = '';
    out.onclick = function () {
      Store.logout();
      location.reload();
    };
  }

  window.addEventListener('DOMContentLoaded', function () {
    var verEl = document.getElementById('app-ver');
    if (verEl) verEl.textContent = window.APP_VERSION ? ('v' + window.APP_VERSION) : '';
    Store.licenseStatus().then(function (lst) {
      // 授权已过期：先锁屏，不再加载业务数据（避免一串 403 报错）
      if (lst && lst.state === 'expired') {
        // 已有登录态时先恢复管理员身份，避免锁屏把管理员当成非管理员而藏起导入框
        if (Store.currentUser() && Store.refreshMe) {
          Store.refreshMe().catch(function () {}).then(function () { renderLicenseLock(lst); });
        } else {
          renderLicenseLock(lst);
        }
        return;
      }
      boot();
    }).catch(function () { boot(); });

    function boot() {
      Store.load().then(function () {
        var u = Store.currentUser();
        if (u) {
          renderLoginBadge(u);
          if (Store.mustChangePassword && Store.mustChangePassword()) showPwdScreen();
          else startApp();
        } else {
          showLoginScreen();
        }
      }).catch(function (e) {
        // 服务不可用 / file:// 直开：停留在登录页并提示
        showLoginScreen(e && e.message ? e.message : '无法连接服务器，请确认 python server.py 已启动');
      });
    }
  });

  // 顶栏授权提示：试用 / 即将到期 / 宽限期；过期则直接锁屏
  function showLicenseBadge() {
    if (!Store.licenseStatus) return;
    Store.licenseStatus().then(function (st) {
      if (!st) return;
      if (st.state === 'expired') { renderLicenseLock(st); return; }
      var el = document.getElementById('license-badge');
      if (!el) return;
      var text = '', color = '#d46b08', bg = '#fff7e6';
      if (st.state === 'trial') {
        // trial 状态不显示任何徽章（用户感知与已授权一致）
        el.style.display = 'none'; return;
      } else if (st.state === 'grace') {
        text = '授权到期 · 只读';
        color = '#cf1322'; bg = '#fff1f0';
      } else if (st.state === 'expired') {
        text = '授权已过期';
        color = '#cf1322'; bg = '#fff1f0';
      } else if (st.state === 'invalid') {
        text = '授权异常';
        color = '#cf1322'; bg = '#fff1f0';
      } else if (st.days_left <= 30) {
        text = '授权即将到期';
      }
      if (!text) { el.style.display = 'none'; return; }
      el.textContent = text;
      el.title = (st.org || '') + ' · 到期 ' + (st.expires || '');
      el.style.cssText = 'display:inline-block;font-size:11px;color:' + color + ';background:' + bg +
        ';border-radius:3px;padding:2px 7px;margin-right:6px;cursor:pointer';
      el.onclick = function () { App.go('settings'); };
    }).catch(function () {});
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 授权过期：全屏锁定，管理员可直接粘贴新授权恢复
  function renderLicenseLock(st) {
    if (document.getElementById('lic-lock')) return;
    var admin = false, hasUser = false;
    try { admin = !!(Store.isAdmin && Store.isAdmin()); } catch (e) {}
    try { hasUser = !!(Store.currentUser && Store.currentUser()); } catch (e) {}
    var wrap = document.createElement('div');
    wrap.id = 'lic-lock';
    wrap.style.cssText = 'position:fixed;inset:0;background:#f2f5fa;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    wrap.innerHTML =
      '<div style="width:560px;max-width:100%;background:#fff;border-radius:10px;padding:26px 28px;box-shadow:0 8px 30px rgba(0,0,0,.12);font-family:inherit">' +
      '<div style="font-size:19px;font-weight:700;color:#cf1322;margin-bottom:8px">授权已过期，系统已停止服务</div>' +
      '<div style="font-size:13px;color:#646a73;line-height:1.9">请把下面的机器码发给厂商续期，收到新的授权文件后在下方导入即可恢复，无需重装系统。</div>' +
      '<div style="margin:14px 0;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.9">' +
      '机器码：<b style="font-family:ui-monospace,Consolas,monospace;letter-spacing:1px">' + escHtml(st.machine) + '</b><br>' +
      '原到期日：' + escHtml(st.expires || '—') + '　·　授权单位：' + escHtml(st.org || '—') + '</div>' +
      (admin
        ? '<div style="display:flex;align-items:center;gap:10px;margin-top:14px">' +
            '<input type="file" id="lic-lock-file" accept=".json,.lic,.txt,application/json" onchange="App.readLicenseFileFromLock(this)" style="font-size:12.5px">' +
            '<span style="font-size:12px;color:#8f959e">选择厂商发来的 license.json，内容会自动填入下方</span>' +
          '</div>' +
          '<textarea id="lic-lock-text" placeholder="也可把新的 license.json 内容整段粘贴到这里" style="width:100%;box-sizing:border-box;height:92px;margin-top:10px;font-family:ui-monospace,Consolas,monospace;font-size:12px;padding:8px;border:1px solid #e5e6eb;border-radius:6px"></textarea>' +
          '<button onclick="App.importLicenseFromLock()" style="margin-top:10px;width:100%;height:38px;background:#1677ff;color:#fff;border:0;border-radius:6px;font-size:14px;cursor:pointer">校验并导入授权</button>'
        : '<div style="font-size:12.5px;color:#8f959e">请联系系统管理员导入授权。</div>') +
      '<div style="display:flex;gap:10px;margin-top:10px">' +
      (hasUser
        ? '<button onclick="location.reload()" style="flex:1;height:34px;background:#fff;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer">刷新</button>' +
          '<button onclick="try{Store.logout()}catch(e){};location.reload()" style="flex:1;height:34px;background:#fff;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer">退出登录</button>'
        : '<button onclick="document.getElementById(\'lic-lock\').remove();showLoginScreenForLock()" style="flex:1;height:34px;background:#1677ff;color:#fff;border:0;border-radius:6px;cursor:pointer">管理员登录</button>' +
          '<button onclick="location.reload()" style="flex:1;height:34px;background:#fff;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer">刷新</button>') +
      '</div>' +
      '</div>';
    document.body.appendChild(wrap);
  }

  window.showLoginScreenForLock = function () {
    var scr = document.getElementById('login-screen');
    if (scr) {
      scr.style.display = 'flex';
      setTimeout(function () {
        var el = document.getElementById('login-name');
        if (el) el.focus();
      }, 60);
    }
  };

  // 锁屏页选择授权文件：读取后填入文本框，后续与粘贴走同一导入接口
  function readLicenseFileFromLock(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { alert('授权文件过大，请确认文件是否正确'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '').replace(/^\uFEFF/, '').trim();
      var ta = document.getElementById('lic-lock-text');
      if (ta) ta.value = text;
      if (!text) alert('文件内容为空，请重新选择');
    };
    reader.onerror = function () { alert('文件读取失败，请重试或改为粘贴内容'); };
    reader.readAsText(f, 'utf-8');
  }

  function importLicenseFromLock() {
    var el = document.getElementById('lic-lock-text');
    var text = el ? el.value.trim() : '';
    if (!text) { alert('请选择授权文件或粘贴授权内容'); return; }
    Store.licenseImport(text).then(function () {
      alert('授权导入成功，系统即将刷新');
      location.reload();
    }).catch(function (e) { alert(e.message || '导入失败'); });
  }
})();
