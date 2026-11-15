/* 知识库：按故障分类沉淀处置经验，支持搜索、浏览与维护 */
(function () {
  'use strict';
  var S = window.Store, U = window.UI;
  var kw = '', cat = '';

  function categories() {
    var map = {};
    S.kbArticles().forEach(function (a) {
      var k = a.category || '未分类';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).map(function (k) {
      return { name: k, count: map[k] };
    });
  }

  function filtered() {
    return S.kbArticles().filter(function (a) {
      if (cat && (a.category || '未分类') !== cat) return false;
      if (kw) {
        var text = [a.title, a.scene, a.symptoms, a.notice, (a.tags || []).join(' '), (a.steps || []).join(' ')].join(' ').toLowerCase();
        if (text.indexOf(kw.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  function head() {
    var admin = S.isAdmin();
    var all = S.kbArticles();
    var views = all.reduce(function (n, a) { return n + (a.views || 0); }, 0);
    return '<div class="page-head"><div><div class="page-title">知识库</div>' +
      '<div class="page-sub">按故障类型沉淀处置步骤与注意事项，新问题先查知识库，再决定是否报修</div></div>' +
      '<div class="head-actions">' +
      '<input class="inp sm" style="width:220px" id="kb-kw" placeholder="搜索标题 / 现象 / 处理步骤" value="' + S.esc(kw) + '" onkeydown="if(event.key===\'Enter\')Views.kb.search()">' +
      '<button class="btn btn-primary btn-sm" onclick="Views.kb.search()">' + U.icon('search', 14) + '搜索</button>' +
      (admin ? '<button class="btn btn-primary" onclick="Views.kb.editArticle(\'\')">' + U.icon('plus', 15) + '新建文章</button>' : '') +
      '</div></div>' +
      '<div class="stat-line" style="margin:-6px 0 14px;padding-left:2px"><span>共 <b>' + all.length + '</b> 篇经验</span>' +
      '<span>覆盖 <b>' + categories().length + '</b> 类故障</span>' +
      '<span>累计浏览 <b>' + views + '</b> 次</span>' +
      '<span>标记有用 <b>' + all.reduce(function (n, a) { return n + (a.helpful || 0); }, 0) + '</b> 次</span></div>';
  }

  function side() {
    var cats = categories();
    var total = S.kbArticles().length;
    return '<div class="kb-side"><div class="kb-cat-title">故障分类</div>' +
      '<div class="kb-cat' + (cat === '' ? ' on' : '') + '" onclick="Views.kb.pickCat(\'\')">全部经验<span class="n">' + total + '</span></div>' +
      cats.map(function (c) {
        return '<div class="kb-cat' + (cat === c.name ? ' on' : '') + '" onclick="Views.kb.pickCat(\'' + S.esc(c.name) + '\')">' +
          S.esc(c.name) + '<span class="n">' + c.count + '</span></div>';
      }).join('') +
      '</div>';
  }

  function cards() {
    var list = filtered();
    if (!list.length) {
      return '<div class="kb-main"><div class="card"><div class="empty">' +
        (kw || cat ? '没有匹配的经验，试试调整关键词或分类' : '知识库还没有内容' + (S.isAdmin() ? '，点击右上角「新建文章」开始沉淀经验' : '')) +
        '</div></div></div>';
    }
    return '<div class="kb-main"><div class="kb-grid">' + list.map(function (a) {
      var catColor = '#1677ff';
      var ft = S.getState().settings.faultTypes.filter(function (x) { return x.name === a.category; })[0];
      if (ft && ft.color) catColor = ft.color;
      var refStats = S.kbRefStats();
      var hitCount = refStats[a.id] || a.hits || 0;
      var footParts = [];
      footParts.push((a.steps || []).length + ' 步骤');
      footParts.push('浏览 ' + (a.views || 0));
      footParts.push('有用 ' + (a.helpful || 0));
      if (hitCount > 0) footParts.push('<b style="color:#1677ff">引用 ' + hitCount + '</b>');
      var sourceTag = a.fromTicket
        ? '<span class="tag" style="background:#fff7e6;color:#d46b08">工单沉淀</span>'
        : (a.builtin ? '<span class="tag" style="background:#f0f2f5;color:#8f959e">系统内置</span>'
        : '<span class="tag" style="background:#e6fffb;color:#08979c">人工维护</span>');
      return '<div class="kb-card" onclick="Views.kb.openArticle(\'' + S.esc(a.id) + '\')">' +
        '<div class="kb-card-top"><span class="tag" style="background:' + catColor + '18;color:' + catColor + '">' + S.esc(a.category || '未分类') + '</span>' +
        sourceTag + '</div>' +
        '<div class="kb-title">' + S.esc(a.title) + '</div>' +
        '<div class="kb-desc">' + S.esc(a.scene || a.symptoms || '') + '</div>' +
        '<div class="kb-tags">' + (a.tags || []).slice(0, 3).map(function (t) { return '<span>#' + S.esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="kb-foot">' + footParts.map(function (x) { return typeof x === 'string' && x.indexOf('<') >= 0 ? x : '<span>' + x + '</span>'; }).join('') + '</div>' +
        '</div>';
    }).join('') + '</div></div>';
  }

  function render() {
    return head() + '<div class="kb-layout">' + side() + cards() + '</div>';
  }

  // ---------- 交互 ----------
  function search() {
    var el = document.getElementById('kb-kw');
    kw = (el && el.value) || '';
    window.App.render();
  }
  function pickCat(name) {
    cat = name;
    window.App.render();
  }

  function openArticle(id) {
    var a = S.viewArticle(id);
    if (!a) { U.toast('文章不存在', 'err'); return; }
    var admin = S.isAdmin();
    var helped = true;
    try { helped = localStorage.getItem('dhu_kb_help_' + id) === '1'; } catch (e) {}
    var body = '<div class="kb-detail">' +
      '<div class="kb-tags" style="margin-bottom:10px">' + (a.tags || []).map(function (t) { return '<span>#' + S.esc(t) + '</span>'; }).join('') + '</div>' +
      (a.scene ? '<h4>适用场景</h4><div class="kb-block">' + S.esc(a.scene) + '</div>' : '') +
      (a.symptoms ? '<h4>常见现象</h4><div class="kb-block">' + S.esc(a.symptoms) + '</div>' : '') +
      '<h4>处理步骤</h4><ol class="kb-steps">' + (a.steps || []).map(function (s) { return '<li>' + S.esc(s) + '</li>'; }).join('') + '</ol>' +
      (a.notice ? '<h4>注意事项</h4><div class="kb-block kb-warn">' + S.esc(a.notice) + '</div>' : '') +
      '<div class="stat-line" style="margin-top:14px"><span>来源 <b>' + S.esc(a.source || '—') + '</b></span>' +
      '<span>作者 <b>' + S.esc(a.author || '—') + '</b></span>' +
      '<span>更新 <b>' + S.fmtDT(a.updatedAt) + '</b></span>' +
      '<span>浏览 <b>' + (a.views || 0) + '</b></span></div></div>';

    var foot = '<button class="btn btn-ghost" onclick="UI.closeDrawer()">关闭</button>' +
      (helped ? '' : '<button class="btn btn-ghost" onclick="Views.kb.helpful(\'' + S.esc(a.id) + '\')">这条经验有用</button>') +
      (admin ? '<button class="btn btn-ghost" onclick="UI.closeDrawer();Views.kb.editArticle(\'' + S.esc(a.id) + '\')">编辑</button>' +
        '<button class="btn btn-orange" onclick="Views.kb.delArticle(\'' + S.esc(a.id) + '\')">删除</button>' : '');

    var ft = S.getState().settings.faultTypes.filter(function (x) { return x.name === a.category; })[0];
    var color = (ft && ft.color) || '#1677ff';
    U.openDrawer(S.esc(a.title), '<span class="tag" style="background:' + color + '18;color:' + color + '">' + S.esc(a.category || '未分类') + '</span>', body, foot);
  }

  function helpful(id) {
    try { localStorage.setItem('dhu_kb_help_' + id, '1'); } catch (e) {}
    S.helpfulArticle(id);
    U.toast('感谢反馈，已记为有用', 'ok');
    U.closeDrawer();
    window.App.render();
  }

  function editArticle(id) {
    if (!S.isAdmin()) { U.toast('仅管理员可维护知识库', 'err'); return; }
    var a = id ? S.kbArticles().filter(function (x) { return x.id === id; })[0] : null;
    var val = a || { title: '', category: '', tags: [], scene: '', symptoms: '', steps: [], notice: '', source: '' };
    var cats = S.getState().settings.faultTypes.map(function (f) { return f.name; });
    var body = '<div class="form">' +
      '<div class="form-row full"><label>标题 <span class="req">*</span></label><input class="inp" id="kb-title" value="' + S.esc(val.title) + '" placeholder="如 投影仪显示无信号"></div>' +
      '<div class="form-row"><label>故障分类</label><select class="inp" id="kb-cat"><option value="">未分类</option>' +
        cats.map(function (c) { return '<option' + (val.category === c ? ' selected' : '') + '>' + S.esc(c) + '</option>'; }).join('') +
        '</select><label>标签</label><input class="inp" id="kb-tags" value="' + S.esc((val.tags || []).join('、')) + '" placeholder="逗号分隔，如 投影、无信号"></div>' +
      '<div class="form-row full"><label>适用场景</label><input class="inp" id="kb-scene" value="' + S.esc(val.scene) + '" placeholder="一句话说明什么时候用这篇经验"></div>' +
      '<div class="form-row full"><label>常见现象</label><input class="inp" id="kb-symptoms" value="' + S.esc(val.symptoms) + '" placeholder="故障表现，便于搜索命中"></div>' +
      '<div class="form-row full"><label>处理步骤 <span class="req">*</span></label><textarea class="inp" rows="6" id="kb-steps" placeholder="每行一步，按操作顺序填写">' + S.esc((val.steps || []).join('\n')) + '</textarea></div>' +
      '<div class="form-row full"><label>注意事项</label><textarea class="inp" rows="2" id="kb-notice" placeholder="安全提示、耗材登记等">' + S.esc(val.notice) + '</textarea></div>' +
      '<div class="form-row full"><label>来源</label><input class="inp" id="kb-source" value="' + S.esc(val.source) + '" placeholder="如 现场处置沉淀 / 厂商手册"></div>' +
      '</div>';
    U.modal(a ? '编辑知识' : '新建知识', body,
      '<button class="btn btn-ghost" onclick="UI.closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="Views.kb.saveArticle(\'' + S.esc(id || '') + '\')">保存</button>', { wide: true });
  }

  function saveArticle(id) {
    var steps = ((document.getElementById('kb-steps') || {}).value || '').split('\n')
      .map(function (s) { return s.trim(); }).filter(Boolean);
    var input = {
      title: (document.getElementById('kb-title') || {}).value || '',
      category: (document.getElementById('kb-cat') || {}).value || '未分类',
      tags: ((document.getElementById('kb-tags') || {}).value || '').split(/[、,，\s]+/).filter(Boolean),
      scene: (document.getElementById('kb-scene') || {}).value || '',
      symptoms: (document.getElementById('kb-symptoms') || {}).value || '',
      steps: steps,
      notice: (document.getElementById('kb-notice') || {}).value || '',
      source: (document.getElementById('kb-source') || {}).value || '',
      author: (window.App.operator && window.App.operator()) || ''
    };
    try {
      if (id) S.updateArticle(id, input); else S.addArticle(input);
      U.closeModal();
      U.toast(id ? '文章已更新' : '文章已保存', 'ok');
      window.App.render();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function delArticle(id) {
    if (!S.isAdmin()) { U.toast('仅管理员可维护知识库', 'err'); return; }
    U.confirm('删除文章', '删除后不可恢复，确认删除这篇经验？', function () {
      S.removeArticle(id);
      U.closeDrawer();
      U.toast('文章已删除');
      window.App.render();
    }, '删除', true);
  }

  window.Views = window.Views || {};
  window.Views.kb = {
    render: render, search: search, pickCat: pickCat,
    openArticle: openArticle, helpful: helpful,
    editArticle: editArticle, saveArticle: saveArticle, delArticle: delArticle
  };
})();
