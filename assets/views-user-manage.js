/* 系统管理：用户与权限（仅管理员可见） */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var users = [];
  var groups = [];
  var perms = [];
  var activeTab = 'users';
  var loading = false;

  function refresh() {
    loading = true;
    App.render();
    return Promise.all([S.listPermissions(), S.listUsers(), S.listGroups()]).then(function (arr) {
      perms = arr[0].permissions || [];
      users = arr[1].users || [];
      groups = arr[2].groups || [];
      loading = false;
      App.render();
    }).catch(function (e) {
      loading = false;
      U.toast(e.message, 'err');
      App.render();
    });
  }

  function permName(key) {
    for (var i = 0; i < perms.length; i++) if (perms[i].key === key) return perms[i].name;
    return key;
  }

  // 某用户的有效权限 = 个人权限 ∪ 所在组的权限
  function effectivePerms(u) {
    var set = {};
    (u.permissions || []).forEach(function (p) { set[p] = 1; });
    (u.groups || []).forEach(function (g) {
      var grp = groups.filter(function (x) { return x.id === g.id; })[0];
      (grp && grp.permissions || []).forEach(function (p) { set[p] = 1; });
    });
    return Object.keys(set).sort();
  }

  function permCheckboxesHtml(checked) {
    checked = checked || [];
    return '<div class="perm-grid">' + perms.map(function (p) {
      var c = checked.indexOf(p.key) >= 0 ? ' checked' : '';
      return '<label class="perm-item"><input type="checkbox" data-perm="' + p.key + '"' + c + '><span>' + U.esc(p.name) + '</span></label>';
    }).join('') + '</div>';
  }

  function readCheckedPerms() {
    var out = [];
    document.querySelectorAll('.perm-grid input[type=checkbox]').forEach(function (cb) {
      if (cb.checked) out.push(cb.dataset.perm);
    });
    return out;
  }

  // ---------- 用户管理 ----------
  function usersHtml() {
    if (loading) return '<div class="card"><div class="empty">加载中…</div></div>';
    var rows = users.map(function (u) {
      var eff = u.is_admin ? perms.map(function (p) { return p.key; }) : effectivePerms(u);
      var groupNames = (u.groups || []).map(function (g) { return g.name; }).join('、') || '—';
      return '<div class="cfg-row">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:500">' + U.esc(u.display_name || u.name) +
        ' <span style="color:#8f959e;font-weight:400;font-size:12px">(' + U.esc(u.name) + ')</span>' +
        (u.is_admin ? ' <span class="tag" style="background:#fff7e6;color:#d46b08">管理员</span>' : '') +
        (u.active === false ? ' <span class="tag" style="background:#f4f5f7;color:#8f959e">已停用</span>' : '') +
        '</div>' +
        '<div class="meta">角色：' + U.esc(u.role || '—') + ' · 所属组：' + U.esc(groupNames) + ' · 可访问菜单 ' + eff.length + ' 项</div></div>' +
        '<div class="acts">' +
        '<button title="配置菜单权限" onclick="Views.userManage.editPerms(\'' + U.esc(u.name) + '\')">' + U.icon('check', 14) + '</button>' +
        '<button title="加入用户组" onclick="Views.userManage.editGroups(\'' + U.esc(u.name) + '\')">' + U.icon('users', 14) + '</button>' +
        '<button title="编辑资料 / 重置密码" onclick="Views.userManage.resetPwd(\'' + U.esc(u.name) + '\')">' + U.icon('edit', 14) + '</button>' +
        '<button title="' + (u.active === false ? '启用' : '停用') + '" onclick="Views.userManage.toggleActive(\'' + U.esc(u.name) + '\', ' + (u.active === false ? 'true' : 'false') + ')">' + U.icon(u.active === false ? 'check' : 'close', 14) + '</button>' +
        (u.name === 'admin' ? '' : '<button title="删除" onclick="Views.userManage.removeUser(\'' + U.esc(u.name) + '\')">' + U.icon('trash', 14) + '</button>') +
        '</div></div>';
    }).join('');
    return '<div class="card"><div class="card-head"><h3>' + U.icon('users') + '用户账号</h3>' +
      '<span class="more"><button class="btn btn-primary btn-sm" onclick="Views.userManage.addUser()">' + U.icon('plus') + '新增用户</button></span></div>' +
      '<div class="cfg-list" style="max-height:560px">' + rows + '</div>' +
      '<div class="hint">用户名须取自「基础配置 · 工程师名单」，一名工程师对应一个账号；系统仅保留 admin 一个超级管理员。普通用户的权限 = 个人勾选的权限 ∪ 所在用户组的权限。</div></div>';
  }

  // 角色选项来自基础配置；current 不在列表时补入避免丢失
  function roleOptions(current) {
    var roles = (S.getState().settings.roles || []).slice();
    if (!roles.length) roles = ['工程师', '客服', '主管', '管理员'];
    if (current && roles.indexOf(current) < 0) roles.push(current);
    return roles.map(function (r) {
      return '<option value="' + U.esc(r) + '"' + (r === current ? ' selected' : '') + '>' + U.esc(r) + '</option>';
    }).join('');
  }

  // 用户名下拉：选项来自「基础配置 · 工程师名单」；已被其他账号占用的置灰
  function engineerOptions(current, selfName) {
    var all = (S.getState().settings.engineers || []);
    var names = all.filter(function (e) { return e.active !== false; })
      .map(function (e) { return e.name; })
      .filter(function (n) { return !!n; });
    if (current && names.indexOf(current) < 0) names.unshift(current);
    if (!names.length) return '';
    var used = {};
    users.forEach(function (u) {
      if (u.name !== selfName && u.display_name) used[u.display_name] = 1;
    });
    return names.map(function (n) {
      return '<option value="' + U.esc(n) + '"' + (n === current ? ' selected' : '') +
        (used[n] ? ' disabled' : '') + '>' + U.esc(n) + (used[n] ? '（已有账号）' : '') + '</option>';
    }).join('');
  }

  function addUser() {
    var opts = engineerOptions('', '');
    if (!opts) { U.toast('请先到「基础配置 · 工程师名单」添加工程师，用户名从中选择', 'err'); return; }
    U.modal('新增用户',
      '<div class="form-row"><label>用户名</label><select class="input" id="um-dname">' + opts + '</select></div>' +
      '<div class="form-row"><label>登录名</label><input class="input" id="um-name" placeholder="英文 / 数字，如 zhangsan"></div>' +
      '<div class="form-row"><label>初始密码</label><input class="input" id="um-pwd" type="password" placeholder="至少 1 位"></div>' +
      '<div class="form-row"><label>角色</label><select class="input" id="um-role">' +
      roleOptions('工程师') +
      '</select></div>' +
      '<div class="hint">用户名取自「基础配置 · 工程师名单」，一名工程师对应一个账号；登录名用于登录，建议填姓名拼音。</div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="um-save">创建</button>');
    document.getElementById('um-save').onclick = function () {
      var name = document.getElementById('um-name').value.trim();
      var dname = document.getElementById('um-dname').value.trim();
      var pwd = document.getElementById('um-pwd').value;
      var role = document.getElementById('um-role').value;
      if (!dname || !name || !pwd) { U.toast('请填写用户名、登录名和密码', 'err'); return; }
      S.createUser(name, pwd, role, dname).then(function () {
        U.closeModal(); U.toast('已创建用户 ' + dname, 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function resetPwd(name) {
    var u = users.filter(function (x) { return x.name === name; })[0] || {};
    var isSuper = name === 'admin';
    var opts = isSuper ? '' : engineerOptions(u.display_name || u.name, name);
    var nameField = (isSuper || !opts)
      ? '<input class="input" id="um-edname" value="' + U.esc(u.display_name || u.name) + '"' + (isSuper ? '' : ' disabled') + '>'
      : '<select class="input" id="um-edname">' + opts + '</select>';
    U.modal('编辑资料：' + name,
      '<div class="form-row"><label>用户名</label>' + nameField + '</div>' +
      '<div class="form-row"><label>角色</label><select class="input" id="um-erole">' +
      roleOptions(u.role) +
      '</select></div>' +
      '<div class="form-row"><label>新密码</label><input class="input" id="um-newpwd" type="password" placeholder="留空则不修改密码"></div>' +
      (isSuper ? '<div class="hint">内置超级管理员不受工程师名单限制。</div>'
        : '<div class="hint">用户名须取自「基础配置 · 工程师名单」。</div>'),
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="um-savepwd">保存</button>');
    document.getElementById('um-savepwd').onclick = function () {
      var dname = document.getElementById('um-edname').value.trim();
      var role = document.getElementById('um-erole').value;
      var pwd = document.getElementById('um-newpwd').value;
      if (!dname) { U.toast('用户名不能为空', 'err'); return; }
      var patch = { display_name: dname, role: role };
      if (pwd) patch.pwd = pwd;
      S.updateUser(name, patch).then(function () {
        U.closeModal(); U.toast('资料已保存', 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function toggleActive(name, active) {
    S.updateUser(name, { active: active }).then(function () {
      U.toast((active ? '已启用' : '已停用') + ' ' + name, 'ok'); refresh();
    }).catch(function (e) { U.toast(e.message, 'err'); });
  }

  function removeUser(name) {
    U.confirm('删除用户', '确定删除用户「' + U.esc(name) + '」？此操作不可恢复。', function () {
      S.deleteUser(name).then(function () { U.toast('已删除', 'ok'); refresh(); })
        .catch(function (e) { U.toast(e.message, 'err'); });
    }, '删除', true);
  }

  function editPerms(name) {
    var u = users.filter(function (x) { return x.name === name; })[0];
    if (!u) return;
    if (u.is_admin) { U.toast('管理员自动拥有全部权限，无需单独配置', 'err'); return; }
    U.modal('配置菜单权限：' + name,
      '<div style="font-size:12px;color:#8f959e;margin-bottom:8px">勾选该用户可访问的菜单；用户组已赋予的权限会自动叠加，此处仅管理个人权限。</div>' +
      permCheckboxesHtml(u.permissions || []),
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="um-saveperm">保存</button>');
    document.getElementById('um-saveperm').onclick = function () {
      S.setUserPermissions(name, readCheckedPerms()).then(function () {
        U.closeModal(); U.toast('权限已保存', 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function editGroups(name) {
    var u = users.filter(function (x) { return x.name === name; })[0];
    if (!u) return;
    var myIds = (u.groups || []).map(function (g) { return g.id; });
    var body = groups.length ? '<div class="perm-grid">' + groups.map(function (g) {
      var c = myIds.indexOf(g.id) >= 0 ? ' checked' : '';
      return '<label class="perm-item"><input type="checkbox" data-gid="' + g.id + '"' + c + '><span>' + U.esc(g.name) + ' <small style="color:#8f959e">(' + (g.permissions || []).length + ' 项权限)</small></span></label>';
    }).join('') + '</div>' : '<div class="empty">暂无用户组，请先到「用户组」标签创建</div>';
    U.modal('加入用户组：' + name, body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="um-savegrp">保存</button>');
    document.getElementById('um-savegrp').onclick = function () {
      var gids = [];
      document.querySelectorAll('.perm-grid input[type=checkbox][data-gid]').forEach(function (cb) {
        if (cb.checked) gids.push(parseInt(cb.dataset.gid, 10));
      });
      S.setUserGroups(name, gids).then(function () {
        U.closeModal(); U.toast('已更新用户组', 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  // ---------- 用户组 ----------
  function groupsHtml() {
    if (loading) return '<div class="card"><div class="empty">加载中…</div></div>';
    var rows = groups.length ? groups.map(function (g) {
      var pnames = (g.permissions || []).map(permName).join('、') || '未配置';
      var mcount = (g.members || []).length;
      return '<div class="cfg-row">' +
        '<div style="flex:1;min-width:0"><div style="font-weight:500">' + U.esc(g.name) +
        ' <span class="tag" style="background:#f0f5ff;color:#1677ff">' + mcount + ' 人</span></div>' +
        '<div class="meta">权限：' + U.esc(pnames) + '</div></div>' +
        '<div class="acts">' +
        '<button title="重命名" onclick="Views.userManage.renameGroup(' + g.id + ',\'' + U.esc(g.name) + '\')">' + U.icon('edit', 14) + '</button>' +
        '<button title="管理成员" onclick="Views.userManage.editMembers(' + g.id + ')">' + U.icon('users', 14) + '</button>' +
        '<button title="配置权限" onclick="Views.userManage.editGroupPerms(' + g.id + ')">' + U.icon('check', 14) + '</button>' +
        '<button title="删除" onclick="Views.userManage.removeGroup(' + g.id + ')">' + U.icon('trash', 14) + '</button>' +
        '</div></div>';
    }).join('') : '<div class="empty">还没有用户组，点击右上角创建</div>';
    return '<div class="card"><div class="card-head"><h3>' + U.icon('users') + '用户组</h3>' +
      '<span class="more"><button class="btn btn-primary btn-sm" onclick="Views.userManage.addGroup()">' + U.icon('plus') + '新增用户组</button></span></div>' +
      '<div class="cfg-list" style="max-height:560px">' + rows + '</div>' +
      '<div class="hint">用户组的权限会自动授予所有组员，便于批量授权；个人权限与组权限取并集。</div></div>';
  }

  function addGroup() {
    U.modal('新增用户组',
      '<div class="form-row"><label>组名</label><input class="input" id="gm-name" placeholder="如 客服组、工程师组"></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="gm-save">创建</button>');
    document.getElementById('gm-save').onclick = function () {
      var name = document.getElementById('gm-name').value.trim();
      if (!name) { U.toast('请输入组名', 'err'); return; }
      S.createGroup(name).then(function () { U.closeModal(); U.toast('已创建用户组', 'ok'); refresh(); })
        .catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function renameGroup(gid, name) {
    U.modal('重命名用户组',
      '<div class="form-row"><label>组名</label><input class="input" id="gm-rename" value="' + U.esc(name) + '"></div>',
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="gm-saverename">保存</button>');
    document.getElementById('gm-saverename').onclick = function () {
      var n = document.getElementById('gm-rename').value.trim();
      if (!n) { U.toast('组名不能为空', 'err'); return; }
      S.updateGroup(gid, n).then(function () { U.closeModal(); U.toast('已重命名', 'ok'); refresh(); })
        .catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function removeGroup(gid) {
    U.confirm('删除用户组', '确定删除该用户组？组内成员的权限将被收回，成员账号本身不会删除。', function () {
      S.deleteGroup(gid).then(function () { U.toast('已删除用户组', 'ok'); refresh(); })
        .catch(function (e) { U.toast(e.message, 'err'); });
    }, '删除', true);
  }

  function editGroupPerms(gid) {
    var g = groups.filter(function (x) { return x.id === gid; })[0];
    if (!g) return;
    U.modal('配置组权限：' + g.name, permCheckboxesHtml(g.permissions || []),
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="gm-saveperm">保存</button>');
    document.getElementById('gm-saveperm').onclick = function () {
      S.setGroupPermissions(gid, readCheckedPerms()).then(function () {
        U.closeModal(); U.toast('组权限已保存', 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function editMembers(gid) {
    var g = groups.filter(function (x) { return x.id === gid; })[0];
    if (!g) return;
    var members = g.members || [];
    var body = users.length ? '<div class="perm-grid">' + users.map(function (u) {
      var c = members.indexOf(u.name) >= 0 ? ' checked' : '';
      return '<label class="perm-item"><input type="checkbox" data-uname="' + U.esc(u.name) + '"' + c + '><span>' + U.esc(u.display_name || u.name) + '（' + U.esc(u.name) + '）' + (u.is_admin ? '（管理员）' : '') + '</span></label>';
    }).join('') + '</div>' : '<div class="empty">暂无用户</div>';
    U.modal('组成员：' + g.name, body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button><button class="btn btn-primary" id="gm-savemem">保存</button>');
    document.getElementById('gm-savemem').onclick = function () {
      var mems = [];
      document.querySelectorAll('.perm-grid input[type=checkbox][data-uname]').forEach(function (cb) {
        if (cb.checked) mems.push(cb.dataset.uname);
      });
      S.setGroupMembers(gid, mems).then(function () {
        U.closeModal(); U.toast('成员已更新', 'ok'); refresh();
      }).catch(function (e) { U.toast(e.message, 'err'); });
    };
  }

  function switchTab(t) { activeTab = t; App.render(); }

  function render() {
    if (!S.isAdmin()) {
      return '<div class="card"><div class="empty">仅管理员可访问用户与权限管理</div></div>';
    }
    var tabsHtml = ['<button class="' + (activeTab === 'users' ? 'on' : '') + '" onclick="Views.userManage.switchTab(\'users\')">用户账号</button>',
      '<button class="' + (activeTab === 'groups' ? 'on' : '') + '" onclick="Views.userManage.switchTab(\'groups\')">用户组</button>'].join('');
    return '<div class="page-head"><div><div class="page-title">用户与权限</div>' +
      '<div class="page-sub">管理登录账号、分配菜单可见权限，并通过用户组批量授权；管理员自动拥有全部权限。</div></div></div>' +
      '<div class="tabs">' + tabsHtml + '</div>' +
      (activeTab === 'users' ? usersHtml() : groupsHtml());
  }

  function mount() {
    if (S.isAdmin() && !loading && !users.length && !groups.length) refresh();
  }

  var vm = {
    render: render, mount: mount, switchTab: switchTab,
    addUser: addUser, resetPwd: resetPwd, toggleActive: toggleActive, removeUser: removeUser,
    editPerms: editPerms, editGroups: editGroups,
    addGroup: addGroup, renameGroup: renameGroup, removeGroup: removeGroup,
    editGroupPerms: editGroupPerms, editMembers: editMembers, refresh: refresh
  };
  window.Views['user-manage'] = vm;
  window.Views.userManage = vm;  // 别名，供 onclick 内联调用（避免引号嵌套）
})();
