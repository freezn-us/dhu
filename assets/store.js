/* 东华大学多媒体教室运维系统 · 数据层
 * 纯前端、localStorage 持久化。所有业务状态变更都走这里，页面只负责渲染。
 */
(function (global) {
  'use strict';

  var KEY = 'dhu_ops_v1';
  var VERSION = 2;

  // 每日工作日志的时段与巡视检查项默认值（可在「基础配置 → 巡视配置」中修改）
  var PERIOD_DEFAULTS = [
    { key: 'am', name: '上午', time: '7:30-11:30', startHour: 7.5, endHour: 11.5, color: '#fa8c16',
      plan: '全校教室三时段巡视',
      patrol: '【课前巡检】检查中控系统、投影仪画面、音频/麦克风、网络连接、电源线路' },
    { key: 'pm', name: '下午', time: '13:00-17:00', startHour: 13, endHour: 17, color: '#1677ff',
      plan: '全校教室三时段巡视',
      patrol: '【午后巡检】检查设备运行状态、音频/麦克风、讲台环境、备用设备物料' },
    { key: 'ev', name: '晚上', time: '18:00-21:30', startHour: 18, endHour: 21.5, color: '#722ed1',
      plan: '全校教室三时段巡视',
      patrol: '【晚间巡检】检查设备关机状态、断电确认、门窗安全' }
  ];

  var PATROL_ITEM_DEFAULTS = [
    { key: 'zk', name: '中控/讲台通电自检', std: '通电正常 / 功能可用 / 无遗留故障' },
    { key: 'ty', name: '投影图像与亮度', std: '画面清晰 / 无偏色 / 亮度正常' },
    { key: 'yp', name: '音响 / 话筒扩音', std: '扩音正常 / 无啸叫 / 电池充足' },
    { key: 'wl', name: '网络与录播就绪', std: '网络认证正常 / 录播可启动' },
    { key: 'hb', name: '黑板 / 智慧屏笔触', std: '书写正常 / 触控灵敏' },
    { key: 'aq', name: '环境安全（插座/门锁）', std: '插座无松动 / 门锁完好' }
  ];

  // 运行时使用的配置（随 settings 同步更新）
  var PERIODS = JSON.parse(JSON.stringify(PERIOD_DEFAULTS));
  var PATROL_ITEMS = JSON.parse(JSON.stringify(PATROL_ITEM_DEFAULTS));
  // 无异常打卡时写入日志的默认工作内容 / 处理结果，支持 {时段} {日期} {项数} 占位
  var PATROL_SUMMARY_DEFAULT = '{时段}巡检完成（全部正常）';
  var PATROL_ACTION_DEFAULT = '{项数}项检查全部正常，设备可正常使用';

  // 日志「阶段」默认值（可在「基础配置 → 日志阶段」中增删改名并设置默认项）
  var STAGE_DEFAULTS = ['课前巡检', '上课中', '上课后'];
  var DEFAULT_STAGE = '课前巡检';

  // 角色字典默认值（可在基础配置中维护）
  var ROLE_DEFAULTS = ['工程师', '客服', '主管', '管理员'];

  var FAULT_TYPES = [
    { name: '中控/开机故障', color: '#f5222d', key: 'zk' },
    { name: '音频/麦克风', color: '#722ed1', key: 'yp' },
    { name: '线材/其他', color: '#fa8c16', key: 'xc' },
    { name: '网络/软件', color: '#13c2c2', key: 'wl' },
    { name: '投影仪问题', color: '#1677ff', key: 'ty' },
    { name: '服务类', color: '#52c41a', key: 'sv' }
  ];

  var ENGINEERS = [
    { id: 'e1', name: '周佳辉', phone: '138****6601', buildings: ['一教', '四教'], active: true },
    { id: 'e2', name: '李巍巍', phone: '138****6602', buildings: ['一教', '二教'], active: true },
    { id: 'e3', name: '刘铮', phone: '138****6603', buildings: ['二教', '化工楼'], active: true },
    { id: 'e4', name: '宋华', phone: '138****6604', buildings: ['二教', '中南楼'], active: true },
    { id: 'e5', name: '周围伟', phone: '138****6605', buildings: ['一教', '二教', '四教', '化工楼', '中南楼', '机房'], active: true },
    { id: 'e6', name: '刘丽', phone: '138****6606', buildings: ['机房', '中南楼'], active: true },
    { id: 'e7', name: '周杨', phone: '138****6607', buildings: ['四教', '化工楼'], active: true },
    { id: 'e8', name: '詹晓青', phone: '138****6608', buildings: ['化工楼', '中南楼', '四教'], active: true }
  ];

  var STATUS = {
    new:        { label: '待填报', cls: 'st-new', color: '#f5222d' },
    assigned:   { label: '已指派', cls: 'st-assigned', color: '#fa8c16' },
    processing: { label: '处理中', cls: 'st-processing', color: '#1677ff' },
    waiting:    { label: '待跟进', cls: 'st-waiting', color: '#722ed1' },
    resolved:   { label: '已处理', cls: 'st-resolved', color: '#13c2c2' },
    closed:     { label: '已记录', cls: 'st-closed', color: '#52c41a' },
    cancelled:  { label: '已取消', cls: 'st-cancelled', color: '#8f959e' }
  };

  var LOG_TYPES = {
    repair:  { label: '报修处理', color: '#1677ff', desc: '关联报修单，记录现场处理过程' },
    patrol:  { label: '日常巡检', color: '#52c41a', desc: '三时段巡视打卡自动生成' },
    routine: { label: '主动维护', color: '#fa8c16', desc: '课前课后主动检查、耗材更换' },
    other:   { label: '其他事项', color: '#722ed1', desc: '培训、咨询、临时借用等' }
  };

  var URGENCY = {
    '紧急': { slaMin: 120, desc: '课中故障，需优先到场' },
    '常规': { slaMin: 480, desc: '课前/课后，按序处理' },
    '低':   { slaMin: 1440, desc: '不影响上课，可排队' }
  };

  var CALLBACK = ['满意', '基本满意', '不满意', '未接通'];

  // ---------- 通用工具 ----------
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function nowLocal() { return new Date(); }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoLocal(d) { return dateKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseDT(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    s = String(s).trim().replace('T', ' ').replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ]+(\d{1,2}):(\d{1,2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0, 0);
  }
  function fmtDT(s) {
    var d = parseDT(s);
    if (!d) return '';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtFull(s) {
    var d = parseDT(s);
    if (!d) return '';
    return dateKey(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDate(s) {
    var d = parseDT(s);
    return d ? dateKey(d) : '';
  }
  function addMin(s, mins) {
    var d = parseDT(s);
    if (!d) return '';
    return isoLocal(new Date(d.getTime() + mins * 60000));
  }
  function minutesBetween(a, b) {
    var x = parseDT(a), y = parseDT(b);
    if (!x || !y) return null;
    var v = Math.round((y.getTime() - x.getTime()) / 60000);
    return v >= 0 ? v : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // 教学楼：4 位编号首位，或“N 教”前缀
  function buildingOf(room) {
    room = String(room || '').trim();
    if (!room) return '其他';
    var m = room.match(/^(\d)(\d{3})$/);
    if (m) return { '1': '一教', '2': '二教', '3': '三教', '4': '四教' }[m[1]] || '其他';
    if (/^1教/.test(room)) return '一教';
    if (/^2教/.test(room)) return '二教';
    if (/^3教/.test(room)) return '三教';
    if (/^4教/.test(room)) return '四教';
    if (room.indexOf('化工') === 0) return '化工楼';
    if (room.indexOf('中南') === 0) return '中南楼';
    if (room.indexOf('机房') >= 0) return '机房';
    return '其他';
  }
  function floorOf(room) {
    var m = String(room).match(/^(\d)(\d)(\d{2})$/);
    if (m) return parseInt(m[1][1] ? m[1] : m[1], 10) + '楼';
    var f = String(room).match(/^[1-4]教(\d)/);
    if (f) return f[1] + '楼';
    return '';
  }

  // 时间 → 时段（按当前配置的时段起止时间判断，空档归入前一时段）
  function periodOf(dt) {
    var d = parseDT(dt);
    var h = d ? d.getHours() + d.getMinutes() / 60 : 9;
    var best = PERIODS[0];
    for (var i = 0; i < PERIODS.length; i++) {
      var p = PERIODS[i];
      if (h >= p.startHour) best = p;
      if (h >= p.startHour && h < p.endHour) return p.key;
    }
    return best.key;
  }
  function periodInfo(key) {
    return PERIODS.filter(function (p) { return p.key === key; })[0] || PERIODS[0];
  }
  // 日期 + 时段 → 起始时间
  function periodStart(dateStr, key) {
    var p = periodInfo(key);
    var h = Math.floor(p.startHour), m = Math.round((p.startHour - h) * 60);
    return dateStr + 'T' + pad(h) + ':' + pad(m);
  }
  function weekInfo(dateStr) {
    var d = parseDT(dateStr);
    if (!d) return '';
    var wk = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
    // 以当年 9 月 1 日所在周为第 1 教学周（秋季学期）
    var sep1 = new Date(d.getFullYear(), 8, 1);
    var diff = Math.floor((d - sep1) / 86400000);
    var n = Math.floor(diff / 7) + 1;
    if (n < 1) n = 1;
    return '第' + n + '教学周 · ' + wk;
  }

  // ---------- 状态 ----------
  var state = null;
  var storageOK = true;
  var lastError = '';
  var serverRev = null; // 服务端状态版本号（乐观锁）：null 表示未知，保存时不携带

  function emptyState() {
    return {
      v: VERSION,
      createdAt: isoLocal(nowLocal()),
      settings: {
        org: '东华大学 · 松江校区',
        hotline: '8624',
        roles: ROLE_DEFAULTS.slice(),
        lessonStages: STAGE_DEFAULTS.slice(),
        defaultStage: DEFAULT_STAGE,
        faultTypes: deepCopy(FAULT_TYPES),
        engineers: deepCopy(ENGINEERS),
        patrolPeriods: JSON.parse(JSON.stringify(PERIOD_DEFAULTS)),
        patrolItems: JSON.parse(JSON.stringify(PATROL_ITEM_DEFAULTS)),
        patrolNormalSummary: PATROL_SUMMARY_DEFAULT,
        patrolNormalAction: PATROL_ACTION_DEFAULT,
        rooms: (global.DHU_ROOMS || []).map(function (r) { return { no: r.no, capacity: r.capacity, building: r.building, zone: 'A区', roomType: '多媒体教室', active: true }; }),
        schedule: {}    // { "2026-11-01": ["周佳辉","李巍巍"], ... }
        // 用户账号只存服务端 users 表，前端 state 不含任何密码
      },
      tickets: [],
      patrols: [],
      // 资产：设备台账（教室清单本身在 settings.rooms）
      assets: { devices: [] },
      // 知识库：内置常用处置经验，管理员可继续新增
      kb: { articles: seedArticles() }
    };
  }

  // 知识库内置条目（首次运行写入，可编辑或删除）
  function seedArticles() {
    var now = isoLocal(nowLocal());
    return [
      {
        id: 'kb-zk-01', title: '中控 / 讲台电脑开机无响应', category: '中控/开机故障',
        tags: ['中控', '开机', '投影'],
        scene: '课前教师反映按中控面板无反应，投影不出画面',
        symptoms: '中控面板指示灯不亮 / 按开机键无响应 / 讲台电脑无输出',
        steps: [
          '确认配电箱对应空开是否跳闸，复位后重新上电',
          '长按中控主机电源键 5 秒强制重启，等待指示灯转绿',
          '检查讲台电脑是否处于休眠，唤醒后切换信号源至「电脑」',
          '若仍无画面，用备用 HDMI 线直连投影验证，判断是中控还是线材问题',
          '恢复后在中控面板依次切换各信号源，确认画面与声音均正常'
        ],
        notice: '强电操作须由持证人员完成；更换线材后记得归位并登记耗材。',
        source: '现场高频处置', author: '系统内置', createdAt: now, updatedAt: now,
        views: 0, helpful: 0, builtin: true
      },
      {
        id: 'kb-ty-01', title: '投影仪显示无信号', category: '投影仪问题',
        tags: ['投影', '无信号', 'HDMI'],
        scene: '教师插上笔记本后投影显示「无信号」',
        symptoms: '投影画面停留在无信号提示，电脑端已识别外接显示器',
        steps: [
          '确认投影已开机且信号源与接入接口一致（HDMI1 / HDMI2）',
          '重新插拔 HDMI 线，必要时换用讲台备用线',
          '笔记本按 Win+P 选择「复制」模式，等待 5 秒',
          '分辨率过高时改为 1920×1080，避免超出投影支持范围',
          '上述无效则检查投影到中控的线序，或临时改用无线投屏'
        ],
        notice: '换线后请把原线收好，避免下一位教师找不到备用线。',
        source: '现场高频处置', author: '系统内置', createdAt: now, updatedAt: now,
        views: 0, helpful: 0, builtin: true
      },
      {
        id: 'kb-yp-01', title: '无线麦克风无声或啸叫', category: '音频/麦克风',
        tags: ['话筒', '扩音', '啸叫'],
        scene: '课堂扩音时无线麦无声，或音量稍大即出现啸叫',
        symptoms: '话筒指示灯不亮 / 扩音无声 / 高频尖锐啸叫',
        steps: [
          '更换话筒电池，确认接收机与话筒频点一致',
          '长按对频键完成对频，接收机信号灯常亮即成功',
          '啸叫时降低功放音量，话筒远离音箱并避免正对',
          '检查音频线是否插在「MIC」而非「LINE」接口',
          '恢复后请教师试音，确认音量适中、无断续'
        ],
        notice: '电池属易耗品，更换后请在日志中登记耗材领用。',
        source: '现场高频处置', author: '系统内置', createdAt: now, updatedAt: now,
        views: 0, helpful: 0, builtin: true
      },
      {
        id: 'kb-wl-01', title: '教室网络认证失败', category: '网络/软件',
        tags: ['网络', '认证', '录播'],
        scene: '教师无法上网，认证页面反复跳转或提示失败',
        symptoms: '浏览器提示认证超时 / 已认证但无法访问外网',
        steps: [
          '确认网线插在讲台「网络」口，指示灯闪烁',
          '关闭浏览器重新打开认证页，清除缓存后重试',
          '更换交换机端口或备用网线，排除线路故障',
          '确认账号密码正确，必要时联系网络中心核查',
          '认证成功后打开录播页面，确认可正常启动'
        ],
        notice: '涉及校园网账号问题请直接转网络中心，不要反复尝试导致账号锁定。',
        source: '现场高频处置', author: '系统内置', createdAt: now, updatedAt: now,
        views: 0, helpful: 0, builtin: true
      }
    ];
  }

  // ---------- 持久化：服务端 SQLite（write-behind，同步改内存 + 串行推回） ----------
  var TOKEN_KEY = 'dhu_ops_token';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }
  function authHeaders() {
    return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
  }

  // ---------- 审计日志（前端埋点 → /api/audit） ----------
  var auditQueue = [], auditTimer = null;
  function audit(category, action, target, detail) {
    if (!currentUser() || !action) return;
    auditQueue.push({ category: category || '系统', action: action, target: target || '', detail: detail || '' });
    if (auditTimer) return;
    auditTimer = setTimeout(function () {
      auditTimer = null;
      auditQueue.splice(0, auditQueue.length).forEach(function (item) {
        fetch('/api/audit', { method: 'POST', headers: authHeaders(), body: JSON.stringify(item) }).catch(function () {});
      });
    }, 200);
  }
  function listAudit(params) {
    var q = Object.keys(params || {}).filter(function (k) { return params[k] !== '' && params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return apiGet('audit' + (q ? '?' + q : ''));
  }

  // ---------- 审计日志：把内部字段翻译成业务语言，详情中不出现英文标识 ----------
  var AUDIT_FIELDS = {
    date: '日期', period: '时段', stage: '教学阶段', room: '教室编号', fault: '故障类型',
    desc: '工作内容', summary: '工作内容', action: '处理结果', remark: '备注',
    assignee: '责任人', helpers: '协办人', result: '处理状态', solved: '解决情况',
    status: '日志状态', devices: '涉及设备', device: '涉及设备', parts: '更换备件',
    capacity: '容量', zone: '区域', roomType: '教室类型', active: '启用状态',
    building: '所属楼宇', category: '设备类别', brand: '品牌型号', sn: '序列号',
    boughtAt: '启用日期', warrantyTo: '保修至', repairCount: '维修次数', note: '备注',
    name: '名称', phone: '手机号', buildings: '负责楼宇'
  };
  var AUDIT_VALUES = {
    status: { new: '待填报', assigned: '已指派', processing: '处理中', waiting: '待跟进', resolved: '已处理', closed: '已记录', cancelled: '已取消' },
    result: { fixed: '已修复', follow: '待跟进', unfixed: '未解决' },
    solved: { true: '已解决', false: '未解决' }
  };
  function auditPeriodName(key) {
    var p = PERIODS.filter(function (x) { return x.key === key; })[0];
    return p ? p.name : '';
  }
  function auditValueText(key, val) {
    if (val === undefined || val === null || val === '') return '空';
    if (Array.isArray(val)) return val.length ? val.join('、') : '空';
    if (key === 'active') return val ? '启用' : '停用';
    if (typeof val === 'boolean') return val ? '是' : '否';
    if (key === 'period') { var pn = auditPeriodName(val); if (pn) return pn; }
    var map = AUDIT_VALUES[key];
    if (map && map[String(val)] !== undefined) return map[String(val)];
    var s = String(val);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }
  // 对比修改前后的值，生成「教室编号 2113 → 2115」这样的说明
  function auditDiff(before, after, opts) {
    opts = opts || {};
    var skip = opts.skip || [], labels = opts.labels || {};
    var out = [];
    Object.keys(after || {}).forEach(function (k) {
      if (skip.indexOf(k) >= 0) return;
      var ov = (before || {})[k], nv = after[k];
      if (ov === undefined && nv === undefined) return;
      var same = (Array.isArray(ov) || Array.isArray(nv))
        ? JSON.stringify(ov || []) === JSON.stringify(nv || [])
        : String(ov == null ? '' : ov) === String(nv == null ? '' : nv);
      if (same) return;
      out.push((labels[k] || AUDIT_FIELDS[k] || '其他信息') + ' ' + auditValueText(k, ov) + ' → ' + auditValueText(k, nv));
    });
    return out.length ? out.join('；') : '内容未发生变化';
  }
  // 日志记录的业务化描述：日期 + 时段 + 教室
  function auditLogRef(t) {
    if (!t) return '';
    var d = fmtDate(t.createdAt);
    var pn = auditPeriodName(t.period || periodOf(t.createdAt));
    return d + (pn ? ' ' + pn : '') + (t.room ? ' · 教室 ' + t.room : '');
  }

  var saveQueue = Promise.resolve();
  var pendingSnapshot = null;   // 尚未发送的最新快照
  var saveTimer = null;
  var saveInFlight = false;
  var saveRetryTimer = null;    // 失败后的自动重试定时器
  var saveRetryCount = 0;       // 本轮连续失败次数（成功或用户再次编辑后清零）
  var SAVE_RETRY_LIMIT = 6;     // 自动重试上限，之后等待用户手动重试

  // 保存状态变化时通知界面（顶部“已同步/保存失败”指示器即时刷新）
  function emitSaveState() {
    try {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new Event('dhu-save-state'));
      }
    } catch (e) {}
  }

  function save() {
    // 内存状态已被调用方改好，这里把整体状态串行 POST 回服务端。
    // 250ms 内的连续保存只提交最后一份快照：一次业务操作常触发多次 save，
    // 合并后避免同一份状态被重复全量上传。
    if (!getToken()) return storageOK;
    pendingSnapshot = deepCopy(state);
    // 用户又产生了新修改：重置退避，尽快把最新快照发出去
    saveRetryCount = 0;
    if (saveRetryTimer) { clearTimeout(saveRetryTimer); saveRetryTimer = null; }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; pumpSave(); }, 250);
    return storageOK;
  }

  function pumpSave() {
    if (saveInFlight || saveRetryTimer || !pendingSnapshot) return;
    var snapshot = pendingSnapshot;
    pendingSnapshot = null;
    saveInFlight = true;
    saveQueue = postState(0, snapshot).then(function () {
      saveInFlight = false;
      saveRetryCount = 0;
      emitSaveState();
      pumpSave();
    }, function (err) {
      saveInFlight = false;
      // 失败后不能把这次修改丢掉：若期间没有更新的快照，保留它等待重试
      if (!pendingSnapshot) pendingSnapshot = snapshot;
      scheduleSaveRetry(!!(err && err.retry));
      emitSaveState();
    });
  }

  // 自动重试退避：2s、4s、8s、16s、30s… 最多 SAVE_RETRY_LIMIT 次，之后交给用户手动重试
  function scheduleSaveRetry(canRetry) {
    if (!canRetry || saveRetryCount >= SAVE_RETRY_LIMIT || saveRetryTimer) return;
    var delay = Math.min(2000 * Math.pow(2, saveRetryCount), 30000);
    saveRetryCount++;
    saveRetryTimer = setTimeout(function () {
      saveRetryTimer = null;
      pumpSave();
    }, delay);
  }

  // 供“保存失败”指示器点击时手动重试
  function retrySave() {
    if (!pendingSnapshot) {
      if (storageOK || !state) return;
      pendingSnapshot = deepCopy(state);
    }
    saveRetryCount = 0;
    if (saveRetryTimer) { clearTimeout(saveRetryTimer); saveRetryTimer = null; }
    pumpSave();
  }

  // 冲突时把本地独有记录并入服务端最新数据；同编号以本地为准（本机刚做的修改）
  function mergeConflict(local, remote) {
    var merged = deepCopy(remote);
    function mergeList(key, idKey) {
      var rlist = Array.isArray(merged[key]) ? merged[key] : [];
      var llist = Array.isArray(local[key]) ? local[key] : [];
      var seen = {};
      rlist.forEach(function (x) { if (x && x[idKey] != null) seen[x[idKey]] = true; });
      var out = rlist.slice();
      llist.forEach(function (x) {
        if (!x || x[idKey] == null) return;
        if (!seen[x[idKey]]) { out.push(deepCopy(x)); seen[x[idKey]] = true; return; }
        for (var i = 0; i < out.length; i++) {
          if (out[i] && out[i][idKey] === x[idKey]) { out[i] = deepCopy(x); break; }
        }
      });
      merged[key] = out;
    }
    mergeList('tickets', 'no');
    mergeList('patrols', 'id');
    return merged;
  }

  function postState(attempt, snapshot) {
    // 快照在入队时固定：冲突重试必须以本次保存的内容为基准，
    // 不能用共享的当前 state（队列中可能已有后续修改，直接取会互相覆盖）
    var payload = deepCopy(snapshot || state);
    if (serverRev != null) payload.baseRev = serverRev;
    delete payload.rev;
    return fetch('/api/state', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      .then(function (res) {
        if (res.status === 401) {
          storageOK = false;
          lastError = '登录状态已失效，请重新登录';
          handleSessionExpired();
          return Promise.reject({ keep: false, retry: false });
        }
        if (res.status === 409) {
          if (attempt >= 3) {
            storageOK = false;
            lastError = '数据已被其他客户端更新，请刷新页面后重试';
            return Promise.reject({ keep: false, retry: false });
          }
          // 版本冲突：有其他客户端先保存了。取回最新数据自动合并后重试
          return res.json().then(function (d) {
            var remote = d && d.state;
            var nextSnapshot = payload;
            if (remote && Array.isArray(remote.tickets)) {
              nextSnapshot = mergeConflict(payload, remote);
              applyRemote(deepCopy(nextSnapshot));
            } else if (d && typeof d.rev === 'number') {
              serverRev = d.rev; // 拿不到完整数据时至少对齐版本号
            }
            return postState(attempt + 1, nextSnapshot);
          }, function () {
            storageOK = false;
            lastError = '数据已被其他客户端更新，且无法读取最新数据，请刷新页面';
            return Promise.reject({ keep: false, retry: false });
          });
        }
        if (res.ok) {
          return res.json().then(function (d) {
            if (d && typeof d.rev === 'number') serverRev = d.rev;
            storageOK = true; lastError = '';
          }, function () { storageOK = true; lastError = ''; });
        }
        // 4xx 通常是权限/数据问题，重试无意义；5xx、408、429 可自动重试
        var retry = res.status >= 500 || res.status === 408 || res.status === 429;
        return res.json().then(function (d) {
          storageOK = false;
          lastError = (d && d.error) || ('服务器保存失败（HTTP ' + res.status + '）');
          return Promise.reject({ keep: true, retry: retry });
        }, function () {
          storageOK = false;
          lastError = '服务器保存失败（HTTP ' + res.status + '）';
          return Promise.reject({ keep: true, retry: retry });
        });
      })
      .catch(function (e) {
        if (e && (e.keep === true || e.keep === false)) throw e;
        storageOK = false;
        lastError = (e && e.message) ? ('无法连接服务器：' + e.message) : '无法连接服务器，请检查网络';
        throw { keep: true, retry: true };
      });
  }

  function handleSessionExpired() {
    setToken('');
    sessionUser = null;
    // token 失效：回到登录页
    if (location.protocol !== 'file:') location.reload();
  }

  // 巡视配置兜底：旧数据没有这些字段时补默认值，并同步到运行时数组
  function normalizePatrolSettings(s) {
    if (!Array.isArray(s.patrolPeriods) || !s.patrolPeriods.length) {
      s.patrolPeriods = JSON.parse(JSON.stringify(PERIOD_DEFAULTS));
    } else {
      var byKey = {};
      s.patrolPeriods.forEach(function (p) { if (p && p.key) byKey[p.key] = p; });
      s.patrolPeriods = PERIOD_DEFAULTS.map(function (d) {
        var p = byKey[d.key] || {};
        return {
          key: d.key,
          name: String(p.name || d.name),
          time: String(p.time || d.time),
          startHour: typeof p.startHour === 'number' ? p.startHour : d.startHour,
          endHour: typeof p.endHour === 'number' ? p.endHour : d.endHour,
          color: p.color || d.color,
          plan: String(p.plan || d.plan),
          patrol: String(p.patrol || d.patrol)
        };
      });
    }
    if (!Array.isArray(s.patrolItems) || !s.patrolItems.length) {
      s.patrolItems = JSON.parse(JSON.stringify(PATROL_ITEM_DEFAULTS));
    } else {
      s.patrolItems = s.patrolItems.map(function (it, i) {
        return { key: String(it.key || ('pi' + i)), name: String(it.name || ''), std: String(it.std || '') };
      }).filter(function (it) { return it.name; });
      if (!s.patrolItems.length) s.patrolItems = JSON.parse(JSON.stringify(PATROL_ITEM_DEFAULTS));
    }
    if (!s.patrolNormalSummary) s.patrolNormalSummary = PATROL_SUMMARY_DEFAULT;
    if (!s.patrolNormalAction) s.patrolNormalAction = PATROL_ACTION_DEFAULT;
  }

  function syncPatrolConfig() {
    var s = (state && state.settings) || {};
    normalizePatrolSettings(s);
    PERIODS.length = 0;
    s.patrolPeriods.forEach(function (p) { PERIODS.push(p); });
    PATROL_ITEMS.length = 0;
    s.patrolItems.forEach(function (it) { PATROL_ITEMS.push(it); });
  }

  function seedDemo() {
    state = emptyState();
    syncPatrolConfig();
    state.tickets = seedTickets(state);
    state.patrols = seedPatrols(state);
  }

  function applyRemote(obj) {
    state = obj;
    serverRev = (typeof obj.rev === 'number') ? obj.rev : null;
    // 配置兜底
    state.settings = state.settings || {};
    if (!Array.isArray(state.settings.roles) || !state.settings.roles.length) state.settings.roles = ROLE_DEFAULTS.slice();
    if (!Array.isArray(state.settings.lessonStages) || !state.settings.lessonStages.length) state.settings.lessonStages = STAGE_DEFAULTS.slice();
    if (!state.settings.defaultStage || state.settings.lessonStages.indexOf(state.settings.defaultStage) < 0) state.settings.defaultStage = state.settings.lessonStages[0];
    if (!Array.isArray(state.settings.faultTypes) || !state.settings.faultTypes.length) state.settings.faultTypes = deepCopy(FAULT_TYPES);
    state.settings.faultTypes.forEach(function (f) { if (!Array.isArray(f.symptoms)) f.symptoms = []; });
    if (!Array.isArray(state.settings.engineers) || !state.settings.engineers.length) state.settings.engineers = deepCopy(ENGINEERS);
    if (!Array.isArray(state.settings.rooms) || !state.settings.rooms.length) state.settings.rooms = emptyState().settings.rooms;
    if (!state.settings.schedule || typeof state.settings.schedule !== 'object') state.settings.schedule = {};
    // 资产档案与知识库兜底（旧版本数据没有这两个字段）
    if (!state.assets || !Array.isArray(state.assets.devices)) state.assets = { devices: [] };
    if (!state.kb || !Array.isArray(state.kb.articles)) {
      state.kb = { articles: seedArticles() };
    }
    delete state.settings.users; // 账号只在服务端
    migrate(state);
    syncPatrolConfig();
  }

  // 启动时调用：返回 Promise。resolve(用户名) 已登录；resolve(null) 需登录；reject 服务不可用。
  function load() {
    if (location.protocol === 'file:') {
      return Promise.reject(new Error('请通过 python server.py 启动后端后访问 http://127.0.0.1:8420'));
    }
    if (!getToken()) return Promise.resolve(null);
    return fetch('/api/state', { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) { setToken(''); sessionUser = null; return null; }
        if (res.status === 403) {
          // 首次登录未改密：服务端只放行 /api/me 等少数接口，先进入改密流程
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (d && d.code === 'must_change_password') {
              mustChangePwd = true;
              return { __mustChange: true };
            }
            throw new Error((d && d.error) || '服务器读取失败（HTTP 403）');
          });
        }
        if (!res.ok) throw new Error('服务器读取失败（HTTP ' + res.status + '）');
        return res.json();
      })
      .then(function (obj) {
        if (obj === null) return null; // 401
        if (obj && obj.__mustChange) {
          return refreshMe().then(function () { return sessionUser; }, function () { return sessionUser; });
        }
        if (!obj || !Array.isArray(obj.tickets)) {
          // 服务端首次为空：生成演示数据并推回
          seedDemo();
          save();
        } else {
          applyRemote(obj);
        }
        // 拉取当前登录用户的权限信息（刷新页面后补齐）
        return refreshMe().then(function () { return sessionUser; }, function () { return sessionUser; });
      });
  }

  // 旧版本（工单）→ 日志：编号 BX→WL，补时段/类型/时长
  function migrate(obj) {
    var changed = false;
    if (!Array.isArray(obj.patrols)) { obj.patrols = []; changed = true; }
    (obj.tickets || []).forEach(function (t) {
      if (t.no && /^BX-/.test(t.no)) {
        var newNo = 'WL-' + t.no.slice(3);
        if (!obj.tickets.some(function (x) { return x.no === newNo; })) t.no = newNo;
      }
      if (!t.period) t.period = periodOf(t.createdAt);
      if (!t.logType) t.logType = t.source === '巡检' ? 'patrol' : 'repair';
      if (!t.summary) t.summary = t.desc || '';
      if (!t.detail) t.detail = '';
      if (t.durationMin == null) {
        var hm = minutesBetween(t.arrivedAt, t.resolvedAt);
        t.durationMin = hm == null ? 0 : hm;
      }
      if (t.devices == null) t.devices = t.device || '';
      if (t.helpers == null) t.helpers = '';
      if (t.logType == null) t.logType = 'repair';
      changed = true;
    });
    if (obj.v !== VERSION || changed) obj.v = VERSION;
    // 排班兜底
    if (!obj.settings) obj.settings = {};
    if (!obj.settings.schedule || typeof obj.settings.schedule !== 'object') { obj.settings.schedule = {}; changed = true; }
    if (obj.settings.users) delete obj.settings.users; // 旧版本遗留的明文账号，剥离
    if (changed) save();
  }

  function getState() { if (!state) state = emptyState(); return state; }

  // ---------- 演示数据 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var FAULT_WEIGHT = [
    ['中控/开机故障', 0.50], ['音频/麦克风', 0.20], ['线材/其他', 0.12],
    ['网络/软件', 0.08], ['投影仪问题', 0.08], ['服务类', 0.02]
  ];
  var DESCS = {
    '中控/开机故障': ['中控电脑开机指令无响应', '电脑未启动，屏幕无信号', '控制屏不显示，电源未开启', '教室电源总闸跳闸', '未纳入中控系统，需手动开机'],
    '音频/麦克风': ['功放有嗡鸣声', '无线麦没有声音', '小蜜蜂没电，无法扩音', '麦克风啸叫严重', '扩音器无声，怀疑线材松动'],
    '线材/其他': ['显示器不显示', 'HDMI 接口松动，信号时断时续', '老师需要一根 USB 延长线', '实物展台无法对焦', '讲台电源插排损坏'],
    '网络/软件': ['课件打不开，文件名中文识别异常', '网络认证失败，无法上网', '云桌面无法登录', '播放软件无法识别视频格式'],
    '投影仪问题': ['投影仪闪屏', '投影画面偏色', '投影无信号输出', '投影亮度不足，灯泡报警'],
    '服务类': ['老师咨询教室设备使用方法', '临时借用无线麦克风', '课后设备复位与归拢']
  };
  var ACTIONS = {
    '中控/开机故障': ['手动开机，画面恢复正常', '远程云桌面唤醒', '开启电闸，设备恢复供电', '重启中控主机后恢复'],
    '音频/麦克风': ['更换电池后正常', '重新插拔功放音频线，杂音消失', '更换备用无线麦', '调节音量与频道后恢复'],
    '线材/其他': ['更换 HDMI 线材后正常', '重新紧固接口', '提供 USB 延长线并测试', '调整展台焦距'],
    '网络/软件': ['课件转存为英文文件名后播放正常', '重新认证网络后恢复', '重启云桌面客户端', '更换播放器解决'],
    '投影仪问题': ['调整分辨率后闪屏消失', '重新插拔视频线恢复信号', '更换投影灯泡', '报修厂商检修'],
    '服务类': ['现场讲解操作方法', '借用设备并登记', '设备复位完成']
  };
  var PARTS = ['', '', '', '电池 2 节', 'HDMI 线 1 根', '无线麦克风 1 支', '投影灯泡 1 只', 'USB 延长线 1 根'];
  var CALLERS = ['张老师', '李老师', '王老师', '陈老师', '刘老师', '孙老师', '吴老师', '周老师', '马老师', '胡老师'];
  var SOURCES = ['电话', '电话', '电话', '电话', '巡检', '巡检'];

  function pickWeighted(rand) {
    var r = rand(), acc = 0;
    for (var i = 0; i < FAULT_WEIGHT.length; i++) {
      acc += FAULT_WEIGHT[i][1];
      if (r <= acc) return FAULT_WEIGHT[i][0];
    }
    return FAULT_WEIGHT[0][0];
  }
  function pickOne(arr, rand) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

  function seedTickets(st) {
    var rand = mulberry32(20261105);
    var rooms = st.settings.rooms.filter(function (r) { return /^\d{4}$/.test(r.no); });
    if (!rooms.length) rooms = [{ no: '2113', building: '二教' }];
    var engineers = st.settings.engineers;
    var tickets = [];
    var today = nowLocal();
    var seqByDate = {};
    var TOTAL = 96;
    var todaySpecs = [[25, 'new'], [50, 'assigned'], [95, 'processing'], [140, 'waiting'], [200, 'closed'], [300, 'closed'], [420, 'closed'], [540, 'closed']];

    for (var i = 0; i < TOTAL; i++) {
      var isToday = i >= TOTAL - todaySpecs.length;
      var created;
      if (isToday) {
        var spec = todaySpecs[i - (TOTAL - todaySpecs.length)];
        created = isoLocal(new Date(today.getTime() - spec[0] * 60000));
      } else {
        var daysAgo = 1 + Math.floor(rand() * 33);
        var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
        var hour = 7 + Math.floor(rand() * 12);
        var minute = Math.floor(rand() * 60);
        if (hour > 18) { hour = 18; minute = Math.floor(rand() * 40); }
        created = isoLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute));
      }
      var dk = fmtDate(created);
      seqByDate[dk] = (seqByDate[dk] || 0) + 1;
      var no = 'WL-' + dk.replace(/-/g, '') + '-' + pad(seqByDate[dk]);

      var room = pickOne(rooms, rand);
      var fault = pickWeighted(rand);
      var desc = pickOne(DESCS[fault], rand);
      var urgencyRoll = rand();
      var urgency = urgencyRoll < 0.25 ? '紧急' : urgencyRoll < 0.8 ? '常规' : '低';
      var source = pickOne(SOURCES, rand);
      var b = room.building || buildingOf(room.no);
      var candidates = engineers.filter(function (e) { return e.active !== false && (e.buildings || []).indexOf(b) >= 0; });
      if (!candidates.length) candidates = engineers.filter(function (e) { return e.active !== false; });
      var eng = pickOne(candidates, rand).name;

      // 依据时间远近决定状态：越早越可能已闭环
      var r2 = rand();
      var status;
      if (isToday) status = spec[1];
      else {
        var ageDays = (today.getTime() - parseDT(created).getTime()) / 86400000;
        if (ageDays > 3) status = r2 < 0.9 ? 'closed' : 'cancelled';
        else status = r2 < 0.72 ? 'closed' : r2 < 0.8 ? 'resolved' : r2 < 0.86 ? 'waiting' : r2 < 0.92 ? 'cancelled' : r2 < 0.97 ? 'processing' : r2 < 0.99 ? 'assigned' : 'new';
      }

      var t = {
        no: no, createdAt: created, caller: pickOne(CALLERS, rand), phone: '内线 82' + pad(Math.floor(rand() * 90) + 10),
        room: room.no, building: b, device: fault === '投影仪问题' ? '投影仪' : fault === '音频/麦克风' ? '扩音设备' : fault === '中控/开机故障' ? '中控/讲台电脑' : fault === '网络/软件' ? '网络/云桌面' : '线材/外设',
        devices: '', fault: fault, desc: desc, summary: desc, detail: '',
        urgency: urgency, status: status, source: source, period: periodOf(created),
        logType: source === '巡检' ? 'patrol' : 'repair', helpers: '',
        assignee: '', assignedAt: '', acceptedAt: '', arrivedAt: '', action: '', parts: '',
        solved: null, resolvedAt: '', durationMin: 0, callback: '', satisfaction: 0, closedAt: '', remark: '',
        timeline: []
      };
      t.devices = t.device;
      t.timeline.push({ at: created, text: '来电登记 · 生成日志 ' + no, by: '客服 王丽', type: 'create' });

      if (status !== 'new' && status !== 'cancelled') {
        var dispatchAt = addMin(created, isToday ? 4 : 2 + Math.floor(rand() * 13));
        t.assignee = eng; t.assignedAt = dispatchAt;
        t.timeline.push({ at: dispatchAt, text: '指派给 ' + eng, by: '客服 王丽', type: 'dispatch' });
        if (status !== 'assigned') {
          var acceptAt = addMin(dispatchAt, isToday ? 4 : 2 + Math.floor(rand() * 18));
          t.acceptedAt = acceptAt;
          t.timeline.push({ at: acceptAt, text: eng + ' 开始处理', by: eng, type: 'accept' });
          var arriveAt = addMin(acceptAt, isToday ? 8 : 5 + Math.floor(rand() * 25));
          if (minutesBetween(created, arriveAt) > 24 * 60) arriveAt = addMin(created, 60);
          t.arrivedAt = arriveAt;
          t.timeline.push({ at: arriveAt, text: '到达教室 ' + t.room, by: eng, type: 'arrive' });
        }
      }
      if (['resolved', 'closed', 'waiting'].indexOf(status) >= 0) {
        var solved = status !== 'waiting' ? true : false;
        var resolvedAt = addMin(t.arrivedAt, isToday ? 18 : 20 + Math.floor(rand() * 100));
        t.action = pickOne(ACTIONS[fault], rand);
        t.parts = solved ? pickOne(PARTS, rand) : '';
        t.solved = solved; t.resolvedAt = resolvedAt;
        t.durationMin = minutesBetween(t.arrivedAt, resolvedAt) || 0;
        t.detail = '现场确认：' + desc + '。处理过程：' + t.action + '。';
        t.timeline.push({ at: resolvedAt, text: solved ? '处理完成：' + t.action : '暂未解决，转待件跟进：' + t.action, by: eng, type: solved ? 'resolve' : 'waiting' });
      }
      if (status === 'closed') {
        var closedAt = addMin(t.resolvedAt, isToday ? 20 : 15 + Math.floor(rand() * 60));
        var cbRoll = rand();
        t.callback = cbRoll < 0.72 ? '满意' : cbRoll < 0.9 ? '基本满意' : cbRoll < 0.96 ? '不满意' : '未接通';
        t.satisfaction = t.callback === '满意' ? 5 : t.callback === '基本满意' ? 4 : t.callback === '不满意' ? 2 : 0;
        t.closedAt = closedAt;
        t.remark = t.callback === '不满意' ? '教师反馈仍有轻微问题，已安排复查' : '';
        t.timeline.push({ at: closedAt, text: '客服回访：' + t.callback + '，日志已记录', by: '客服 王丽', type: 'close' });
      }
      if (status === 'cancelled') {
        t.timeline.push({ at: addMin(created, 10), text: '日志取消（重复报修/教师自行恢复）', by: '客服 王丽', type: 'cancel' });
      }
      tickets.push(t);
    }
    // 保证过去 14 天有连续数据，按时间倒序
    tickets.sort(function (a, b) { return parseDT(b.createdAt) - parseDT(a.createdAt); });
    return tickets;
  }

  // 每日 3 个时段巡视任务（首次访问某天时自动生成）
  function seedPatrols(st) {
    var out = [];
    var now = nowLocal();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var ds = dateKey(d);
      PERIODS.forEach(function (p) {
        var done = i > 0;
        if (i === 0) done = now.getHours() >= Math.ceil(p.startHour) + 2;
        var task = {
          id: 'PT-' + ds.replace(/-/g, '') + '-' + p.key,
          date: ds, period: p.key, name: p.name + '巡检', plan: p.plan,
          assignee: i % 2 ? '李巍巍' : '周佳辉',
          status: done ? 'done' : (i === 0 ? 'pending' : 'missed'),
          results: {}, at: done ? addMin(periodStart(ds, p.key), 25 + i * 3) : '',
          by: done ? (i % 2 ? '李巍巍' : '周佳辉') : '', remark: '',
          abnormal: '', logNo: '', repairNo: ''
        };
        if (done) PATROL_ITEMS.forEach(function (it) { task.results[it.key] = 'pass'; });
        if (i === 1 && p.key === 'pm') {
          task.abnormal = '2213 话筒无声，已转报修';
          task.results.yp = 'fail';
          task.repairNo = '';
        }
        out.push(task);
      });
    }
    return out;
  }

  // 确保某天有 3 个巡视任务（打开巡视/日志页时调用）
  function ensurePatrols(dateStr) {
    var st = getState();
    dateStr = dateStr || fmtDate(nowLocal());
    var exists = (st.patrols || []).filter(function (p) { return p.date === dateStr; });
    if (exists.length !== PERIODS.length) {
      var created = false;
      PERIODS.forEach(function (p) {
        if (exists.some(function (x) { return x.period === p.key; })) return;
        st.patrols.push({
          id: 'PT-' + dateStr.replace(/-/g, '') + '-' + p.key,
          date: dateStr, period: p.key, name: p.name + '巡检', plan: p.plan,
          assignee: '当班工程师', status: dateStr < fmtDate(nowLocal()) ? 'missed' : 'pending',
          results: {}, at: '', by: '', remark: '', abnormal: '', logNo: '', repairNo: ''
        });
        created = true;
      });
      if (created) save();
    }
    autoCompleteOverduePatrols();
    return st.patrols.filter(function (p) { return p.date === dateStr; });
  }

  // 巡视超过计划结束时间仍未打卡 → 自动完成并生成巡检日志
  // 长期生效：当天过点即完成；此前遗留的待打卡任务（含跨天未打开系统）下次打开时同样按此规则补完成
  function autoCompleteOverduePatrols() {
    var today = fmtDate(nowLocal());
    var now = nowLocal();
    var nowHour = now.getHours() + now.getMinutes() / 60;
    getState().patrols.filter(function (p) {
      return p.status === 'pending';
    }).forEach(function (task) {
      if (!task.date || task.date > today) return;                 // 未来日期的任务暂不处理
      var p = periodInfo(task.period);
      if (task.date === today && nowHour < p.endHour) return;      // 当天还未到时段结束时间
      var results = {};
      PATROL_ITEMS.forEach(function (it) { results[it.key] = 'pass'; });
      try {
        checkinPatrol(task.id, {
          results: results,
          by: task.assignee || '当班工程师',
          remark: '超过计划结束时间（' + p.time + '）未打卡，系统自动完成',
          auto: true
        });
      } catch (e) { /* 单条失败不影响其他任务 */ }
    });
  }

  // ---------- 工单编号 ----------
  function nextNo(dateStr) {
    var dk = (dateStr || '').replace(/-/g, '').slice(0, 8);
    var max = 0;
    getState().tickets.forEach(function (t) {
      var m = String(t.no || '').match(/(?:BX|WL)-(\d{8})-(\d+)/);
      if (m && m[1] === dk) max = Math.max(max, parseInt(m[2], 10));
    });
    return 'WL-' + dk + '-' + pad(max + 1);
  }

  function recommendEngineer(building) {
    var list = getState().settings.engineers.filter(function (e) { return e.active !== false; });
    var open = {};
    getState().tickets.forEach(function (t) {
      if (['assigned', 'processing', 'waiting'].indexOf(t.status) >= 0 && t.assignee) open[t.assignee] = (open[t.assignee] || 0) + 1;
    });
    var cand = list.filter(function (e) { return (e.buildings || []).indexOf(building) >= 0; });
    cand.sort(function (a, b) { return (open[a.name] || 0) - (open[b.name] || 0); });
    return cand[0] || list[0] || null;
  }

  // ---------- 工单写入 ----------
  function findTicket(no) {
    return getState().tickets.filter(function (t) { return t.no === no; })[0] || null;
  }

  function normalizeUrgency(u) {
    var s = String(u || '').trim();
    if (['紧急', 'P1', 'P0', '课中优先'].indexOf(s) >= 0) return '紧急';
    if (['低', 'P3', '非紧急'].indexOf(s) >= 0) return '低';
    return '常规';
  }

  function validateBase(input) {
    var errs = [];
    if (!input.room) errs.push('请填写教室编号');
    if (!input.desc) errs.push('请填写故障现象');
    if (!input.fault) errs.push('请选择故障类型');
    if (!input.createdAt) errs.push('请填写来电时间');
    return errs;
  }

  function createTicket(input) {
    var st = getState();
    var errs = validateBase(input);
    if (errs.length) throw new Error(errs[0]);
    var created = input.createdAt;
    var no = input.no || nextNo(fmtDate(created));
    if (findTicket(no)) throw new Error('日志编号已存在：' + no);
    var building = input.building || buildingOf(input.room);
    var status = 'new';
    var helpers = (input.helpers || '').split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (input.assignee) helpers = helpers.filter(function (x) { return x !== input.assignee; });
    helpers = helpers.join('，');
    var t = {
      no: no, createdAt: created, caller: input.caller || '未登记', phone: input.phone || '',
      room: input.room, building: building, device: input.device || '',
      devices: input.device || '', fault: input.fault, symptom: input.symptom || '', desc: input.desc, summary: input.desc, detail: '',
      urgency: normalizeUrgency(input.urgency), period: input.period || periodOf(created),
      stage: input.stage || '', logType: 'repair', helpers: helpers,
      createdBy: input.createdBy || currentUser() || '',
      status: status, source: input.source || '电话',
      assignee: '', assignedAt: '', acceptedAt: '', arrivedAt: '', action: '', parts: '',
      solved: null, resolvedAt: '', durationMin: 0, callback: '', satisfaction: 0, closedAt: '', remark: input.remark || '',
      kbRefs: (input.kbRefs || []).filter(Boolean),
      timeline: [{ at: created, text: '来电登记 · 生成报修日志 ' + no, by: input.operator || '客服 王丽', type: 'create' }]
    };
    if (input.assignee) {
      t.assignee = input.assignee;
      t.assignedAt = input.assignedAt || created;
      t.status = 'assigned';
      t.timeline.push({ at: t.assignedAt, text: '指派给 ' + input.assignee, by: input.operator || '客服 王丽', type: 'dispatch' });
    }
    st.tickets.unshift(t);
    save();
    audit('工单', '来电登记', no, '教室 ' + (t.room || '—') + ' · ' + (t.fault || '') + (t.assignee ? ' · 指派 ' + t.assignee : ' · 未指派'));
    return t;
  }

  // ---------- 日志写入（每日日志 / 单条录入 / 巡视自动生成） ----------
  function addLog(input) {
    var st = getState();
    var dateStr = input.date || fmtDate(input.createdAt || nowLocal());
    var period = input.period || periodOf(input.createdAt || nowLocal());
    var created = input.createdAt || periodStart(dateStr, period);
    var no = input.no || nextNo(dateStr);
    if (findTicket(no)) throw new Error('日志编号已存在：' + no);
    var room = String(input.room || '').trim();
    var duration = input.durationMin == null ? 20 : Math.max(0, parseInt(input.durationMin, 10) || 0);
    var resolvedAt = input.resolvedAt || addMin(created, duration);
    var t = {
      no: no, createdAt: created, caller: input.caller || (input.source === '巡检' ? '巡检记录' : '现场记录'),
      phone: input.phone || '', room: room, building: input.building || buildingOf(room),
      device: input.devices || input.device || '', devices: input.devices || input.device || '',
      fault: input.fault || '服务类', symptom: input.symptom || '', desc: input.desc || input.summary || '现场处理',
      summary: input.summary || input.desc || '', detail: input.detail || '',
      urgency: input.urgency || '常规', status: input.status || 'closed', source: input.source || '日志填报',
      period: period, stage: input.stage || '', logType: input.logType || 'repair', helpers: input.helpers || '',
      createdBy: input.createdBy || (input.logType === 'patrol' ? 'system' : (currentUser() || '')),
      assignee: input.assignee || '', assignedAt: input.assignee ? (input.assignedAt || created) : '',
      acceptedAt: input.assignee ? (input.acceptedAt || created) : '',
      arrivedAt: input.assignee ? (input.arrivedAt || created) : created,
      action: input.action || '', parts: input.parts || '', solved: input.solved !== false,
      result: input.result || (input.status === 'waiting' ? 'follow' : 'fixed'),
      resolvedAt: resolvedAt, durationMin: duration,
      callback: input.callback || '', satisfaction: input.satisfaction || 0,
      closedAt: input.status === 'waiting' ? '' : (input.closedAt || resolvedAt),
      remark: input.remark || '',
      kbRefs: (input.kbRefs || []).filter(Boolean),
      timeline: [{ at: created, text: '日志填报 · ' + LOG_TYPES[input.logType || 'repair'].label + ' ' + no, by: input.operator || '当班工程师', type: 'create' }]
    };
    if (input.action) t.timeline.push({ at: resolvedAt, text: '处理结果：' + input.action, by: t.assignee || input.operator || '当班工程师', type: 'resolve' });
    st.tickets.unshift(t);
    save();
    if (t.logType !== 'patrol') {
      audit('日志', '新增日志', no, auditLogRef(t) + '：' + (t.summary || t.desc || '未填写工作内容') +
        (t.action ? '；处理结果：' + t.action : ''));
    }
    return t;
  }

  // 待填报的报修日志（来电登记产生，尚未填写处理结果）
  function pendingRepairs() {
    var open = ['new', 'assigned', 'processing'];
    return getState().tickets.filter(function (t) { return open.indexOf(t.status) >= 0; })
      .sort(function (a, b) { return parseDT(b.createdAt) - parseDT(a.createdAt); });
  }

  // 待跟进：已填报但处理状态为「未解决 / 待跟进」的报修单
  function waitingRepairs() {
    return getState().tickets.filter(function (t) { return t.status === 'waiting'; })
      .sort(function (a, b) { return parseDT(b.createdAt) - parseDT(a.createdAt); });
  }

  // 处理结果三态（日志详情展示用）：已修复 / 待跟进 / 未解决
  function resultInfo(t) {
    if (t.status === 'closed') return { label: '已修复', color: '#52c41a' };
    if (t.status === 'waiting') {
      return t.result === 'unfixed'
        ? { label: '未解决', color: '#f5222d' }
        : { label: '待跟进', color: '#722ed1' };
    }
    var s = STATUS[t.status] || STATUS.closed;
    return { label: s.label, color: s.color };
  }

  // 把待填报报修日志补全为正式日志（保留原编号）
  function fillLog(no, input) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    var dateStr = input.date || fmtDate(input.createdAt || nowLocal());
    var period = input.period || periodOf(input.createdAt || nowLocal());
    var created = input.createdAt || t.createdAt;
    var duration = input.durationMin == null ? 20 : Math.max(0, parseInt(input.durationMin, 10) || 0);
    var resolvedAt = input.resolvedAt || addMin(created, duration);
    t.createdAt = created;
    t.period = period;
    if (input.stage !== undefined) t.stage = input.stage;
    if (input.room) { t.room = input.room; t.building = input.building || buildingOf(input.room); }
    if (input.fault) t.fault = input.fault;
    if (input.symptom !== undefined) t.symptom = input.symptom;
    if (input.desc) { t.desc = input.desc; t.summary = input.desc; }
    t.action = input.action || '';
    t.detail = input.detail || t.detail || '';
    t.parts = input.parts || '';
    t.devices = input.devices || t.devices || '';
    t.device = t.devices;
    t.assignee = input.assignee || t.assignee || '';
    t.helpers = input.helpers || '';
    t.durationMin = duration;
    t.resolvedAt = resolvedAt;
    // 按提交的处理结果流转：未解决 / 待跟进保留在待跟进列表，只有已修复才转为已记录
    var solved = input.solved !== false && input.status !== 'waiting';
    t.solved = solved;
    t.status = solved ? 'closed' : 'waiting';
    t.result = input.result || (solved ? 'fixed' : 'follow');
    t.closedAt = solved ? resolvedAt : '';
    t.logType = input.logType || 'repair';
    t.source = t.source || '日志填报';
    t.remark = input.remark || t.remark || '';
    t.createdBy = currentUser() || t.createdBy || '';
    if (Array.isArray(input.kbRefs) && input.kbRefs.length) {
      var existing = t.kbRefs || [];
      t.kbRefs = existing.concat(input.kbRefs.filter(function (id) { return existing.indexOf(id) < 0; }));
    }
    t.timeline.push({ at: resolvedAt, text: (solved ? '日志补录完成：' : '暂未解决，转待跟进：') + (t.action || '现场处理'), by: t.assignee || input.operator || '当班工程师', type: solved ? 'close' : 'waiting' });
    save();
    audit('日志', '填报处理结果', no, auditLogRef(t) + '：处理结果「' + (t.action || '未填写') + '」；状态：' + (solved ? '已修复' : '待跟进'));
    return t;
  }

  function logsByDate(dateStr, period) {
    return getState().tickets.filter(function (t) {
      return fmtDate(t.createdAt) === dateStr && (!period || (t.period || periodOf(t.createdAt)) === period);
    }).sort(function (a, b) { return parseDT(a.createdAt) - parseDT(b.createdAt); });
  }

  function logsBetween(from, to) {
    return getState().tickets.filter(function (t) {
      var d = fmtDate(t.createdAt);
      return d >= from && d <= to;
    });
  }

  // ---------- 巡视 ----------
  function patrolsOf(dateStr) {
    return ensurePatrols(dateStr).sort(function (a, b) {
      return PERIODS.map(function (p) { return p.key; }).indexOf(a.period) - PERIODS.map(function (p) { return p.key; }).indexOf(b.period);
    });
  }

  // 填充默认工作内容/处理结果模板中的占位符
  function fillPatrolText(tpl, p, count, dateStr) {
    return String(tpl || '')
      .replace(/\{时段\}/g, p.name)
      .replace(/\{日期\}/g, dateStr || '')
      .replace(/\{项数\}/g, String(count));
  }

  function checkinPatrol(id, opts) {
    var st = getState();
    var task = (st.patrols || []).filter(function (p) { return p.id === id; })[0];
    if (!task) throw new Error('巡视任务不存在');
    opts = opts || {};
    task.results = opts.results || {};
    task.remark = opts.remark || '';
    task.abnormal = opts.abnormal || '';
    task.status = 'done';
    task.at = isoLocal(nowLocal());
    task.by = opts.by || '当班工程师';
    task.assignee = task.by;
    if (opts.auto) task.auto = true; else delete task.auto;
    var p = periodInfo(task.period);
    var fails = PATROL_ITEMS.filter(function (it) { return task.results[it.key] === 'fail'; });
    var allPass = fails.length === 0;
    // 多教室（优先使用 rooms 数组，兼容旧 room 单值）
    var rooms = opts.rooms && opts.rooms.length ? opts.rooms.slice() : (opts.room ? [opts.room] : []);
    // 生成一条巡检日志（巡检本身不需要绑定具体教室，把异常教室写进 summary/remark）
    var abnormalExtra = rooms.length ? '；涉及教室：' + rooms.join('、') : '';
    var cfg = st.settings || {};
    var normalSummary = fillPatrolText(cfg.patrolNormalSummary || PATROL_SUMMARY_DEFAULT, p, PATROL_ITEMS.length, task.date);
    var normalAction = fillPatrolText(cfg.patrolNormalAction || PATROL_ACTION_DEFAULT, p, PATROL_ITEMS.length, task.date);
    var log = addLog({
      date: task.date, period: task.period, createdAt: periodStart(task.date, task.period),
      room: rooms.length === 1 ? rooms[0] : '', fault: '服务类', logType: 'patrol', source: '巡检',
      summary: allPass ? normalSummary : (p.name + '巡检发现 ' + fails.length + ' 项异常' + abnormalExtra),
      desc: p.patrol,
      detail: PATROL_ITEMS.map(function (it) {
        return it.name + '：' + (task.results[it.key] === 'fail' ? '异常' : '正常');
      }).join('；') + (task.abnormal ? '；异常说明：' + task.abnormal : ''),
      action: allPass ? normalAction : ('已记录异常并转报修：' + (task.abnormal || fails.map(function (f) { return f.name; }).join('、')) + abnormalExtra),
      assignee: task.by, durationMin: 20, solved: allPass,
      remark: task.remark, operator: task.by
    });
    task.logNo = log.no;
    // 有异常且选择了教室 → 每个教室生成一条待填报报修日志
    task.repairNos = [];
    if (!allPass && opts.createRepair && rooms.length) {
      rooms.forEach(function (room) {
        try {
          var repair = createTicket({
            room: room, fault: opts.repairFault || '服务类',
            desc: opts.abnormal || ('巡检异常：' + fails.map(function (f) { return f.name; }).join('、')),
            urgency: '常规', source: '巡检', createdAt: isoLocal(nowLocal()),
            caller: '巡视人员', remark: '由 ' + task.name + ' 自动生成，异常说明：' + (task.abnormal || fails.map(function (f) { return f.name; }).join('、')),
            operator: task.by
          });
          task.repairNos.push(repair.no);
        } catch (e) { /* 单条失败不影响其他 */ }
      });
    }
    // 兼容旧字段 repairNo（存第一个，避免历史代码读不到）
    task.repairNo = task.repairNos[0] || '';
    save();
    audit('巡视', opts.auto ? '巡视超时自动完成' : '巡视打卡', task.date + ' ' + p.name,
      allPass ? '全部检查项正常' : ('发现异常 ' + fails.length + ' 项：' + fails.map(function (f) { return f.name; }).join('、') +
        (rooms.length ? '；相关教室 ' + rooms.join('、') : '')));
    return { task: task, log: log, repairNos: task.repairNos, repairNo: task.repairNo };
  }

  function patrolSummary(dateStr) {
    var list = patrolsOf(dateStr);
    var done = list.filter(function (p) { return p.status === 'done'; }).length;
    var abnormal = list.filter(function (p) {
      return Object.keys(p.results || {}).some(function (k) { return p.results[k] === 'fail'; });
    }).length;
    return { total: list.length, done: done, pending: list.length - done, abnormal: abnormal, list: list };
  }

  function touch(t, text, by, type, at) {
    t.timeline = t.timeline || [];
    t.timeline.push({ at: at || isoLocal(nowLocal()), text: text, by: by, type: type || 'event' });
  }

  function dispatch(no, engineer, at) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (t.status !== 'new') throw new Error('只有「待填报」可以指派');
    if (!engineer) throw new Error('请选择工程师');
    t.assignee = engineer; t.assignedAt = at || isoLocal(nowLocal()); t.status = 'assigned';
    touch(t, '指派给 ' + engineer, '客服 王丽', 'dispatch', t.assignedAt);
    save(); audit('工单', '指派工程师', no, '将工单指派给工程师「' + engineer + '」' + (t.room ? '；教室 ' + t.room : '')); return t;
  }

  function accept(no, at) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (t.status !== 'assigned') throw new Error('只有「已指派」可以开始处理');
    t.acceptedAt = at || isoLocal(nowLocal()); t.status = 'processing';
    touch(t, t.assignee + ' 开始处理', t.assignee, 'accept', t.acceptedAt);
    save(); audit('工单', '开始处理', no, '工程师「' + t.assignee + '」开始处理' + (t.room ? '；教室 ' + t.room : '')); return t;
  }

  function arrive(no, at) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (['assigned', 'processing'].indexOf(t.status) < 0) throw new Error('当前状态不能标记到场');
    if (!t.acceptedAt) { t.acceptedAt = at || isoLocal(nowLocal()); touch(t, t.assignee + ' 开始处理', t.assignee, 'accept', t.acceptedAt); }
    t.arrivedAt = at || isoLocal(nowLocal()); t.status = 'processing';
    touch(t, '到达教室 ' + t.room, t.assignee, 'arrive', t.arrivedAt);
    save(); audit('工单', '标记到场', no, '已到达教室 ' + (t.room || '—')); return t;
  }

  function resolve(no, payload) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (['assigned', 'processing', 'waiting'].indexOf(t.status) < 0) throw new Error('当前状态不能提交处理结果');
    if (!payload.action) throw new Error('请填写处理措施');
    if (!t.arrivedAt) t.arrivedAt = payload.arrivedAt || payload.resolvedAt || isoLocal(nowLocal());
    t.action = payload.action;
    t.parts = payload.parts || '';
    t.solved = !!payload.solved;
    t.resolvedAt = payload.resolvedAt || isoLocal(nowLocal());
    t.status = t.solved ? 'resolved' : 'waiting';
    touch(t, (t.solved ? '处理完成：' : '暂未解决，转待件跟进：') + t.action, t.assignee, t.solved ? 'resolve' : 'waiting', t.resolvedAt);
    save(); audit('工单', t.solved ? '提交处理结果' : '转待跟进', no,
      '处理结果「' + t.action + '」；状态：' + (t.solved ? '已修复' : '待跟进') + (t.room ? '；教室 ' + t.room : '')); return t;
  }

  function close(no, payload) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (t.status !== 'resolved') throw new Error('只有「已处理」可以回访记录');
    t.callback = payload.callback || '满意';
    t.satisfaction = Number(payload.satisfaction || 0);
    t.remark = payload.remark || '';
    t.closedAt = payload.closedAt || isoLocal(nowLocal());
    t.status = 'closed';
    touch(t, '客服回访：' + t.callback + '，日志已记录', '客服 王丽', 'close', t.closedAt);
    save(); audit('工单', '回访关闭', no,
      '回访结果：' + t.callback + (t.satisfaction ? '；满意度 ' + t.satisfaction + ' 星' : '') + (t.room ? '；教室 ' + t.room : '')); return t;
  }

  function cancel(no, reason) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    if (['closed', 'cancelled'].indexOf(t.status) >= 0) throw new Error('该日志已结束');
    t.status = 'cancelled';
    t.remark = reason || t.remark || '';
    touch(t, '日志取消' + (reason ? '：' + reason : ''), '客服 王丽', 'cancel');
    save(); audit('工单', '取消工单', no, '取消原因：' + (reason || '未填写') + (t.room ? '；教室 ' + t.room : '')); return t;
  }

  function updateTicket(no, patch) {
    var t = findTicket(no);
    if (!t) throw new Error('日志不存在');
    var before = {};
    Object.keys(patch || {}).forEach(function (k) {
      if (k !== 'no' && k !== 'timeline') before[k] = t[k];
    });
    Object.keys(patch || {}).forEach(function (k) {
      if (k === 'no' || k === 'timeline') return;
      if (k === 'kbRefs' && Array.isArray(patch.kbRefs)) {
        var existing = Array.isArray(t.kbRefs) ? t.kbRefs.slice() : [];
        patch.kbRefs.forEach(function (id) { if (id && existing.indexOf(id) < 0) existing.push(id); });
        t.kbRefs = existing;
      } else {
        t[k] = patch[k];
      }
    });
    save();
    var skip = ['no', 'timeline', 'summary'];
    if (patch && patch.result !== undefined) skip = skip.concat(['solved', 'status']);
    var ref = {
      createdAt: t.createdAt,
      period: before.period !== undefined ? before.period : t.period,
      room: before.room !== undefined ? before.room : t.room
    };
    audit('日志', '修改日志', no, '修改「' + auditLogRef(ref) + '」：' + auditDiff(before, patch, { skip: skip }));
    return t;
  }

  function removeTicket(no) {
    var st = getState();
    var i = st.tickets.findIndex(function (t) { return t.no === no; });
    if (i < 0) throw new Error('日志不存在');
    var removed = st.tickets[i];
    st.tickets.splice(i, 1);
    save();
    audit('日志', '删除日志', no, '删除「' + auditLogRef(removed) + '」：' + (removed.summary || removed.desc || '未填写工作内容') +
      (removed.assignee ? '；责任人 ' + removed.assignee : ''));
  }

  // ---------- 统计 ----------
  function inRange(dateStr, from, to) {
    var d = String(dateStr || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }
  function avg(arr) {
    if (!arr.length) return null;
    return Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length);
  }

  function stats(from, to, stage) {
    var st = getState();
    var list = st.tickets.filter(function (t) { return inRange(t.createdAt, from, to); });
    if (stage === '__none__') list = list.filter(function (t) { return !t.stage; });
    else if (stage) list = list.filter(function (t) { return (t.stage || '') === stage; });
    var total = list.length;
    var byStatus = {}, byType = {}, byBuilding = {}, byRoom = {}, byUrg = {}, byEng = {}, daily = {};
    Object.keys(STATUS).forEach(function (k) { byStatus[k] = 0; });

    var dispatchMins = [], arriveMins = [], handleMins = [], closeMins = [], sats = [];
    var slaOk = 0, slaBase = 0;

    list.forEach(function (t) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byType[t.fault] = (byType[t.fault] || 0) + 1;
      byBuilding[t.building || buildingOf(t.room)] = (byBuilding[t.building || buildingOf(t.room)] || 0) + 1;
      byRoom[t.room] = (byRoom[t.room] || 0) + 1;
      byUrg[t.urgency] = (byUrg[t.urgency] || 0) + 1;
      daily[fmtDate(t.createdAt)] = (daily[fmtDate(t.createdAt)] || 0) + 1;
      var dm = minutesBetween(t.createdAt, t.assignedAt);
      if (dm != null) dispatchMins.push(dm);
      var am = minutesBetween(t.createdAt, t.arrivedAt);
      if (am != null) arriveMins.push(am);
      var hm = minutesBetween(t.arrivedAt, t.resolvedAt);
      if (hm != null) handleMins.push(hm);
      var cm = minutesBetween(t.createdAt, t.closedAt);
      if (cm != null && t.status === 'closed') closeMins.push(cm);
      if (t.satisfaction > 0) sats.push(t.satisfaction);
      if (t.arrivedAt) {
        slaBase++;
        var limit = (URGENCY[t.urgency] || URGENCY['常规']).slaMin;
        if (am != null && am <= limit) slaOk++;
      }
      if (t.assignee) {
        byEng[t.assignee] = byEng[t.assignee] || { name: t.assignee, total: 0, resolved: 0, closed: 0, handle: [], sat: [] };
        var e = byEng[t.assignee];
        e.total++;
        if (['resolved', 'closed'].indexOf(t.status) >= 0) e.resolved++;
        if (t.status === 'closed') e.closed++;
        if (hm != null) e.handle.push(hm);
        if (t.satisfaction > 0) e.sat.push(t.satisfaction);
      }
    });

    var engList = Object.keys(byEng).map(function (k) {
      var e = byEng[k];
      return {
        name: e.name, total: e.total, resolved: e.resolved, closed: e.closed,
        handleAvg: avg(e.handle), sat: e.sat.length ? (e.sat.reduce(function (a, b) { return a + b; }, 0) / e.sat.length) : null
      };
    }).sort(function (a, b) { return b.total - a.total; });

    var typeList = Object.keys(byType).map(function (k) { return { name: k, count: byType[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    var buildingList = Object.keys(byBuilding).map(function (k) { return { name: k, count: byBuilding[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    var roomList = Object.keys(byRoom).map(function (k) { return { name: k, count: byRoom[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    var statusList = Object.keys(byStatus).map(function (k) {
      var s = STATUS[k] || {};
      return { name: s.label || k, key: k, count: byStatus[k], color: s.color || '#8f959e' };
    }).filter(function (s) { return s.count > 0; })
      .sort(function (a, b) { return b.count - a.count; });

    var trend = Object.keys(daily).sort().map(function (d) {
      return { date: d, count: daily[d] };
    });

    return {
      from: from, to: to, stage: stage || '', total: total, list: list,
      closed: byStatus.closed, open: total - byStatus.closed - byStatus.cancelled, cancelled: byStatus.cancelled,
      urgent: byUrg['紧急'] || 0,
      byStatus: byStatus, byType: byType, byBuilding: byBuilding, byUrg: byUrg,
      typeList: typeList, buildingList: buildingList, roomList: roomList,
      statusList: statusList, trend: trend,
      daily: daily,
      avgDispatch: avg(dispatchMins), avgArrive: avg(arriveMins), avgHandle: avg(handleMins), avgClose: avg(closeMins),
      satisfaction: sats.length ? (sats.reduce(function (a, b) { return a + b; }, 0) / sats.length) : null,
      slaRate: slaBase ? Math.round(slaOk / slaBase * 1000) / 10 : null,
      engineers: engList
    };
  }

  // 近 N 天逐日数据（含 0）
  function dailySeries(days) {
    var st = getState();
    var out = [];
    var today = nowLocal();
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var key = dateKey(d);
      var count = st.tickets.filter(function (t) { return fmtDate(t.createdAt) === key; }).length;
      out.push({ date: key, label: pad(d.getMonth() + 1) + '/' + pad(d.getDate()), count: count });
    }
    return out;
  }

  // ---------- 导入 / 导出 ----------
  var HEADER_MAP = {
    '日志编号': 'no', '工单号': 'no', '单号': 'no', '报修单号': 'no',
    '来电时间': 'createdAt', '报修时间': 'createdAt', '时间': 'createdAt', '日期': 'createdAt',
    '报修人': 'caller', '来电人': 'caller', '联系人': 'caller',
    '联系电话': 'phone', '电话': 'phone', '来电号码': 'phone',
    '教室': 'room', '教室编号': 'room', '房间': 'room', '教室号': 'room',
    '设备': 'device', '设备类别': 'device',
    '故障类型': 'fault', '故障分类': 'fault',
    '故障现象': 'desc', '故障描述': 'desc', '工作内容': 'desc', '报修内容': 'desc',
    '紧急度': 'urgency', '紧急程度': 'urgency', '优先级': 'urgency',
    '状态': 'status', '工单状态': 'status', '日志状态': 'status',
    '工程师': 'assignee', '处理人': 'assignee', '指派给': 'assignee', '责任人': 'assignee',
    '指派时间': 'assignedAt', '派单时间': 'assignedAt', '开始处理时间': 'acceptedAt', '接单时间': 'acceptedAt', '到场时间': 'arrivedAt',
    '处理措施': 'action', '处置办法': 'action', '处理结果': 'action',
    '更换耗材': 'parts', '耗材': 'parts',
    '是否解决': 'solvedText', '是否已解决': 'solvedText',
    '处理完成时间': 'resolvedAt', '完成时间': 'resolvedAt', '完结时间': 'closedAt', '结单时间': 'closedAt',
    '回访结果': 'callback', '满意度': 'satisfactionText', '备注': 'remark', '来源': 'source',
    '时段': 'period', '序号': 'seq'
  };
  var STATUS_MAP = {
    '待填报': 'new', '待派单': 'new', '新单': 'new', '已登记': 'new', 'new': 'new',
    '已指派': 'assigned', '已派单': 'assigned', '待到场': 'assigned', 'assigned': 'assigned',
    '处理中': 'processing', 'processing': 'processing', '已到场': 'processing',
    '待跟进': 'waiting', '待件': 'waiting', '挂起': 'waiting', '待件/挂起': 'waiting', 'waiting': 'waiting',
    '已处理': 'resolved', '已解决': 'resolved', '已修复': 'resolved', 'resolved': 'resolved',
    '已记录': 'closed', '已结单': 'closed', '已完成': 'closed', 'closed': 'closed',
    '已取消': 'cancelled', 'cancelled': 'cancelled'
  };

  function normalizeHeader(h) {
    return String(h || '').replace(/^\uFEFF/, '').replace(/[\s*（）()]/g, '').trim();
  }

  function excelSerialToDate(n) {
    // Excel 1900 日期系统
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0);
  }

  function normalizeDateTime(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isoLocal(v);
    if (typeof v === 'number') return isoLocal(excelSerialToDate(v));
    var s = String(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) return isoLocal(excelSerialToDate(parseFloat(s)));
    s = s.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, ' ').replace(/\//g, '-');
    var m = s.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
    if (!m) return '';
    var dt = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return isoLocal(dt);
  }

  function mapRow(row) {
    var out = {};
    Object.keys(row).forEach(function (k) {
      var key = HEADER_MAP[normalizeHeader(k)];
      if (key) out[key] = row[k];
    });
    return out;
  }

  function parseRows(rows, opts) {
    opts = opts || {};
    var result = { ok: [], errors: [], warnings: [] };
    var now = isoLocal(nowLocal());
    var usedSeq = {};
    var seenNo = {};
    function genNo(createdAt) {
      var dk = fmtDate(createdAt).replace(/-/g, '');
      var base = nextNo(fmtDate(createdAt));
      var seq = parseInt(base.slice(-2), 10) || 1;
      if (usedSeq[dk]) seq = Math.max(seq, usedSeq[dk] + 1);
      usedSeq[dk] = seq;
      return 'WL-' + dk + '-' + pad(seq);
    }
    rows.forEach(function (raw, idx) {
      if (!raw || Object.keys(raw).length === 0) return;
      var r = mapRow(raw);
      // 全空行忽略
      var hasValue = Object.keys(r).some(function (k) { return String(r[k] == null ? '' : r[k]).trim() !== ''; });
      if (!hasValue) return;
      var line = idx + 2;
      var createdAt = normalizeDateTime(r.createdAt);
      var room = String(r.room == null ? '' : r.room).split(/[、,，/\s]+/)[0].trim();
      // 教室编号为空也正常导入，导出时该列留空
      var faultRaw = String(r.fault == null ? '' : r.fault).trim();
      var st = getState();
      var faultNames = st.settings.faultTypes.map(function (f) { return f.name; });
      // "正常" 不作为故障类型：优先按 service 处理；如无字典匹配再标记
      if (faultRaw === '正常') {
        faultRaw = '服务类';
      }
      var fault = faultNames.filter(function (n) { return n === faultRaw; })[0] ||
                  faultNames.filter(function (n) { return n.indexOf(faultRaw) >= 0 || faultRaw.indexOf(n) >= 0; })[0];
      var desc = String(r.desc == null ? '' : r.desc).trim();
      if (/^故障类型说明/.test(desc)) return;   // 表尾说明行不是日志
      var errs = [];
      if (!createdAt) errs.push('来电时间无法识别');
      if (!fault) errs.push('故障类型「' + faultRaw + '」不在字典中');
      if (!desc) errs.push('缺少故障现象');
      if (errs.length) {
        result.errors.push({ line: line, msg: errs.join('；'), row: raw });
        return;
      }
      var statusRaw = String(r.status == null ? '' : r.status).trim();
      var status = STATUS_MAP[statusRaw] || '';
      if (statusRaw && !status) result.warnings.push({ line: line, msg: '状态「' + statusRaw + '」未识别，按「待填报」导入' });
      status = status || 'new';
      var urgency = normalizeUrgency(r.urgency);
      var solvedText = String(r.solvedText == null ? '' : r.solvedText).trim();
      var solved = solvedText ? (['是', '已解决', '解决', 'true', '1'].indexOf(solvedText) >= 0 ? true : ['否', '未解决', 'false', '0'].indexOf(solvedText) >= 0 ? false : null) : null;
      var satText = String(r.satisfactionText == null ? '' : r.satisfactionText).trim();
      var sat = satText ? (parseFloat(satText.replace(/[^0-9.]/g, '')) || 0) : 0;
      if (sat > 5) sat = Math.round(sat / 2 * 10) / 10;
      var no = String(r.no == null ? '' : r.no).trim();
      var dk8 = fmtDate(createdAt).replace(/-/g, '');
      if (no) {
        var mm = no.match(/(?:BX|WL)-(\d{8})-(\d+)/);
        if (mm && mm[1] === dk8) usedSeq[dk8] = Math.max(usedSeq[dk8] || 0, parseInt(mm[2], 10));
      }
      if (!no || findTicket(no) || seenNo[no]) {
        if (no) result.warnings.push({ line: line, msg: '日志编号「' + no + '」重复，已自动重编号' });
        no = genNo(createdAt);
      }
      seenNo[no] = true;
      var assignedAt = normalizeDateTime(r.assignedAt);
      var acceptedAt = normalizeDateTime(r.acceptedAt);
      var arrivedAt = normalizeDateTime(r.arrivedAt);
      var resolvedAt = normalizeDateTime(r.resolvedAt);
      var closedAt = status === 'closed' ? (resolvedAt ? addMin(resolvedAt, 30) : addMin(createdAt, 120)) : '';
      var assigneeRaw = String(r.assignee == null ? '' : r.assignee).trim();
      // 责任人可能是多人组合（用 ，,、或空格分隔），取第一个作为主责，其余进备注
      var assignee = assigneeRaw, extraOwners = '';
      if (assigneeRaw && /[，,、\s]+/.test(assigneeRaw)) {
        var parts = assigneeRaw.split(/[，,、\s]+/).filter(function (x) { return x && x.trim(); });
        if (parts.length >= 2) {
          assignee = parts[0];
          extraOwners = parts.slice(1).join('、');
        }
      }
      var engNames = getState().settings.engineers.map(function (e) { return e.name; });
      if (assignee && engNames.indexOf(assignee) < 0) {
        result.warnings.push({ line: line, msg: '工程师「' + assignee + '」不在名单中，仍按文本导入' });
      }
      if (!assignedAt && assignee && (status !== 'new') && status !== 'cancelled') assignedAt = addMin(createdAt, 5);
      if (!arrivedAt && status !== 'new' && status !== 'assigned' && status !== 'cancelled') arrivedAt = acceptedAt || addMin(assignedAt || createdAt, 20);
      if (!acceptedAt && arrivedAt && status !== 'cancelled') acceptedAt = addMin(assignedAt || createdAt, 3);
      if (!resolvedAt && ['resolved', 'closed', 'waiting'].indexOf(status) >= 0) resolvedAt = addMin(arrivedAt || createdAt, 40);

      var callback = String(r.callback == null ? '' : r.callback).trim();
      if (!callback && status === 'closed') callback = '满意';
      var remarkFinal = String(r.remark == null ? '' : r.remark).trim();
      if (extraOwners) remarkFinal = (remarkFinal ? remarkFinal + '；' : '') + '当班工程师：' + extraOwners;
      var t = {
        no: no, createdAt: createdAt, caller: String(r.caller == null ? '' : r.caller).trim() || '未登记',
        phone: String(r.phone == null ? '' : r.phone).trim(),
        room: room, building: buildingOf(room), device: String(r.device == null ? '' : r.device).trim() || '',
        devices: String(r.device == null ? '' : r.device).trim() || '', helpers: extraOwners || '',
        fault: fault, desc: desc, summary: desc, detail: '', urgency: urgency, status: status,
        period: String(r.period == null ? '' : r.period).trim() ? (String(r.period).indexOf('上午') === 0 ? 'am' : String(r.period).indexOf('下午') === 0 ? 'pm' : 'ev') : periodOf(createdAt),
        logType: status === 'closed' ? 'repair' : 'repair',
        source: String(r.source == null ? '' : r.source).trim() || '导入',
        assignee: assignee, assignedAt: assignedAt, acceptedAt: acceptedAt, arrivedAt: arrivedAt,
        action: String(r.action == null ? '' : r.action).trim(), parts: String(r.parts == null ? '' : r.parts).trim(),
        solved: solved, resolvedAt: resolvedAt, durationMin: minutesBetween(arrivedAt, resolvedAt) || 0,
        callback: callback, satisfaction: sat,
        closedAt: closedAt, remark: remarkFinal, timeline: []
      };
      t.timeline.push({ at: createdAt, text: '导入日志 ' + no, by: '系统导入', type: 'create' });
      if (t.assignee) t.timeline.push({ at: t.assignedAt || createdAt, text: '指派给 ' + t.assignee, by: '系统导入', type: 'dispatch' });
      if (t.arrivedAt) t.timeline.push({ at: t.arrivedAt, text: '到达教室 ' + t.room, by: t.assignee || '工程师', type: 'arrive' });
      if (t.action) t.timeline.push({ at: t.resolvedAt || t.arrivedAt || createdAt, text: '处理完成：' + t.action, by: t.assignee || '工程师', type: 'resolve' });
      if (t.status === 'closed') t.timeline.push({ at: t.closedAt, text: '客服回访：' + t.callback + '，日志已记录', by: '客服', type: 'close' });
      result.ok.push(t);
    });
    return result;
  }

  // 日志去重标识：日期 + 时段 + 教室 + 工作内容 + 故障类型 + 责任人 + 处理结果
  function ticketSig(t) {
    return [
      fmtDate(t.createdAt),
      periodInfo(t.period || periodOf(t.createdAt)).key,
      String(t.room == null ? '' : t.room).trim(),
      String(t.summary || t.desc || '').trim(),
      String(t.fault || '').trim(),
      String(t.assignee || '').trim(),
      String(t.action || '').trim()
    ].join('|');
  }

  // 统计与系统内已有日志重复的条数（用于导入前提示）
  function dupeCount(tickets) {
    var st = getState();
    var seen = {};
    st.tickets.forEach(function (t) { seen[ticketSig(t)] = true; });
    return (tickets || []).filter(function (t) { return seen[ticketSig(t)]; }).length;
  }

  function commitImport(tickets) {
    var st = getState();
    var seen = {};
    st.tickets.forEach(function (t) { seen[ticketSig(t)] = true; });
    var added = [], duplicates = 0;
    (tickets || []).forEach(function (t) {
      var sig = ticketSig(t);
      if (seen[sig]) { duplicates++; return; }   // 已存在的日志不再重复导入
      seen[sig] = true;
      added.push(t);
    });
    st.tickets = added.concat(st.tickets);
    st.tickets.sort(function (a, b) { return parseDT(b.createdAt) - parseDT(a.createdAt); });
    save();
    audit('数据', '批量导入日志', '', '批量导入工作日志：新增 ' + added.length + ' 条，跳过重复 ' + duplicates + ' 条');
    return { added: added.length, duplicates: duplicates };
  }

  // ---------- 东华大学每日运维日志（多 sheet，3 行表头）专用解析 ----------
  // 检测：sheetNames 中大部分为 "X月X日" 样式，且首个 sheet row1 是大标题
  function isDailyWorkbook(wb) {
    if (!wb || !Array.isArray(wb.SheetNames) || !wb.SheetNames.length) return false;
    var names = wb.SheetNames;
    // 月度文件：多数工作表按「9月1日 / 9月1」命名
    if (names.length >= 5) {
      var dayLike = 0;
      for (var i = 0; i < names.length; i++) {
        if (/^\d+月\d+日?$/.test(names[i])) dayLike++;
      }
      if (dayLike >= names.length * 0.6) return true;
    }
    // 单日/少量工作表：用首表的标题或表头签名判断
    var ws = wb.Sheets[names[0]];
    if (!ws || !window.XLSX) return false;
    var aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).slice(0, 6);
    var txt = aoa.map(function (r) { return r.join(' '); }).join(' ');
    return /东华大学多媒体教室每日运维工作日志/.test(txt) ||
           (/教室编号/.test(txt) && /工作内容/.test(txt));
  }

  // 从 row 文本（含整行所有单元格）中用正则提取日期
  function extractDateFromRowText(rowCells, fallbackSheetName) {
    var joined = rowCells.map(function (v) { return v == null ? '' : String(v); }).join(' ');
    var m = joined.match(/(\d{4})\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    // ISO 日期单元格（如 "日期 2026-03-15 00:00:00"）
    m = joined.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    // 只有月日（如 "2026年9月" 没日、或 sheet 名 "9月1日"）
    m = (fallbackSheetName || '').match(/(\d+)月(\d+)/);
    if (m) return null; // 需要外部提供年份，返回 null 交给外层处理
    return null;
  }

  // 从时段字符串（如 "7:30-21:30"）提取起始时间
  function extractPeriodStart(period) {
    if (!period) return null;
    var m = String(period).match(/(\d{1,2})[:：.](\d{1,2})/);
    if (m) return pad(+m[1]) + ':' + pad(+m[2]);
    return null;
  }

  function parseDailyWorkbook(wb, opts) {
    opts = opts || {};
    var skipPatrol = opts.skipPatrol === true; // 默认全量导入，巡检行也入库
    var result = { ok: [], errors: [], warnings: [], skippedPatrol: 0, sheetsSeen: [], detected: 'daily' };
    if (!isDailyWorkbook(wb)) {
      result.detected = 'tabular';
      return result;
    }
    var st = getState();
    var faultNames = st.settings.faultTypes.map(function (f) { return f.name; });
    var engNames = st.settings.engineers.map(function (e) { return e.name; });
    var usedSeq = {};
    var seenNo = {};
    function genNo(createdAt) {
      var dk = fmtDate(createdAt).replace(/-/g, '');
      var base = nextNo(fmtDate(createdAt));
      var seq = parseInt(base.slice(-2), 10) || 1;
      if (usedSeq[dk]) seq = Math.max(seq, usedSeq[dk] + 1);
      usedSeq[dk] = seq;
      return 'WL-' + dk + '-' + pad(seq);
    }

    for (var si = 0; si < wb.SheetNames.length; si++) {
      var sn = wb.SheetNames[si];
      var ws = wb.Sheets[sn];
      if (!ws) continue;
      result.sheetsSeen.push(sn);
      var rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      // 至少需要 3 行才是日报格式
      if (rows.length < 3) continue;

      // 从 row1 + row2 提取日期（row0/row1 in 0-based）
      var dateStr = null, year = null, month = null, dayNum = null;
      for (var ri = 0; ri < Math.min(2, rows.length); ri++) {
        var dm = extractDateFromRowText(rows[ri], sn);
        if (dm) { dateStr = dm; break; }
      }
      if (!dateStr) {
        var mY = (rows[0].concat(rows[1]).join(' ')).match(/(\d{4})/);
        var mMD = sn.match(/(\d+)月(\d+)/);
        if (mY && mMD) dateStr = mY[1] + '-' + pad(+mMD[1]) + '-' + pad(+mMD[2]);
      }
      if (!dateStr) {
        result.warnings.push({ line: 0, msg: 'sheet 「' + sn + '」 未能识别日期，已跳过' });
        continue;
      }
      year = +dateStr.slice(0, 4); month = +dateStr.slice(5, 7); dayNum = +dateStr.slice(8, 10);

      // 表头行自动定位：9月版表头在 index 2，3月版（含校区/日期行）在 index 3
      var hi = -1, headerRow = null;
      for (var hs = 0; hs < Math.min(8, rows.length); hs++) {
        var probe = rows[hs];
        if (!probe || !Array.isArray(probe)) continue;
        var hits = 0, descHit = false;
        for (var hc = 0; hc < probe.length; hc++) {
          var hh = normalizeHeader(probe[hc]);
          if (hh === '工作内容' || hh === '主要工作内容' || hh === '故障现象' || hh === '故障描述') descHit = true;
          if (hh === '教室' || hh === '教室编号' || hh === '工作内容' || hh === '主要工作内容' || hh === '故障现象' || hh === '处置办法' || hh === '处理结果' || hh === '工作成果及备注') hits++;
        }
        if (descHit || hits >= 2) { hi = hs; headerRow = probe; break; }
      }
      if (hi < 0 || !headerRow || headerRow.length < 3) continue;
      // 字段顺序（东华日报）：时段、序号、教室编号、工作内容、故障类型、处理结果、责任人、备注
      // 但允许表头别名，用位置匹配也可以，更稳的是用文本匹配
      var colPeriod = -1, colRoom = -1, colDesc = -1, colFault = -1, colAction = -1, colOwner = -1, colRemark = -1;
      var colSolvedY = -1, colSolvedN = -1;
      for (var ci = 0; ci < headerRow.length; ci++) {
        var h = normalizeHeader(headerRow[ci]);
        if (colPeriod < 0 && (h === '时段')) colPeriod = ci;
        else if (colRoom < 0 && (h === '教室' || h === '教室编号' || h === '教室号')) colRoom = ci;
        else if (colDesc < 0 && (h === '工作内容' || h === '主要工作内容' || h === '故障现象' || h === '故障描述')) colDesc = ci;
        else if (colFault < 0 && (h === '故障类型' || h === '故障分类')) colFault = ci;
        else if (colAction < 0 && (h === '处理结果' || h === '处理措施' || h === '处置办法' || h === '工作成果及备注' || h === '工作成果')) colAction = ci;
        else if (colOwner < 0 && (h === '责任人' || h === '工程师' || h === '处理人')) colOwner = ci;
        else if (colRemark < 0 && (h === '备注')) colRemark = ci;
        else if (colSolvedY < 0 && (h === '已' || h === '已解决' || h === '是否解决')) colSolvedY = ci;
        else if (colSolvedN < 0 && (h === '未' || h === '未解决')) colSolvedN = ci;
      }
      if (colDesc < 0) continue; // 没找到工作内容列，跳过
      var prevPeriod = null;

      for (var ri = hi + 1; ri < rows.length; ri++) {
        var r = rows[ri];
        if (!r || !Array.isArray(r) || !r.some(function (v) { return v != null && String(v).trim() !== ''; })) continue;
        var periodRaw = colPeriod >= 0 ? r[colPeriod] : null;
        var roomRaw = colRoom >= 0 ? r[colRoom] : '';
        var descRaw = colDesc >= 0 ? r[colDesc] : '';
        var faultRaw = colFault >= 0 ? r[colFault] : '';
        var actionRaw = colAction >= 0 ? r[colAction] : '';
        var ownerRaw = colOwner >= 0 ? r[colOwner] : '';
        var remarkRaw = colRemark >= 0 ? r[colRemark] : '';
        var solvedRaw = colSolvedY >= 0 ? String(r[colSolvedY] == null ? '' : r[colSolvedY]).trim() : '';
        var unsolvedRaw = colSolvedN >= 0 ? String(r[colSolvedN] == null ? '' : r[colSolvedN]).trim() : '';

        if (periodRaw != null && String(periodRaw).trim() !== '') prevPeriod = String(periodRaw).trim();

        var room = String(roomRaw == null ? '' : roomRaw).trim();
        var desc = String(descRaw == null ? '' : descRaw).trim();
        var fault = String(faultRaw == null ? '' : faultRaw).trim();
        var action = String(actionRaw == null ? '' : actionRaw).trim();
        var owner = String(ownerRaw == null ? '' : ownerRaw).trim();
        var remark = String(remarkRaw == null ? '' : remarkRaw).trim();

        // 全空的行（时段续行但内容都空）跳过
        if (!room && !desc && !fault && !action && !owner && !remark) continue;
        // 表尾说明行（如「故障类型说明：……」）不是日志，跳过
        if (/^故障类型说明/.test(desc)) continue;

        // 无教室列的版式（3月下半月）：从工作内容中提取首个 4 位教室编号
        if (!room && colRoom < 0 && desc) {
          var mR = desc.match(/\d{4}/);
          if (mR) room = mR[0];
        }

        // 巡检行识别
        var isPatrol = false;
        if (/巡检|运维保障/.test(desc.slice(0, 12))) {
          isPatrol = true;
          if (skipPatrol) { result.skippedPatrol++; continue; }
        }

        // 日期 + 时段起始时间 → createdAt
        var periodStart = extractPeriodStart(prevPeriod);
        var createdAt = isoLocal(new Date(year, month - 1, dayNum, periodStart ? +periodStart.split(':')[0] : 9, periodStart ? +periodStart.split(':')[1] : 0));

        // 教室编号：多教室并列只取第一个，区域标记为 "其他" 楼栋
        var roomUsed = room;
        if (roomUsed && !/^\d{4}$/.test(roomUsed)) {
          // 尝试用分隔符拆
          var roomsSplit = roomUsed.split(/[、,，/\s|]+/).filter(function (x) { return x && x.trim(); });
          if (roomsSplit.length >= 2) {
            roomUsed = roomsSplit[0].trim();
            remark = (remark ? remark + '；' : '') + '原教室清单：' + roomRaw;
          }
          // 区域（如 "一教A区"）降级为"区域巡检"服务类
          if (!/^\d{4}$/.test(roomUsed) && roomUsed.length < 10) {
            result.warnings.push({ line: ri + 1, msg: '教室「' + roomUsed + '」不是 4 位编号，楼栋按其他归类' });
          }
        }
        // 处理后最终 room：优先有效 4 位编号
        var finalRoom = (/^\d{4}$/.test(roomUsed)) ? roomUsed : '';
        if (!finalRoom) finalRoom = roomUsed;
        // 教室编号为空也正常导入，导出时该列留空

        // 故障类型容错
        if (fault === '正常') fault = '服务类';
        var faultFinal = faultNames.filter(function (n) { return n === fault; })[0] ||
                         faultNames.filter(function (n) { return n.indexOf(fault) >= 0 || fault.indexOf(n) >= 0; })[0];

        // 巡检行：没故障类型，默认服务类，状态 closed
        if (isPatrol) {
          faultFinal = faultFinal || '服务类';
          desc = desc || '巡检';
          action = action || '完成';
        }

        // 故障类型未命中字典时保留原文，不丢弃该记录（全量导入）
        if (!faultFinal) faultFinal = fault || '服务类';

        // 责任人多人拆分
        var assignee = owner, extraOwners = '';
        if (owner && /[，,、\s]+/.test(owner)) {
          var parts = owner.split(/[，,、\s]+/).filter(function (x) { return x && x.trim(); });
          if (parts.length >= 2) {
            assignee = parts[0];
            extraOwners = parts.slice(1).join('、');
          }
        }
        if (assignee && engNames.indexOf(assignee) < 0) {
          result.warnings.push({ line: ri + 1, msg: 'sheet「' + sn + '」工程师「' + assignee + '」不在名单中' });
        }

        // 备注只保留表格中的实际备注，不写入推导文字
        var remarkFinal = remark;

        // 时段以日志表中「上午/下午/晚上」为准，缺失时按时间推断
        var periodKey = periodOf(createdAt);
        if (/下午/.test(prevPeriod || '')) periodKey = 'pm';
        else if (/晚/.test(prevPeriod || '')) periodKey = 'ev';
        else if (/上午/.test(prevPeriod || '')) periodKey = 'am';

        var no = genNo(createdAt);
        seenNo[no] = true;
        // 3月版「已解决/未解决」列：F 列填 是/否；无该列默认已解决
        var solvedFlag = !(solvedRaw === '否' || unsolvedRaw === '是');
        var assignedAt = assignee ? addMin(createdAt, 5) : '';
        var resolvedAt = action ? addMin(createdAt, 30) : '';
        var closedAt = solvedFlag ? addMin(resolvedAt || createdAt, 15) : '';

        var t = {
          no: no, createdAt: createdAt, caller: '巡检记录',
          phone: '', room: finalRoom, building: buildingOf(finalRoom), device: '',
          devices: '', helpers: extraOwners || '',
          fault: faultFinal || '服务类', desc: desc, summary: desc, detail: '',
          period: periodKey, logType: 'patrol',
          urgency: '常规', status: solvedFlag ? 'closed' : 'waiting',
          source: '巡检',
          assignee: assignee, assignedAt: assignedAt, acceptedAt: assignedAt ? addMin(assignedAt, 3) : '',
          arrivedAt: assignedAt ? addMin(assignedAt, 10) : '',
          action: action, parts: '', solved: solvedFlag, resolvedAt: solvedFlag ? resolvedAt : '',
          durationMin: solvedFlag ? (minutesBetween(assignedAt ? addMin(assignedAt, 10) : createdAt, resolvedAt) || 0) : 0,
          callback: '未回访（巡检/日报导入）', satisfaction: 0,
          closedAt: closedAt, remark: remarkFinal || '', timeline: []
        };
        t.timeline.push({ at: createdAt, text: '东华日报导入 ' + sn + '，时段 ' + (prevPeriod || ''), by: '系统导入', type: 'create' });
        if (assignee) t.timeline.push({ at: assignedAt, text: '工程师 ' + assignee + ' 到场处理', by: '系统导入', type: 'arrive' });
        if (action) t.timeline.push({ at: resolvedAt || createdAt, text: '处理：' + action, by: assignee || '工程师', type: 'resolve' });
        if (solvedFlag) t.timeline.push({ at: closedAt, text: '日报记录：日志已完成', by: '系统导入', type: 'close' });
        else t.timeline.push({ at: resolvedAt || createdAt, text: '日报记录：未解决，待跟进', by: '系统导入', type: 'wait' });
        result.ok.push(t);
      }
    }
    return result;
  }

  // ---------- 东华「每日运维工作日志」版式（与 9 月纸质日志附件一致） ----------
  // 每天一个 sheet（名如 "9月1日"）：大标题 / 日期+教学周+星期+当班人员 / 时段.序号.教室编号.工作内容.故障类型.处理结果.责任人.备注 / 故障类型说明
  var DL_BORDER = {
    top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } }
  };
  var DL_ALIGN = { horizontal: 'center', vertical: 'center', wrapText: true };
  var DL_LEFT_ALIGN = { horizontal: 'left', vertical: 'center', wrapText: true };
  // 底色：日期行/时段列浅蓝 D6E4F0、表头蓝 4E79A7、固定巡检行浅黄 FFF2CC（与附件模板一致）
  var DL_FILL_META = { patternType: 'solid', fgColor: { rgb: 'FFD6E4F0' } };
  var DL_FILL_HEAD = { patternType: 'solid', fgColor: { rgb: 'FF4E79A7' } };
  var DL_FILL_PATROL = { patternType: 'solid', fgColor: { rgb: 'FFFFF2CC' } };
  var DL_FILL_GREY = { patternType: 'solid', fgColor: { rgb: 'FFF2F2F2' } };
  var DL_TITLE = { font: { name: '黑体', sz: 16, bold: true }, alignment: DL_ALIGN, border: DL_BORDER };
  var DL_META = { font: { name: '黑体', sz: 16, bold: true }, alignment: DL_ALIGN, border: DL_BORDER, fill: DL_FILL_META };
  var DL_HEAD = { font: { name: '黑体', sz: 16, bold: true }, alignment: DL_ALIGN, border: DL_BORDER, fill: DL_FILL_HEAD };
  var DL_PERIOD = { font: { name: '黑体', sz: 16, bold: true }, alignment: DL_ALIGN, border: DL_BORDER, fill: DL_FILL_META };
  var DL_BODY = { font: { name: '宋体', sz: 16 }, alignment: DL_ALIGN, border: DL_BORDER };
  var DL_LEFT = { font: { name: '宋体', sz: 16 }, alignment: DL_LEFT_ALIGN, border: DL_BORDER };
  var DL_PATROL = { font: { name: '宋体', sz: 16 }, alignment: DL_ALIGN, border: DL_BORDER, fill: DL_FILL_PATROL };
  var DL_PATROL_LEFT = { font: { name: '宋体', sz: 16 }, alignment: DL_LEFT_ALIGN, border: DL_BORDER, fill: DL_FILL_PATROL };
  var DL_PATROL_OWNER = { font: { name: '宋体', sz: 14 }, alignment: DL_ALIGN, border: DL_BORDER, fill: DL_FILL_GREY };
  var DL_FOOT = { font: { name: '宋体', sz: 16 }, alignment: DL_LEFT_ALIGN, border: DL_BORDER };
  // 附件表尾原文（两行），导出时完整保留
  var DL_FOOT_TEXT = '故障类型说明：中控/开机故障 | 投影仪问题 | 音频/麦克风 | 网络/软件 | 线材/其他 | 正常\n' +
    '备注：浅黄色底色列为固定巡检项，运维人员需逐项确认并记录状态。';
  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

  function cnWeek(n) { return CN_NUM[n - 1] || String(n); }

  // 教学周：秋季学期从 9 月 1 日算起，春季学期从 2 月 24 日算起
  function teachWeek(d) {
    var m = d.getMonth() + 1;
    var start = m <= 6 ? new Date(d.getFullYear(), 1, 24) : new Date(d.getFullYear(), 8, 1);
    var diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 86400000);
    var w = Math.floor(diff / 7) + 1;
    return w < 1 ? 1 : w;
  }

  function daySheet(dk, rows) {
    var X = window.XLSX;
    var d = parseDT(dk);
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    var wd = '星期' + '日一二三四五六'.charAt(d.getDay());
    var sorted = rows.slice().sort(function (a, b) { return parseDT(a.createdAt) - parseDT(b.createdAt); });

    var opers = [];
    sorted.forEach(function (t) { if (t.assignee && opers.indexOf(t.assignee) < 0) opers.push(t.assignee); });

    // 按上午/下午/晚上分组，序号在各时段内从 1 开始（与模板一致）
    var groups = {};
    sorted.forEach(function (t) {
      var key = periodInfo(t.period || periodOf(t.createdAt)).key;
      (groups[key] = groups[key] || []).push(t);
    });
    // 每个时段内固定把巡检打卡记录排在第一行
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) {
        return (isPatrolRow(a) ? 0 : 1) - (isPatrolRow(b) ? 0 : 1);
      });
    });

    var data = [
      ['东华大学多媒体教室每日运维工作日志', '', '', '', '', '', '', ''],
      ['日期', '第' + cnWeek(teachWeek(d)) + '教学周   ' + y + '年' + m + '月' + day + '日  ' + wd, '', '', '当班人员', opers.join('、'), '', ''],
      ['时段', '序号', '教室编号', '工作内容', '故障类型', '处理结果', '责任人', '备注']
    ];
    var blockMerges = [];
    var rowPatrol = [];   // 每行是否固定巡检项（模板中浅黄底色行）
    PERIODS.forEach(function (p) {
      var list = groups[p.key];
      if (!list) return;
      var start = data.length;
      list.forEach(function (t, i) {
        // 时段列只写在块首，块内其余行留空后合并单元格（与附件一致）
        data.push([i === 0 ? p.name + '\n' + p.time : '', i + 1, roomText(t.room), t.summary || t.desc || '',
                   t.fault || '', t.action || '', ownerText(t), t.remark || '']);
        rowPatrol.push(isPatrolRow(t));
      });
      if (list.length > 1) {
        blockMerges.push({ s: { r: start, c: 0 }, e: { r: data.length - 1, c: 0 } });
      }
    });
    data.push([DL_FOOT_TEXT, '', '', '', '', '', '', '']);
    var last = data.length - 1;

    var ws = X.utils.aoa_to_sheet(data);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },          // 大标题
      { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } },          // 教学周 + 日期 + 星期
      { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } },          // 当班人员姓名
      { s: { r: last, c: 0 }, e: { r: last, c: 7 } }     // 故障类型说明
    ].concat(blockMerges);
    // 列宽/行高与模板一致
    ws['!cols'] = [{ wch: 16 }, { wch: 8.875 }, { wch: 14.5 }, { wch: 51.25 },
                   { wch: 18.625 }, { wch: 37.625 }, { wch: 30.125 }, { wch: 14 }];
    var rws = [{ hpt: 38.1 }, { hpt: 27.95 }, { hpt: 30 }];
    for (var i = 0; i < last - 3; i++) rws.push({ hpt: Math.max(66.75, estRowHeight(data[3 + i])) });
    rws.push({ hpt: 42 });
    ws['!rows'] = rws;

    for (var r = 0; r <= last; r++) {
      for (var c = 0; c < 8; c++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })];
        if (!cell) continue;
        if (r === 0) { cell.s = DL_TITLE; continue; }      // 大标题：黑体16加粗，无底色
        if (r === 1) { cell.s = DL_META; continue; }       // 日期/当班人员行：浅蓝底色
        if (r === 2) { cell.s = DL_HEAD; continue; }       // 表头：蓝底
        if (r === last) { cell.s = DL_FOOT; continue; }    // 表尾说明：宋体16左对齐，无底色
        if (c === 0) { cell.s = DL_PERIOD; continue; }     // 时段列：黑体16加粗 + 浅蓝底色
        var patrol = rowPatrol[r - 3];
        if (patrol) {
          // 固定巡检项：浅黄底色；责任人列空值时沿用模板的浅灰底色
          cell.s = (c === 3) ? DL_PATROL_LEFT
            : (c === 6 && !cell.v ? DL_PATROL_OWNER : DL_PATROL);
        } else {
          cell.s = (c === 3) ? DL_LEFT : DL_BODY;
        }
      }
    }
    return ws;
  }

  // 固定巡检项行（模板中浅黄底色行）：日报「正常」按服务类导入，或工作内容为巡检项
  function isPatrolRow(t) {
    return t.logType === 'patrol' && (t.fault === '服务类' || /巡检/.test(t.summary || t.desc || ''));
  }

  // 教室编号：0000 表示导入时缺失，导出时置空
  function roomText(v) {
    v = String(v == null ? '' : v).trim();
    return (v === '0000' || v === '0') ? '' : v;
  }

  // 责任人：主负责人 + 协办人
  function ownerText(t) {
    var a = t.assignee || '', h = t.helpers || '';
    if (a && h) return a + '、' + h;
    return a || h;
  }

  // 估算行高：按工作内容/处理结果/备注列的中文折行数
  function estRowHeight(row) {
    var lines = 1;
    [[3, 51.25], [4, 18.625], [5, 37.625], [7, 14]].forEach(function (pair) {
      var txt = String(row[pair[0]] || '');
      var per = Math.max(4, Math.floor(pair[1] / 2));
      var n = Math.ceil(txt.length / per);
      if (n > lines) lines = n;
    });
    return Math.min(140, 24 + (lines - 1) * 20);
  }

  // 生成东华日报工作簿；fromKey/toKey 为 "YYYY-MM"（按月区间导出时使用）
  function buildDailyWorkbook(tickets, fromKey, toKey) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var byDate = {};
    (tickets || []).forEach(function (t) {
      var dk = fmtDate(t.createdAt);
      if (!dk) return;
      if (fromKey && dk.slice(0, 7) < fromKey) return;
      if (toKey && dk.slice(0, 7) > toKey) return;
      (byDate[dk] = byDate[dk] || []).push(t);
    });
    Object.keys(byDate).sort().forEach(function (dk) {
      var d = parseDT(dk);
      X.utils.book_append_sheet(wb, daySheet(dk, byDate[dk]), (d.getMonth() + 1) + '月' + d.getDate());
    });
    return wb;
  }

  var EXPORT_HEADERS = ['日志编号', '来电时间', '报修人', '联系电话', '教室', '楼栋', '设备', '故障类型', '故障现象', '紧急度', '状态', '来源', '工程师', '指派时间', '开始处理时间', '到场时间', '处理措施', '更换耗材', '是否解决', '处理完成时间', '回访结果', '满意度', '完结时间', '备注', '时段', '日志类型', '工作内容', '处理结果', '协办人', '阶段'];
  function ticketRow(t) {
    return [
      t.no, t.createdAt ? fmtFull(t.createdAt) : '', t.caller, t.phone, t.room, t.building || buildingOf(t.room), t.device, t.fault, t.desc, t.urgency,
      (STATUS[t.status] || {}).label || t.status, t.source, t.assignee,
      t.assignedAt ? fmtFull(t.assignedAt) : '', t.acceptedAt ? fmtFull(t.acceptedAt) : '', t.arrivedAt ? fmtFull(t.arrivedAt) : '',
      t.action, t.parts, t.solved === true ? '是' : t.solved === false ? '否' : '', t.resolvedAt ? fmtFull(t.resolvedAt) : '',
      t.callback, t.satisfaction ? t.satisfaction : '', t.closedAt ? fmtFull(t.closedAt) : '', t.remark,
      (periodInfo(t.period || periodOf(t.createdAt))).name, (LOG_TYPES[t.logType || 'repair'] || {}).label || '', t.summary || '', t.action || '', t.helpers || '', t.stage || '未标注'
    ];
  }
  function exportRows(tickets) {
    return [EXPORT_HEADERS].concat(tickets.map(ticketRow));
  }

  // ---------- 备份 ----------
  function buildBackup() {
    var settings = deepCopy(getState().settings);
    delete settings.users; // 账号属服务端数据，不进备份
    return {
      app: 'dhu-ops', v: VERSION, exportedAt: isoLocal(nowLocal()),
      settings: settings,
      tickets: deepCopy(getState().tickets),
      patrols: deepCopy(getState().patrols || [])
    };
  }
  function restoreBackup(obj) {
    if (!obj || obj.app !== 'dhu-ops' || !Array.isArray(obj.tickets)) throw new Error('不是本系统的备份文件');
    if (!obj.settings || !Array.isArray(obj.settings.rooms)) throw new Error('备份缺少基础配置');
    var settings = deepCopy(obj.settings);
    delete settings.users; // 不覆盖服务端账号
    var keepRev = serverRev; // 恢复备份不改变版本基线，避免保存被误判为冲突
    state = { v: VERSION, createdAt: obj.exportedAt || isoLocal(nowLocal()), settings: settings, tickets: obj.tickets, patrols: obj.patrols || [] };
    applyRemote(state); // 补齐旧备份缺少的新配置（日志阶段等）
    serverRev = keepRev;
    save();
    audit('数据', '恢复JSON备份', obj.exportedAt || '',
      '从' + (obj.exportedAt ? '「' + obj.exportedAt + '」的备份' : '备份文件') + '恢复数据：工作日志 ' + obj.tickets.length + ' 条' +
      '、巡视记录 ' + (obj.patrols || []).length + ' 条');
    return state;
  }

  // ---------- 配置 CRUD ----------
  var ROOM_ZONES = ['A区', 'B区'];
  var ROOM_TYPES = ['普通教室', '多媒体教室', '自习室'];
  function addRoom(input) {
    var st = getState();
    var room = typeof input === 'string' ? { no: input } : (input || {});
    var no = String(room.no || '').trim();
    if (!no) throw new Error('请填写教室编号');
    if (st.settings.rooms.some(function (r) { return r.no === no; })) throw new Error('教室已存在');
    var cap = room.capacity;
    var item = {
      no: no,
      building: room.building || buildingOf(no),
      zone: room.zone || 'A区',
      roomType: room.roomType || '多媒体教室',
      capacity: (cap === '' || cap === undefined || cap === null) ? null : parseInt(cap, 10),
      active: true
    };
    st.settings.rooms.push(item);
    st.settings.rooms.sort(function (a, b) { return a.no.localeCompare(b.no); });
    save();
    audit('配置', '新增教室', no, '所属楼宇 ' + item.building + '；区域 ' + item.zone + '；教室类型 ' + item.roomType +
      '；容量 ' + (item.capacity == null ? '未填写' : item.capacity));
  }
  function updateRoom(no, patch) {
    var st = getState();
    var r = st.settings.rooms.filter(function (x) { return x.no === no; })[0];
    if (!r) throw new Error('教室不存在');
    var before = { no: r.no, building: r.building, zone: r.zone, roomType: r.roomType, capacity: r.capacity, active: r.active };
    if (patch.no && patch.no !== no) {
      if (st.settings.rooms.some(function (x) { return x.no === patch.no; })) throw new Error('教室编号已存在');
      r.no = patch.no;
    }
    if (patch.capacity !== undefined) r.capacity = patch.capacity;
    if (patch.active !== undefined) r.active = patch.active;
    if (patch.zone !== undefined) r.zone = patch.zone;
    if (patch.roomType !== undefined) r.roomType = patch.roomType;
    if (patch.building) r.building = patch.building;
    else r.building = buildingOf(r.no);
    save();
    var after = { no: r.no, building: r.building, zone: r.zone, roomType: r.roomType, capacity: r.capacity, active: r.active };
    audit('配置', '修改教室', no, auditDiff(before, after, { labels: { no: '教室编号' } }));
  }
  function removeRoom(no) {
    var st = getState();
    var r = st.settings.rooms.filter(function (x) { return x.no === no; })[0];
    st.settings.rooms = st.settings.rooms.filter(function (x) { return x.no !== no; });
    save();
    audit('配置', '删除教室', no, r ? ('所属楼宇 ' + (r.building || '未填写') + '；容量 ' + (r.capacity == null ? '未填写' : r.capacity)) : '');
  }

  // ---------- 教室 / 设备档案 ----------
  var DEVICE_CATEGORIES = ['中控', '投影', '电脑', '话筒', '功放', '展台', '网络', '幕布', '录播', '其他'];
  var DEVICE_STATUS = ['在用', '备用', '维修中', '报废'];

  function devices() {
    var st = getState();
    if (!st.assets || !Array.isArray(st.assets.devices)) st.assets = { devices: [] };
    return st.assets.devices;
  }

  function addDevice(input) {
    var d = input || {};
    if (!String(d.name || '').trim()) throw new Error('请填写设备名称');
    if (!String(d.room || '').trim()) throw new Error('请选择所在教室');
    var item = {
      id: uid(), name: String(d.name).trim(),
      category: d.category || '其他', brand: d.brand || '', sn: d.sn || '',
      room: String(d.room).trim(), building: d.building || buildingOf(d.room),
      boughtAt: d.boughtAt || '', warrantyTo: d.warrantyTo || '',
      repairCount: parseInt(d.repairCount, 10) || 0, status: d.status || '在用',
      note: d.note || '', createdAt: isoLocal(nowLocal())
    };
    devices().push(item);
    save();
    audit('配置', '新增设备', item.name, '设备类别 ' + item.category + '；所在教室 ' + item.room + '；品牌型号 ' + (item.brand || '未填写'));
    return item;
  }

  function updateDevice(id, patch) {
    var d = devices().filter(function (x) { return x.id === id; })[0];
    if (!d) throw new Error('设备不存在');
    patch = patch || {};
    var before = {
      name: d.name, category: d.category, brand: d.brand, sn: d.sn, room: d.room,
      boughtAt: d.boughtAt, warrantyTo: d.warrantyTo, repairCount: d.repairCount, status: d.status, note: d.note
    };
    if (patch.name !== undefined) d.name = String(patch.name).trim();
    if (patch.category !== undefined) d.category = patch.category;
    if (patch.brand !== undefined) d.brand = patch.brand;
    if (patch.sn !== undefined) d.sn = patch.sn;
    if (patch.room !== undefined) { d.room = String(patch.room).trim(); d.building = buildingOf(d.room); }
    if (patch.boughtAt !== undefined) d.boughtAt = patch.boughtAt;
    if (patch.warrantyTo !== undefined) d.warrantyTo = patch.warrantyTo;
    if (patch.repairCount !== undefined) d.repairCount = parseInt(patch.repairCount, 10) || 0;
    if (patch.status !== undefined) d.status = patch.status;
    if (patch.note !== undefined) d.note = patch.note;
    save();
    var after = {
      name: d.name, category: d.category, brand: d.brand, sn: d.sn, room: d.room,
      boughtAt: d.boughtAt, warrantyTo: d.warrantyTo, repairCount: d.repairCount, status: d.status, note: d.note
    };
    audit('配置', '修改设备', d.name, '所在教室 ' + d.room + '；' + auditDiff(before, after, {
      labels: { name: '设备名称', status: '设备状态', room: '所在教室', category: '设备类别' }
    }));
    return d;
  }

  function removeDevice(id) {
    var st = getState();
    var arr = devices();
    var i = arr.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) return false;
    var d = arr[i];
    arr.splice(i, 1);
    save();
    audit('配置', '删除设备', d.name, '设备类别 ' + d.category + '；所在教室 ' + d.room);
    return true;
  }

  // 按启用的教室批量生成标准设备台账（同一教室同名设备不重复生成）
  function initDevices() {
    var st = getState();
    var template = [
      { name: '中控主机', category: '中控', brand: '快捷 CR-9000' },
      { name: '投影仪', category: '投影', brand: '爱普生 CB-X06' },
      { name: '讲台电脑', category: '电脑', brand: '联想 ThinkCentre' },
      { name: '无线话筒', category: '话筒', brand: '舒尔 SVX288' },
      { name: '功放', category: '功放', brand: '雅马哈 RX-V385' }
    ];
    var added = 0, skipped = 0;
    var list = devices();
    st.settings.rooms.filter(function (r) { return r.active !== false; }).forEach(function (r) {
      template.forEach(function (tpl, idx) {
        if (list.some(function (d) { return d.room === r.no && d.name === tpl.name; })) { skipped++; return; }
        list.push({
          id: uid(), name: tpl.name, category: tpl.category, brand: tpl.brand, sn: '',
          room: r.no, building: r.building || buildingOf(r.no),
          boughtAt: '', warrantyTo: '', repairCount: 0, status: '在用', note: '',
          createdAt: isoLocal(nowLocal())
        });
        added++;
      });
    });
    if (added) save();
    audit('配置', '初始化设备台账', '', '为已启用教室生成标准设备台账：新增 ' + added + ' 台，已存在跳过 ' + skipped + ' 台');
    return { added: added, skipped: skipped };
  }

  // ---------- 设备台账：批量导入（相同记录更新、无记录新增） ----------
  var DEVICE_FIELDS = {
    name: ['设备名称', '名称', '设备', 'name'],
    category: ['类别', '设备类别', 'category'],
    brand: ['品牌型号', '品牌', '型号', '品牌/型号', 'brand'],
    sn: ['序列号', 'sn', '序列号sn', 'serial'],
    room: ['教室', '教室编号', '所在教室', 'room'],
    boughtAt: ['启用日期', '购买日期', '购置日期', 'boughtat'],
    warrantyTo: ['保修至', '保修到期', '保修期至', 'warrantyto'],
    repairCount: ['累计维修', '维修次数', 'repaircount'],
    status: ['状态', '设备状态', 'status'],
    note: ['备注', '说明', 'note']
  };

  function normDeviceStatus(v) {
    var s = cellStr(v);
    return DEVICE_STATUS.indexOf(s) >= 0 ? s : '';
  }
  function normDeviceCategory(v) {
    var s = cellStr(v);
    if (DEVICE_CATEGORIES.indexOf(s) >= 0) return s;
    var hit = DEVICE_CATEGORIES.filter(function (c) { return s.indexOf(c) >= 0; })[0];
    return hit || '';
  }

  function parseDeviceItems(rows) {
    var items = [], skipped = 0;
    (rows || []).forEach(function (row) {
      var name = cellStr(pickField(row, DEVICE_FIELDS.name));
      var room = cellStr(pickField(row, DEVICE_FIELDS.room)).replace(/\.0+$/, '');
      if (!name || !room) { skipped++; return; }
      var rc = cellStr(pickField(row, DEVICE_FIELDS.repairCount));
      items.push({
        name: name,
        category: normDeviceCategory(pickField(row, DEVICE_FIELDS.category)) || '其他',
        brand: cellStr(pickField(row, DEVICE_FIELDS.brand)),
        sn: cellStr(pickField(row, DEVICE_FIELDS.sn)),
        room: room,
        boughtAt: cellStr(pickField(row, DEVICE_FIELDS.boughtAt)),
        warrantyTo: cellStr(pickField(row, DEVICE_FIELDS.warrantyTo)),
        repairCount: parseInt(rc, 10) || 0,
        status: normDeviceStatus(pickField(row, DEVICE_FIELDS.status)) || '在用',
        note: cellStr(pickField(row, DEVICE_FIELDS.note))
      });
    });
    return { items: items, skipped: skipped };
  }

  // 判重：SN 非空时按 SN，否则按 教室+设备名称
  function findDeviceIndex(list, it) {
    var i;
    if (it.sn) {
      for (i = 0; i < list.length; i++) if (list[i].sn && list[i].sn === it.sn) return i;
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].room === it.room && list[i].name === it.name) return i;
    }
    return -1;
  }

  // 导入预览：统计新增 / 更新数量，不修改数据
  function previewDeviceImport(wb) {
    var parsed = parseDeviceItems(configRows(wb, DEVICE_FIELDS.name));
    var list = devices();
    var added = 0, updated = 0;
    var seen = [];
    parsed.items.forEach(function (it) {
      var hit = -1;
      seen.forEach(function (p, idx) {
        if (hit >= 0) return;
        if ((it.sn && p.sn === it.sn) || (p.room === it.room && p.name === it.name)) hit = idx;
      });
      if (hit >= 0 || findDeviceIndex(list, it) >= 0) { updated++; return; }
      seen.push({ sn: it.sn, room: it.room, name: it.name });
      added++;
    });
    return { items: parsed.items, skipped: parsed.skipped, total: parsed.items.length, added: added, updated: updated };
  }

  // 执行导入：相同记录（SN 或 教室+名称）更新，否则新增
  function commitDeviceImport(items) {
    var list = devices();
    var added = 0, updated = 0;
    (items || []).forEach(function (it) {
      var idx = findDeviceIndex(list, it);
      if (idx >= 0) {
        var d = list[idx];
        d.name = it.name;
        d.category = it.category;
        d.brand = it.brand;
        d.sn = it.sn;
        d.room = it.room;
        d.building = buildingOf(it.room);
        d.boughtAt = it.boughtAt;
        d.warrantyTo = it.warrantyTo;
        d.repairCount = it.repairCount;
        d.status = it.status;
        d.note = it.note;
        updated++;
      } else {
        list.push({
          id: uid(), name: it.name, category: it.category, brand: it.brand, sn: it.sn,
          room: it.room, building: buildingOf(it.room),
          boughtAt: it.boughtAt, warrantyTo: it.warrantyTo,
          repairCount: it.repairCount, status: it.status, note: it.note,
          createdAt: isoLocal(nowLocal())
        });
        added++;
      }
    });
    save();
    return { added: added, updated: updated };
  }

  function buildDevicesWorkbook(template) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var data = [['设备名称', '类别', '品牌型号', '序列号SN', '教室编号', '启用日期', '保修至', '累计维修', '状态', '备注']];
    if (template) {
      data.push(['投影仪', '投影', '爱普生 CB-X06', 'EPS2024001', '2311', '2024-03-01', '2027-03-01', 0, '在用', '吊装于讲台正前方']);
      data.push(['', '', '', '', '', '', '', '', '', '']);
      data.push(['', '', '', '', '', '', '', '', '', '']);
    } else {
      devices().slice().sort(function (a, b) {
        return String(a.room).localeCompare(String(b.room)) || String(a.name).localeCompare(String(b.name));
      }).forEach(function (d) {
        data.push([d.name, d.category, d.brand, d.sn, d.room, d.boughtAt, d.warrantyTo, d.repairCount, d.status, d.note]);
      });
    }
    var ws = X.utils.aoa_to_sheet(data);
    styleConfigSheet(ws, [16, 8, 18, 14, 10, 12, 12, 10, 8, 24], [1, 2, 3, 4, 9]);
    X.utils.book_append_sheet(wb, ws, '设备台账');
    if (template) {
      addExplainSheet(wb, [
        ['字段', '填写说明', '示例'],
        ['设备名称', '必填；与「教室编号」共同作为判重依据', '投影仪'],
        ['类别', '选填：' + DEVICE_CATEGORIES.join(' / ') + '，默认 其他', '投影'],
        ['品牌型号', '选填', '爱普生 CB-X06'],
        ['序列号SN', '选填；填写后将作为唯一标识，优先于 教室+名称 判重', 'EPS2024001'],
        ['教室编号', '必填；须与「基础配置 → 教室清单」中的编号一致', '2311'],
        ['启用日期', '选填，格式 YYYY-MM-DD', '2024-03-01'],
        ['保修至', '选填，格式 YYYY-MM-DD', '2027-03-01'],
        ['累计维修', '选填，填写数字，默认 0', '2'],
        ['状态', '选填：' + DEVICE_STATUS.join(' / ') + '，默认 在用', '在用'],
        ['备注', '选填', '吊装于讲台正前方'],
        ['导入规则', '相同记录（SN 相同，或 教室+名称 相同）将更新原记录；否则新增', '—'],
        ['提示', '仅支持 .xlsx；系统按第一个工作表读取，表头需包含「设备名称」', '—']
      ]);
    }
    return wb;
  }

  function warrantyInfo(d) {
    if (!d.warrantyTo) return { label: '未登记', days: null, level: 'none' };
    var end = parseDT(d.warrantyTo);
    if (!end) return { label: '未登记', days: null, level: 'none' };
    var days = Math.round((end.getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: '已过保', days: days, level: 'expired' };
    if (days <= 90) return { label: days + ' 天后到期', days: days, level: 'soon' };
    return { label: d.warrantyTo, days: days, level: 'ok' };
  }

  function deviceSummary() {
    var list = devices();
    var soon = 0, expired = 0, repairing = 0;
    list.forEach(function (d) {
      var w = warrantyInfo(d);
      if (w.level === 'soon') soon++;
      if (w.level === 'expired') expired++;
      if (d.status === '维修中') repairing++;
    });
    return { total: list.length, soon: soon, expired: expired, repairing: repairing };
  }

  // 教室档案：近 90 天工单、未闭环、健康分与设备数
  function roomProfiles() {
    var st = getState();
    var since = Date.now() - 90 * 86400000;
    var devs = devices();
    return st.settings.rooms.map(function (r) {
      var recent = st.tickets.filter(function (t) {
        if (t.room !== r.no) return false;
        var d = parseDT(t.createdAt);
        return d && d.getTime() >= since;
      });
      var open = recent.filter(function (t) { return ['new', 'assigned', 'processing', 'waiting'].indexOf(t.status) >= 0; });
      var score = Math.max(20, 100 - recent.length * 6 - open.length * 10);
      var level = score >= 85 ? 'good' : (score >= 70 ? 'watch' : 'risk');
      var devCount = devs.filter(function (d) { return d.room === r.no; }).length;
      var last = st.tickets.filter(function (t) { return t.room === r.no; })
        .sort(function (a, b) { return parseDT(b.createdAt) - parseDT(a.createdAt); })[0];
      return {
        room: r, recent: recent, open: open, score: score, level: level,
        devices: devCount, lastAt: last ? last.createdAt : ''
      };
    }).sort(function (a, b) { return a.score - b.score; });
  }

  // ---------- 知识库 ----------
  function kbArticles() {
    var st = getState();
    if (!st.kb || !Array.isArray(st.kb.articles) || st.kb.articles.length === 0) {
      st.kb = { articles: seedArticles() };
    }
    return st.kb.articles;
  }

  function addArticle(input) {
    var a = input || {};
    if (!String(a.title || '').trim()) throw new Error('请填写标题');
    if (!Array.isArray(a.steps) || !a.steps.filter(function (s) { return String(s || '').trim(); }).length) {
      throw new Error('请至少填写一条处理步骤');
    }
    var article = {
      id: uid(), title: String(a.title).trim(), category: a.category || '其他',
      tags: Array.isArray(a.tags) ? a.tags.filter(Boolean) : [],
      scene: a.scene || '', symptoms: a.symptoms || '',
      steps: a.steps.map(function (s) { return String(s).trim(); }).filter(Boolean),
      notice: a.notice || '', source: a.source || '经验沉淀', author: a.author || '',
      createdAt: isoLocal(nowLocal()), updatedAt: isoLocal(nowLocal()),
      views: 0, helpful: 0, builtin: false
    };
    kbArticles().unshift(article);
    save();
    return article;
  }

  function updateArticle(id, patch) {
    var a = kbArticles().filter(function (x) { return x.id === id; })[0];
    if (!a) throw new Error('文章不存在');
    patch = patch || {};
    ['title', 'category', 'scene', 'symptoms', 'notice', 'source'].forEach(function (k) {
      if (patch[k] !== undefined) a[k] = patch[k];
    });
    if (patch.tags !== undefined) a.tags = patch.tags;
    if (patch.steps !== undefined) a.steps = patch.steps.filter(function (s) { return String(s || '').trim(); });
    a.updatedAt = isoLocal(nowLocal());
    save();
    return a;
  }

  function removeArticle(id) {
    var st = getState();
    var arr = kbArticles();
    var i = arr.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) return false;
    arr.splice(i, 1);
    save();
    return true;
  }

  // 打开详情计入浏览量
  function viewArticle(id) {
    var a = kbArticles().filter(function (x) { return x.id === id; })[0];
    if (!a) return null;
    a.views = (a.views || 0) + 1;
    save();
    return a;
  }

  function helpfulArticle(id) {
    var a = kbArticles().filter(function (x) { return x.id === id; })[0];
    if (!a) return false;
    a.helpful = (a.helpful || 0) + 1;
    save();
    return true;
  }

  // ---------- 知识库闭环：匹配 / 引用 / 结案沉淀 ----------

  /** 根据故障类型匹配知识库条目，category 精确或 tags 模糊 */
  function matchKb(faultName) {
    if (!faultName) return [];
    var list = kbArticles();
    var matches = [];
    // 1) category 精确匹配
    list.forEach(function (a) {
      if (a.category === faultName) { matches.push({ a: a, score: 10 }); return; }
      // 2) tags 包含故障类型词
      var hit = (a.tags || []).some(function (t) { return faultName.indexOf(t) >= 0 || t.indexOf(faultName) >= 0; });
      if (hit) matches.push({ a: a, score: 5 });
    });
    // 按浏览量+有用数加权排序，分数高者优先
    matches.sort(function (x, y) {
      var sx = x.score + (x.a.helpful || 0) * 0.5 + Math.min(x.a.views || 0, 20) * 0.1;
      var sy = y.score + (y.a.helpful || 0) * 0.5 + Math.min(y.a.views || 0, 20) * 0.1;
      return sy - sx;
    });
    return matches.map(function (m) { return m.a; });
  }

  /** 记录工单引用了哪些知识库条目：写 ticket.kbRefs + 给 kb article.hits +1 */
  function recordKbHit(ticketNo, kbIds) {
    var t = findTicket(ticketNo);
    if (!t || !Array.isArray(kbIds) || !kbIds.length) return 0;
    var added = 0;
    if (!Array.isArray(t.kbRefs)) t.kbRefs = [];
    kbIds.forEach(function (kid) {
      if (!kid || t.kbRefs.indexOf(kid) >= 0) return;
      t.kbRefs.push(kid);
      // 对应 kb article 的 hits +1
      var a = kbArticles().filter(function (x) { return x.id === kid; })[0];
      if (a) a.hits = (a.hits || 0) + 1;
      added++;
    });
    if (added) {
      save();
      audit('知识库', '引用命中', ticketNo, '引用 ' + added + ' 条知识库：' + kbIds.join(','));
    }
    return added;
  }

  /** 从结案工单自动沉淀为知识库文章，返回新建的 article 或 null */
  function settleToKb(ticketNo, opts) {
    var t = typeof ticketNo === 'string' ? findTicket(ticketNo) : null;
    opts = opts || {};
    var title = String(opts.title || '').trim();
    if (!t) throw new Error('工单不存在');
    if (!title) throw new Error('请填写知识库标题');
    var fault = t.fault || opts.category || '其他';
    // steps：工单 action 拆分（按换行或分号），再拼上 opts.extraSteps
    var steps = [];
    if (t.action) t.action.split(/[\n;；]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) { steps.push(s); });
    if (Array.isArray(opts.extraSteps)) opts.extraSteps.filter(Boolean).forEach(function (s) { steps.push(String(s).trim()); });
    if (!steps.length) steps.push(t.action || '按现场情况处置');
    var tags = [];
    if (t.device) tags.push(t.device);
    if (t.room) tags.push('教室' + t.room);
    var article = {
      id: uid(), title: title, category: fault,
      tags: tags,
      scene: t.desc || '', symptoms: t.summary || t.desc || '',
      steps: steps,
      notice: opts.notice || '',
      source: '工单沉淀（' + t.no + '）',
      author: (t.assignee || currentUser() || ''),
      createdAt: isoLocal(nowLocal()), updatedAt: isoLocal(nowLocal()),
      views: 0, helpful: 0, hits: 0, builtin: false,
      fromTicket: t.no
    };
    kbArticles().unshift(article);
    // 反向给原工单加上 kbRef，让闭环双向打通
    if (!Array.isArray(t.kbRefs)) t.kbRefs = [];
    if (t.kbRefs.indexOf(article.id) < 0) t.kbRefs.push(article.id);
    save();
    audit('知识库', '工单沉淀', t.no, '沉淀知识库：' + title + '（' + article.id + '）');
    return article;
  }

  /** 统计每篇知识库被多少工单引用（hits 计数） */
  function kbRefStats() {
    var st = getState();
    var refs = {};
    (st.tickets || []).forEach(function (t) {
      (t.kbRefs || []).forEach(function (kid) { refs[kid] = (refs[kid] || 0) + 1; });
    });
    return refs;
  }

  /** 查询某类故障已有多少条知识库 */
  function kbCountByFault(faultName) {
    if (!faultName) return 0;
    return kbArticles().filter(function (a) { return a.category === faultName; }).length;
  }

  function addFaultType(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('请填写故障类型名称');
    var st = getState();
    if (st.settings.faultTypes.some(function (f) { return f.name === name; })) throw new Error('故障类型已存在');
    st.settings.faultTypes.push({ name: name, color: '#1677ff', key: 'sv', symptoms: [] });
    save();
    audit('配置', '新增故障类型', name, '');
  }
  function removeFaultType(name) {
    var st = getState();
    if (st.settings.faultTypes.length <= 1) throw new Error('至少保留一种故障类型');
    st.settings.faultTypes = st.settings.faultTypes.filter(function (f) { return f.name !== name; });
    save();
    audit('配置', '删除故障类型', name, '');
  }
  // ---------- 故障类型 / 故障表现 两级字典 ----------
  function findFault(name) {
    return getState().settings.faultTypes.filter(function (f) { return f.name === name; })[0] || null;
  }
  function renameFaultType(oldName, newName) {
    oldName = String(oldName || '').trim(); newName = String(newName || '').trim();
    if (!newName) throw new Error('请填写故障类型名称');
    var st = getState();
    var f = findFault(oldName);
    if (!f) throw new Error('故障类型不存在');
    if (newName !== oldName && st.settings.faultTypes.some(function (x) { return x.name === newName; })) throw new Error('故障类型已存在');
    f.name = newName;
    save();
    audit('配置', '修改故障类型', newName, oldName !== newName ? '名称 ' + oldName + ' → ' + newName : '名称未变化');
  }
  function addSymptom(faultName, text) {
    text = String(text || '').trim();
    if (!text) throw new Error('请填写故障表现');
    var f = findFault(faultName);
    if (!f) throw new Error('故障类型不存在');
    if (!Array.isArray(f.symptoms)) f.symptoms = [];
    if (f.symptoms.indexOf(text) >= 0) throw new Error('该故障表现已存在');
    f.symptoms.push(text);
    save();
    audit('配置', '新增故障表现', faultName, text);
  }
  function updateSymptom(faultName, oldText, newText) {
    newText = String(newText || '').trim();
    if (!newText) throw new Error('请填写故障表现');
    var f = findFault(faultName);
    if (!f) throw new Error('故障类型不存在');
    var i = (f.symptoms || []).indexOf(oldText);
    if (i < 0) throw new Error('故障表现不存在');
    if (newText !== oldText && f.symptoms.indexOf(newText) >= 0) throw new Error('该故障表现已存在');
    f.symptoms[i] = newText;
    save();
    audit('配置', '修改故障表现', faultName, oldText + ' → ' + newText);
  }
  function removeSymptom(faultName, text) {
    var f = findFault(faultName);
    if (!f) throw new Error('故障类型不存在');
    f.symptoms = (f.symptoms || []).filter(function (s) { return s !== text; });
    save();
    audit('配置', '删除故障表现', faultName, text);
  }
  function addRole(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('请填写角色名称');
    if (name.length > 16) throw new Error('角色名称不超过 16 字');
    var st = getState();
    if (st.settings.roles.indexOf(name) >= 0) throw new Error('角色已存在');
    st.settings.roles.push(name);
    save();
    audit('配置', '新增角色', name, '');
  }
  function removeRole(name) {
    var st = getState();
    if (st.settings.roles.length <= 1) throw new Error('至少保留一个角色');
    st.settings.roles = st.settings.roles.filter(function (r) { return r !== name; });
    save();
    audit('配置', '删除角色', name, '');
  }
  function updatePatrolConfig(cfg) {
    var st = getState();
    cfg = cfg || {};
    var oldPeriodsJson = JSON.stringify(st.settings.patrolPeriods || []);
    var oldItemsJson = JSON.stringify(st.settings.patrolItems || []);
    var oldItemNames = (st.settings.patrolItems || []).map(function (x) { return x.name; });
    var oldSummary = st.settings.patrolNormalSummary || '';
    var oldAction = st.settings.patrolNormalAction || '';
    var periods = [];
    PERIOD_DEFAULTS.forEach(function (d) {
      var src = (cfg.periods || []).filter(function (p) { return p && p.key === d.key; })[0] || {};
      var name = String(src.name || '').trim();
      var time = String(src.time || '').trim();
      var plan = String(src.plan || '').trim();
      var patrol = String(src.patrol || '').trim();
      if (!name || !time || !plan || !patrol) throw new Error('时段名称、时间段、巡视范围、计划说明均不能为空');
      var start = timeToHour(time, d.startHour);
      var end = timeToHour(String(time).split(/[-~～—]/)[1], d.endHour);
      if (end <= start) throw new Error('时段「' + name + '」的结束时间应晚于开始时间');
      periods.push({ key: d.key, name: name, time: time, startHour: start, endHour: end, color: d.color, plan: plan, patrol: patrol });
    });
    var items = [];
    (cfg.items || []).forEach(function (it, i) {
      var nm = String(it.name || '').trim();
      var std = String(it.std || '').trim();
      if (!nm) return;
      items.push({ key: String(it.key || ('pi' + Date.now() + i)), name: nm, std: std });
    });
    if (!items.length) throw new Error('至少保留一个巡视检查项');
    var summary = String(cfg.normalSummary || '').trim();
    var action = String(cfg.normalAction || '').trim();
    if (!summary || !action) throw new Error('默认工作内容与处理结果不能为空');
    st.settings.patrolPeriods = periods;
    st.settings.patrolItems = items;
    st.settings.patrolNormalSummary = summary;
    st.settings.patrolNormalAction = action;
    var changes = [];
    if (JSON.stringify(periods) !== oldPeriodsJson) {
      changes.push('时段设置：' + periods.map(function (p) { return p.name + ' ' + p.time; }).join('、'));
    }
    var newItemNames = items.map(function (x) { return x.name; });
    if (newItemNames.join('|') !== oldItemNames.join('|')) {
      var addedItems = newItemNames.filter(function (n) { return oldItemNames.indexOf(n) < 0; });
      var removedItems = oldItemNames.filter(function (n) { return newItemNames.indexOf(n) < 0; });
      var itemText = '检查项 ' + oldItemNames.length + ' 项 → ' + newItemNames.length + ' 项';
      if (addedItems.length) itemText += '，新增「' + addedItems.join('」「') + '」';
      if (removedItems.length) itemText += '，移除「' + removedItems.join('」「') + '」';
      changes.push(itemText);
    } else if (JSON.stringify(items) !== oldItemsJson) {
      changes.push('检查项说明已更新');
    }
    if (summary !== oldSummary || action !== oldAction) changes.push('默认工作内容与处理结果已更新');
    syncPatrolConfig();
    save();
    audit('配置', '修改巡视配置', '', changes.length ? changes.join('；') : '内容未发生变化');
  }
  // ---------- 日志阶段配置 ----------
  function updateLessonStages(stages, defaultStage) {
    var st = getState();
    var arr = [];
    (stages || []).forEach(function (name) {
      var n = String(name || '').trim();
      if (n && arr.indexOf(n) < 0) arr.push(n);
    });
    if (!arr.length) throw new Error('至少保留一个阶段');
    var def = String(defaultStage || '').trim();
    st.settings.lessonStages = arr;
    st.settings.defaultStage = arr.indexOf(def) >= 0 ? def : arr[0];
    save();
    audit('配置', '修改日志阶段', st.settings.defaultStage,
      '阶段共 ' + arr.length + ' 个：' + arr.join('、') + '；默认阶段：' + st.settings.defaultStage);
  }
  function timeToHour(str, fallback) {
    var m = String(str || '').match(/(\d{1,2})[:：](\d{1,2})/);
    if (!m) return fallback;
    return (+m[1]) + (+m[2]) / 60;
  }

  function addEngineer(eng) {
    eng = eng || {};
    if (!eng.name) throw new Error('请填写工程师姓名');
    var st = getState();
    if (st.settings.engineers.some(function (e) { return e.name === eng.name; })) throw new Error('工程师已存在');
    st.settings.engineers.push({
      id: uid(), name: eng.name.trim(), phone: eng.phone || '',
      buildings: eng.buildings || [], active: eng.active !== false
    });
    save();
    audit('配置', '新增工程师', eng.name.trim(), '手机号 ' + (eng.phone || '未填写') +
      '；负责楼宇 ' + ((eng.buildings && eng.buildings.length) ? eng.buildings.join('、') : '全部'));
  }
  function updateEngineer(name, patch) {
    var st = getState();
    var e = st.settings.engineers.filter(function (x) { return x.name === name; })[0];
    if (!e) throw new Error('工程师不存在');
    var before = { name: e.name, phone: e.phone, buildings: e.buildings, active: e.active };
    if (patch.name && patch.name !== name) {
      if (st.settings.engineers.some(function (x) { return x.name === patch.name; })) throw new Error('姓名已存在');
      e.name = patch.name;
    }
    ['phone', 'buildings', 'active'].forEach(function (k) { if (patch[k] !== undefined) e[k] = patch[k]; });
    save();
    var after = { name: e.name, phone: e.phone, buildings: e.buildings, active: e.active };
    audit('配置', '修改工程师', name, auditDiff(before, after, {
      labels: { name: '姓名', phone: '手机号', buildings: '负责楼宇', active: '在岗状态' }
    }));
  }
  function removeEngineer(name) {
    var st = getState();
    var used = st.tickets.some(function (t) { return t.assignee === name && ['new', 'assigned', 'processing', 'waiting'].indexOf(t.status) >= 0; });
    if (used) throw new Error('该工程师还有未完结日志，不能删除');
    st.settings.engineers = st.settings.engineers.filter(function (e) { return e.name !== name; });
    save();
    audit('配置', '删除工程师', name, '');
  }

  // ---------- 排班 / 当班 ----------
  var DUTY_KEY = 'dhu_ops_duty_v1';
  function getDuty(date) {
    if (!date) date = fmtDate(nowLocal());
    var st = getState();
    // 1. 排班优先
    var sched = st.settings.schedule || {};
    if (sched[date] && sched[date].length) return sched[date].slice();
    // 2. 本地当班（每日工作日志手动设置）
    try {
      var local = JSON.parse(localStorage.getItem(DUTY_KEY) || '{}');
      if (local[date] && local[date].length) return local[date].slice();
    } catch (e) {}
    // 3. fallback：所有 active 工程师
    return st.settings.engineers.filter(function (e) { return e.active !== false; }).map(function (e) { return e.name; });
  }
  function setSchedule(date, names) {
    date = String(date || '').trim();
    if (!date) throw new Error('请填写日期');
    var st = getState();
    st.settings.schedule = st.settings.schedule || {};
    var arr = (names || []).map(function (n) { return String(n).trim(); }).filter(Boolean);
    st.settings.schedule[date] = arr;
    save();
    audit('配置', '修改排班', date, arr.length ? '当班工程师：' + arr.join('、') : '清空当日排班');
  }
  function getScheduleRange(yearMonth) {
    // yearMonth: '2026-11' → { '2026-11-01': [...], ... }
    var st = getState();
    var sched = st.settings.schedule || {};
    var out = {};
    Object.keys(sched).forEach(function (k) {
      if (!yearMonth || k.indexOf(yearMonth + '-') === 0) out[k] = sched[k].slice();
    });
    return out;
  }
  function copySchedule(fromDate, toDate) {
    var st = getState();
    var sched = st.settings.schedule || {};
    if (!sched[fromDate] || !sched[fromDate].length) throw new Error('源日期「' + fromDate + '」没有排班');
    sched[toDate] = sched[fromDate].slice();
    save();
    audit('配置', '复制排班', toDate, '将 ' + fromDate + ' 的排班复制到本日：' + sched[toDate].join('、'));
    return sched[toDate].slice();
  }
  function batchSchedule(fromDate, toDate, names) {
    // 批量设置一段日期范围的排班：2026-11-01 → 2026-11-10
    var st = getState();
    st.settings.schedule = st.settings.schedule || {};
    var arr = (names || []).map(function (n) { return String(n).trim(); }).filter(Boolean);
    if (!arr.length) throw new Error('请选择至少一名工程师');
    var d1 = new Date(fromDate);
    var d2 = new Date(toDate);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) throw new Error('日期格式不正确');
    if (d1 > d2) { var tmp = d1; d1 = d2; d2 = tmp; }
    var count = 0;
    for (var d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
      var ds = dateKey(d);
      st.settings.schedule[ds] = arr.slice();
      count++;
    }
    save();
    audit('配置', '批量设置排班', fromDate + ' ~ ' + toDate, '批量设置 ' + count + ' 天排班，当班工程师：' + arr.join('、'));
    return count;
  }
  function batchScheduleDates(dates, names) {
    // 批量设置多个指定日期（可跨周、不连续）的排班，只整体保存一次
    var st = getState();
    st.settings.schedule = st.settings.schedule || {};
    var arr = (names || []).map(function (n) { return String(n).trim(); }).filter(Boolean);
    if (!arr.length) throw new Error('请选择至少一名工程师');
    var count = 0;
    (dates || []).forEach(function (ds) {
      ds = String(ds || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
      st.settings.schedule[ds] = arr.slice();
      count++;
    });
    if (!count) throw new Error('没有有效的日期');
    save();
    return count;
  }
  function batchClearSchedule(dates) {
    // 批量清空多个指定日期的排班，只整体保存一次
    var st = getState();
    st.settings.schedule = st.settings.schedule || {};
    var count = 0;
    (dates || []).forEach(function (ds) {
      ds = String(ds || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
      st.settings.schedule[ds] = [];
      count++;
    });
    if (!count) throw new Error('没有有效的日期');
    save();
    return count;
  }

  // ---------- 教室清单 / 排班日历：导出与批量导入 ----------
  var ROOM_FIELDS = {
    no: ['教室编号', '编号', '房间号', '教室号', 'no'],
    building: ['教学楼', '楼栋', '建筑', 'building'],
    zone: ['教室区域', '区域', 'zone'],
    roomType: ['教室类型', '类型', 'roomtype'],
    capacity: ['容量', '座位数', '座位', 'capacity'],
    active: ['状态', '启用状态', '是否启用', 'active']
  };
  var SCHED_FIELDS = {
    date: ['日期', '排班日期', 'date'],
    names: ['值班工程师', '排班工程师', '工程师', '值班人员', 'names']
  };

  function normHeader(v) {
    return String(v == null ? '' : v).replace(/[\s*＊]/g, '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase();
  }
  function cellStr(v) {
    if (v == null) return '';
    if (v instanceof Date && !isNaN(v.getTime())) return dateKey(v);
    return String(v).trim();
  }
  function pickField(row, aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var target = normHeader(aliases[i]);
      for (var k in row) if (normHeader(k) === target) return row[k];
    }
    return '';
  }
  // 读取第一个工作表：自动定位表头行，转为对象数组（兼容用户自行添加标题/说明行）
  function configRows(wb, aliases) {
    var X = window.XLSX;
    var sn = wb && wb.SheetNames && wb.SheetNames[0];
    var ws = sn ? wb.Sheets[sn] : null;
    if (!ws) return [];
    var aoa = X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    var targets = aliases.map(normHeader);
    var headRow = -1;
    for (var r = 0; r < Math.min(aoa.length, 8) && headRow < 0; r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) {
        if (targets.indexOf(normHeader(row[c])) >= 0) { headRow = r; break; }
      }
    }
    if (headRow < 0) return [];
    var headers = (aoa[headRow] || []).map(cellStr);
    var out = [];
    for (var i = headRow + 1; i < aoa.length; i++) {
      var vals = aoa[i] || [];
      var obj = {}, any = false;
      headers.forEach(function (h, c) {
        if (!h) return;
        obj[h] = vals[c];
        if (cellStr(vals[c])) any = true;
      });
      if (any) out.push(obj);
    }
    return out;
  }

  function normZone(v) {
    var s = cellStr(v);
    if (!s) return '';
    if (/a/i.test(s)) return 'A区';
    if (/b/i.test(s)) return 'B区';
    return '';
  }
  function normRoomType(v) {
    var s = cellStr(v);
    if (!s) return '';
    if (/普通/.test(s)) return '普通教室';
    if (/自习/.test(s)) return '自习室';
    if (/多媒体/.test(s)) return '多媒体教室';
    return '';
  }
  function parseCapacity(v) {
    var s = cellStr(v);
    if (!s) return undefined;
    var n = parseFloat(s.replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? undefined : Math.round(n);
  }
  function parseActive(v) {
    if (v === true || v === false) return v;
    var s = cellStr(v);
    if (!s) return null;
    if (/^(停用|禁用|否|未启用|0|no|false)$/i.test(s)) return false;
    if (/^(启用|正常|是|1|yes|true)$/i.test(s)) return true;
    return null;
  }

  function parseRoomItems(rows) {
    var items = [], skipped = 0;
    (rows || []).forEach(function (row) {
      var no = cellStr(pickField(row, ROOM_FIELDS.no)).replace(/\.0+$/, '');
      if (!no) { skipped++; return; }
      items.push({
        no: no,
        building: cellStr(pickField(row, ROOM_FIELDS.building)),
        zone: normZone(pickField(row, ROOM_FIELDS.zone)),
        roomType: normRoomType(pickField(row, ROOM_FIELDS.roomType)),
        capacity: parseCapacity(pickField(row, ROOM_FIELDS.capacity)),
        active: parseActive(pickField(row, ROOM_FIELDS.active))
      });
    });
    return { items: items, skipped: skipped };
  }

  // 导入预览：统计新增 / 覆盖数量，不修改数据
  function previewRoomImport(wb) {
    var parsed = parseRoomItems(configRows(wb, ROOM_FIELDS.no));
    var st = getState();
    var known = {};
    st.settings.rooms.forEach(function (r) { known[r.no] = true; });
    var added = 0, updated = 0;
    parsed.items.forEach(function (it) {
      if (known[it.no]) updated++;
      else { added++; known[it.no] = true; }
    });
    return { items: parsed.items, skipped: parsed.skipped, total: parsed.items.length, added: added, updated: updated };
  }

  // 执行导入：教室编号相同则覆盖，不同则新增
  function commitRoomImport(items) {
    var st = getState();
    var map = {};
    st.settings.rooms.forEach(function (r) { map[r.no] = r; });
    var added = 0, updated = 0;
    (items || []).forEach(function (it) {
      var r = map[it.no];
      if (r) {
        if (it.building) r.building = it.building;
        if (it.zone) r.zone = it.zone;
        if (it.roomType) r.roomType = it.roomType;
        if (it.capacity !== undefined) r.capacity = it.capacity;
        if (it.active !== null) r.active = it.active;
        updated++;
        return;
      }
      r = {
        no: it.no,
        building: it.building || buildingOf(it.no),
        zone: it.zone || 'A区',
        roomType: it.roomType || '多媒体教室',
        capacity: it.capacity === undefined ? null : it.capacity,
        active: it.active === null ? true : it.active
      };
      st.settings.rooms.push(r);
      map[it.no] = r;
      added++;
    });
    st.settings.rooms.sort(function (a, b) { return a.no.localeCompare(b.no); });
    save();
    return { added: added, updated: updated };
  }

  function normDate(v, defaultMonth) {
    if (v instanceof Date && !isNaN(v.getTime())) return dateKey(v);
    var s = cellStr(v);
    if (!s) return '';
    if (/^\d{5}(\.\d+)?$/.test(s)) return dateKey(new Date(1899, 11, 30 + Math.floor(parseFloat(s))));
    s = s.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-').replace(/[.]/g, '-').replace(/\s.*$/, '');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    var m2 = s.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m2 && defaultMonth) return defaultMonth + '-' + pad(+m2[1]) + '-' + pad(+m2[2]);
    return '';
  }
  function parseNameList(v) {
    var parts = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[、,，;；\/|｜\n\r]+/);
    var out = [];
    parts.forEach(function (p) {
      p = String(p).trim();
      if (p && out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }

  function previewScheduleImport(wb, defaultMonth) {
    var raw = [], skipped = 0;
    configRows(wb, SCHED_FIELDS.date).forEach(function (row) {
      var date = normDate(pickField(row, SCHED_FIELDS.date), defaultMonth);
      var names = parseNameList(pickField(row, SCHED_FIELDS.names));
      if (!date) { if (names.length) skipped++; return; }        // 缺日期但填了工程师
      var d = parseDT(date);
      if (!d || dateKey(d) !== date) { skipped++; return; }      // 日期格式不正确
      if (!names.length) return;                                 // 仅填日期、未填工程师：不改动原排班
      raw.push({ date: date, names: names });
    });
    // 同一日期多次上传以最后一条为准
    var byDate = {}, order = [];
    raw.forEach(function (it) {
      if (!byDate[it.date]) order.push(it.date);
      byDate[it.date] = it;
    });
    var items = order.sort().map(function (k) { return byDate[k]; });
    var st = getState();
    var sched = st.settings.schedule || {};
    var engNames = st.settings.engineers.map(function (e) { return e.name; });
    var added = 0, overwritten = 0, unknown = [];
    items.forEach(function (it) {
      if (Object.prototype.hasOwnProperty.call(sched, it.date)) overwritten++;
      else added++;
      it.names.forEach(function (n) {
        if (engNames.indexOf(n) < 0 && unknown.indexOf(n) < 0) unknown.push(n);
      });
    });
    return { items: items, skipped: skipped, total: items.length, added: added, overwritten: overwritten, unknown: unknown };
  }

  function commitScheduleImport(items) {
    var st = getState();
    st.settings.schedule = st.settings.schedule || {};
    var added = 0, overwritten = 0;
    (items || []).forEach(function (it) {
      if (Object.prototype.hasOwnProperty.call(st.settings.schedule, it.date)) overwritten++;
      else added++;
      st.settings.schedule[it.date] = it.names.slice();
    });
    save();
    return { added: added, overwritten: overwritten };
  }

  var CFG_BORDER = {
    top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } }
  };
  var CFG_HEAD = { font: { name: '黑体', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: CFG_BORDER, fill: { patternType: 'solid', fgColor: { rgb: 'FF4E79A7' } } };
  var CFG_BODY = { font: { name: '宋体', sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: CFG_BORDER };
  var CFG_LEFT = { font: { name: '宋体', sz: 11 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: CFG_BORDER };

  function styleConfigSheet(ws, widths, leftCols) {
    var X = window.XLSX;
    ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    var ref = ws['!ref'] || 'A1';
    var range = X.utils.decode_range(ref);
    var rows = [];
    for (var r = range.s.r; r <= range.e.r; r++) rows.push({ hpt: r === 0 ? 26 : 22 });
    ws['!rows'] = rows;
    for (var i = range.s.r; i <= range.e.r; i++) {
      for (var c = range.s.c; c <= range.e.c; c++) {
        var cell = ws[X.utils.encode_cell({ r: i, c: c })];
        if (!cell) continue;
        if (i === 0) cell.s = CFG_HEAD;
        else cell.s = (leftCols || []).indexOf(c) >= 0 ? CFG_LEFT : CFG_BODY;
      }
    }
  }

  function addExplainSheet(wb, rows) {
    var X = window.XLSX;
    var ws = X.utils.aoa_to_sheet(rows);
    styleConfigSheet(ws, [16, 62, 20], [1]);
    X.utils.book_append_sheet(wb, ws, '填写说明');
  }

  // template=true 生成空白导入模板（含填写说明）
  function buildRoomsWorkbook(template) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var data = [['教室编号', '教学楼', '教室区域', '教室类型', '容量（座位数）', '状态']];
    if (template) {
      for (var i = 0; i < 3; i++) data.push(['', '', '', '', '', '']);
    } else {
      getState().settings.rooms.slice().sort(function (a, b) { return a.no.localeCompare(b.no); }).forEach(function (r) {
        data.push([r.no, r.building || '', r.zone || '', r.roomType || '',
          r.capacity == null ? '' : r.capacity, r.active === false ? '停用' : '启用']);
      });
    }
    var ws = X.utils.aoa_to_sheet(data);
    styleConfigSheet(ws, [12, 10, 10, 14, 15, 8], [1, 2, 3]);
    X.utils.book_append_sheet(wb, ws, '教室清单');
    if (template) {
      addExplainSheet(wb, [
        ['字段', '填写说明', '示例'],
        ['教室编号', '必填，作为唯一标识；与已有教室编号相同时，本行内容将覆盖原教室', '2311'],
        ['教学楼', '选填；留空时按编号自动判断（1/2/3/4 开头对应一教/二教/三教/四教）', '一教'],
        ['教室区域', '选填：A区 / B区，默认 A区', 'A区'],
        ['教室类型', '选填：普通教室 / 多媒体教室 / 自习室，默认 多媒体教室', '多媒体教室'],
        ['容量（座位数）', '选填，填写数字', '60'],
        ['状态', '选填：启用 / 停用，默认启用', '启用'],
        ['提示', '仅支持 .xlsx；系统按第一个工作表读取，表头需包含「教室编号」', '—']
      ]);
    }
    return wb;
  }

  // ---------- 故障类型 / 故障表现 导入导出 ----------
  var FAULT_DICT_FIELDS = {
    type: ['故障类型', '类型', '一级', '一级菜单', 'fault', 'type'],
    symptom: ['故障表现', '表现', '二级', '二级菜单', '故障现象', 'symptom']
  };
  function splitSymptoms(v) {
    return cellStr(v).split(/[\n\r;；、,，]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function parseFaultDictItems(rows) {
    var items = [], skipped = 0;
    (rows || []).forEach(function (row) {
      var type = cellStr(pickField(row, FAULT_DICT_FIELDS.type));
      if (!type) { skipped++; return; }
      items.push({ type: type, symptoms: splitSymptoms(pickField(row, FAULT_DICT_FIELDS.symptom)) });
    });
    return { items: items, skipped: skipped };
  }
  function previewFaultImport(wb) {
    var parsed = parseFaultDictItems(configRows(wb, FAULT_DICT_FIELDS.type));
    var st = getState();
    var known = {};
    st.settings.faultTypes.forEach(function (f) { known[f.name] = f; });
    var added = 0, updated = 0, newSym = 0;
    var seenSym = {};
    parsed.items.forEach(function (it) {
      var f = known[it.type];
      if (!f) { added++; f = { symptoms: [] }; known[it.type] = f; }
      else updated++;
      var bag = seenSym[it.type] || (seenSym[it.type] = (f.symptoms || []).slice());
      it.symptoms.forEach(function (s) { if (bag.indexOf(s) < 0) { newSym++; bag.push(s); } });
    });
    return { items: parsed.items, skipped: parsed.skipped, total: parsed.items.length, added: added, updated: updated, newSym: newSym };
  }
  function commitFaultImport(items) {
    var st = getState();
    var map = {};
    st.settings.faultTypes.forEach(function (f) { map[f.name] = f; });
    var added = 0, updated = 0, newSym = 0;
    (items || []).forEach(function (it) {
      var f = map[it.type];
      if (!f) {
        f = { name: it.type, color: '#1677ff', key: 'sv', symptoms: [] };
        st.settings.faultTypes.push(f);
        map[it.type] = f;
        added++;
      } else updated++;
      if (!Array.isArray(f.symptoms)) f.symptoms = [];
      (it.symptoms || []).forEach(function (s) {
        if (f.symptoms.indexOf(s) < 0) { f.symptoms.push(s); newSym++; }
      });
    });
    save();
    audit('配置', '导入故障字典', '', '故障类型 新增 ' + added + ' / 更新 ' + updated + '；故障表现 新增 ' + newSym + ' 条');
    return { added: added, updated: updated, newSym: newSym };
  }
  function buildFaultDictWorkbook(template) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var data = [['故障类型', '故障表现']];
    if (template) {
      data.push(['中控/开机故障', '开机无响应；投影无信号']);
      data.push(['', '']);
      data.push(['', '']);
    } else {
      getState().settings.faultTypes.forEach(function (f) {
        data.push([f.name, (f.symptoms || []).join('；')]);
      });
    }
    var ws = X.utils.aoa_to_sheet(data);
    styleConfigSheet(ws, [22, 60], [1]);
    X.utils.book_append_sheet(wb, ws, '故障字典');
    if (template) {
      addExplainSheet(wb, [
        ['字段', '填写说明', '示例'],
        ['故障类型', '必填，一级菜单；与已有类型同名时合并其故障表现，不会删除原有表现', '中控/开机故障'],
        ['故障表现', '选填，二级菜单；同一类型多个表现用 ；、，或换行分隔', '开机无响应；投影无信号'],
        ['提示', '仅支持 .xlsx；系统按第一个工作表读取，表头需包含「故障类型」', '—']
      ]);
    }
    return wb;
  }

  function buildScheduleWorkbook(yearMonth, template) {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var y = parseInt(yearMonth.slice(0, 4), 10);
    var m = parseInt(yearMonth.slice(5, 7), 10);
    var days = new Date(y, m, 0).getDate();
    var sched = getScheduleRange(yearMonth);
    var wd = '日一二三四五六';
    var data = [['日期', '星期', '值班工程师']];
    for (var d = 1; d <= days; d++) {
      var ds = yearMonth + '-' + pad(d);
      data.push([ds, '星期' + wd.charAt(new Date(y, m - 1, d).getDay()),
        template ? '' : (sched[ds] || []).join('、')]);
    }
    var ws = X.utils.aoa_to_sheet(data);
    styleConfigSheet(ws, [14, 10, 30], [2]);
    X.utils.book_append_sheet(wb, ws, '排班日历');
    if (template) {
      addExplainSheet(wb, [
        ['字段', '填写说明', '示例'],
        ['日期', '必填，格式 YYYY-MM-DD（如 2026-11-05）；也可只写月-日，按当前月份补全年份', '2026-11-05'],
        ['值班工程师', '必填，多人用顿号分隔；同一日期重复上传时将覆盖原排班', '王师傅、李师傅'],
        ['说明', '留空的日期不会改动原排班；如需清空某天，请在本页面使用「清空排班」', '—'],
        ['提示', '仅支持 .xlsx；系统按第一个工作表读取，表头需包含「日期」', '—']
      ]);
    }
    return wb;
  }

  // ---------- 登录 / 用户（服务端校验，密码不出现在前端） ----------
  var USER_KEY = 'dhu_ops_user';
  var DNAME_KEY = 'dhu_ops_dname';
  var ROLE_KEY = 'dhu_ops_urole';
  var sessionUser = null;
  var sessionIsAdmin = false;
  var sessionPerms = [];
  var sessionDisplayName = '';
  var sessionRole = '';
  var mustChangePwd = false;
  try {
    sessionUser = localStorage.getItem(USER_KEY) || null;
    sessionDisplayName = localStorage.getItem(DNAME_KEY) || '';
    sessionRole = localStorage.getItem(ROLE_KEY) || '';
  } catch (e) {}

  // 返回 Promise：成功 resolve 用户名，失败 reject Error
  function login(name, pwd) {
    name = String(name || '').trim();
    pwd = String(pwd || '');
    if (location.protocol === 'file:') {
      return Promise.reject(new Error('请通过 http://127.0.0.1:8430/ 访问系统，不要直接双击 index.html 打开'));
    }
    return fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, pwd: pwd })
    }).catch(function () {
      throw new Error('无法连接服务器（Failed to fetch）：请确认调试窗口仍在运行，且地址栏是 http://127.0.0.1:8430/');
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error('用户名或密码错误，或账号已停用');
      // 登录失败限流：服务端返回 429 与剩余锁定秒数
      if (res.status === 429) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error((d && d.error) || '尝试次数过多，请稍后重试');
        });
      }
      if (!res.ok) throw new Error('登录服务异常（HTTP ' + res.status + '）');
      return res.json();
    }).then(function (data) {
      setToken(data.token);
      sessionUser = data.name;
      sessionIsAdmin = !!data.is_admin;
      sessionPerms = Array.isArray(data.permissions) ? data.permissions.slice() : [];
      sessionDisplayName = data.display_name || data.name;
      sessionRole = data.role || '';
      mustChangePwd = !!data.must_change_pwd;
      try {
        localStorage.setItem(USER_KEY, data.name);
        localStorage.setItem(DNAME_KEY, sessionDisplayName);
        localStorage.setItem(ROLE_KEY, sessionRole);
      } catch (e) {}
      // 首次登录未改密：/api/state 会被服务端拦截，先只取当前用户信息，
      // 由界面弹出强制改密页，改密成功后再加载业务数据。
      if (mustChangePwd) {
        return refreshMe().then(function () { return data.name; }, function () { return data.name; });
      }
      // 登录后拉取服务端数据
      return load().then(function () { return data.name; });
    });
  }
  function logout() {
    if (getToken()) {
      fetch('/api/logout', { method: 'POST', headers: authHeaders() }).catch(function () {});
    }
    setToken('');
    sessionUser = null;
    sessionIsAdmin = false;
    sessionPerms = [];
    sessionDisplayName = '';
    sessionRole = '';
    mustChangePwd = false;
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(DNAME_KEY);
      localStorage.removeItem(ROLE_KEY);
    } catch (e) {}
  }
  function currentUser() {
    return getToken() ? sessionUser : null;
  }
  function displayName() {
    return getToken() ? (sessionDisplayName || sessionUser || '') : '';
  }
  function userRole() {
    return getToken() ? sessionRole : '';
  }
  function isAdmin() { return sessionIsAdmin; }
  function permissions() { return sessionIsAdmin ? [] : sessionPerms.slice(); }
  function hasPermission(key) { return sessionIsAdmin || sessionPerms.indexOf(key) >= 0; }

  // 刷新当前用户权限（修改权限后调用）
  function refreshMe() {
    return fetch('/api/me', { headers: authHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('获取用户信息失败');
      return r.json();
    }).then(function (d) {
      sessionUser = d.name || sessionUser;
      sessionIsAdmin = !!d.is_admin;
      sessionPerms = Array.isArray(d.permissions) ? d.permissions.slice() : [];
      sessionDisplayName = d.display_name || d.name || sessionUser || '';
      sessionRole = d.role || '';
      mustChangePwd = !!d.must_change_pwd;
      try {
        if (sessionUser) localStorage.setItem(USER_KEY, sessionUser);
        localStorage.setItem(DNAME_KEY, sessionDisplayName);
        localStorage.setItem(ROLE_KEY, sessionRole);
      } catch (e) {}
      return d;
    });
  }

  function mustChangePassword() { return mustChangePwd; }

  // 首次登录/主动改密：成功后清除强制改密标记，界面再加载业务数据
  function changePassword(oldPwd, newPwd, confirmPwd) {
    return fetch('/api/change-password', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ old_pwd: oldPwd, new_pwd: newPwd, confirm_pwd: confirmPwd })
    }).then(handleApiResp).then(function (d) {
      mustChangePwd = false;
      return d;
    });
  }

  // ---------- 用户 / 用户组 / 权限 API ----------
  function apiGet(path) {
    return fetch('/api/' + path, { headers: authHeaders() }).then(handleApiResp);
  }
  function apiPost(path, body) {
    return fetch('/api/' + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {}) }).then(handleApiResp);
  }
  function apiPut(path, body) {
    return fetch('/api/' + path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body || {}) }).then(handleApiResp);
  }
  function apiDel(path) {
    return fetch('/api/' + path, { method: 'DELETE', headers: authHeaders() }).then(handleApiResp);
  }
  // 桌面快捷方式：服务端判断来访机器，返回 {mode:'lnk'|'download'}
  function createDesktopShortcut() {
    return apiPost('desktop/shortcut');
  }
  function handleApiResp(res) {
    if (res.status === 401) { setToken(''); sessionUser = null; throw new Error('未登录或会话已过期'); }
    if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || ('HTTP ' + res.status)); }, function () { throw new Error('HTTP ' + res.status); });
    return res.json();
  }

  // 下载类接口（返回二进制，如服务端生成的 PDF）
  function apiPostBlob(path, body) {
    return fetch('/api/' + path, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {})
    }).then(function (res) {
      if (res.status === 401) { setToken(''); sessionUser = null; throw new Error('未登录或会话已过期'); }
      if (!res.ok) {
        return res.json().then(function (d) { throw new Error(d.error || ('HTTP ' + res.status)); },
          function () { throw new Error('HTTP ' + res.status); });
      }
      return res.blob();
    });
  }

  // 授权信息
  function licenseStatus() { return apiGet('license'); }
  function licenseImport(text) { return apiPost('license', { license: text }); }

  function listPermissions() { return apiGet('permissions'); }
  function listUsers() { return apiGet('users'); }
  function createUser(name, pwd, role, displayName) { return apiPost('users', { name: name, pwd: pwd, role: role || '工程师', display_name: displayName || name }); }
  function updateUser(name, patch) { return apiPut('users/' + encodeURIComponent(name), patch); }
  function deleteUser(name) { return apiDel('users/' + encodeURIComponent(name)); }
  function setUserPermissions(name, perms) { return apiPut('users/' + encodeURIComponent(name) + '/permissions', { permissions: perms }); }
  function setUserGroups(name, gids) { return apiPut('users/' + encodeURIComponent(name) + '/groups', { group_ids: gids }); }

  function listGroups() { return apiGet('groups'); }
  function createGroup(name) { return apiPost('groups', { name: name }); }
  function updateGroup(gid, name) { return apiPut('groups/' + gid, { name: name }); }
  function deleteGroup(gid) { return apiDel('groups/' + gid); }
  function setGroupPermissions(gid, perms) { return apiPut('groups/' + gid + '/permissions', { permissions: perms }); }
  function setGroupMembers(gid, members) { return apiPut('groups/' + gid + '/members', { members: members }); }

  // ---------- 数据库备份 / 恢复（仅管理员） ----------
  function listDbBackups() { return apiGet('backups'); }
  // 创建备份并触发浏览器下载；resolve {name, path}（服务器端副本位置）
  function createDbBackup() {
    return fetch('/api/backup', { method: 'POST', headers: authHeaders() }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || ('备份失败（HTTP ' + r.status + '）')); });
      }
      var name = decodeURIComponent(r.headers.get('X-Backup-Name') || ('dhu_ops_backup_' + Date.now() + '.db'));
      var path = decodeURIComponent(r.headers.get('X-Backup-Path') || '');
      return r.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return { name: name, path: path };
      });
    });
  }
  // 上传备份文件整站恢复
  function restoreDbBackup(file) {
    var fd = new FormData();
    fd.append('file', file);
    return fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: fd
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('恢复失败（HTTP ' + r.status + '）'));
        return j;
      });
    });
  }


  // ---------- 演示数据 / 清空 ----------
  function resetDemo() {
    state = emptyState();
    syncPatrolConfig();
    state.tickets = seedTickets(state);
    state.patrols = seedPatrols(state);
    save();
    audit('数据', '重生成演示数据', '', '重生成演示数据：工作日志 ' + state.tickets.length + ' 条、巡视记录 ' + state.patrols.length + ' 条');
    return state;
  }
  function clearAll() {
    state = emptyState();
    syncPatrolConfig();
    state.tickets = [];
    state.patrols = [];
    save();
    audit('数据', '清空全部日志', '', '清空全部工作日志与巡视记录，基础配置和账号保留');
    return state;
  }

  global.Store = {
    KEY: KEY, VERSION: VERSION, STATUS: STATUS, URGENCY: URGENCY, CALLBACK: CALLBACK,
    PERIODS: PERIODS, PATROL_ITEMS: PATROL_ITEMS, LOG_TYPES: LOG_TYPES,
    load: load, getState: getState, save: save,
    flushSave: function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (saveRetryTimer) { clearTimeout(saveRetryTimer); saveRetryTimer = null; }
      pumpSave();
      return saveQueue;
    },
    isStorageOK: function () { return storageOK; }, lastError: function () { return lastError; },
    retrySave: retrySave,
    buildingOf: buildingOf, floorOf: floorOf, periodOf: periodOf, periodInfo: periodInfo, periodStart: periodStart, weekInfo: weekInfo,
    esc: esc, pad: pad, nowLocal: nowLocal, isoLocal: isoLocal, dateKey: dateKey,
    parseDT: parseDT, fmtDT: fmtDT, fmtFull: fmtFull, fmtDate: fmtDate, addMin: addMin, minutesBetween: minutesBetween,
    createTicket: createTicket, findTicket: findTicket, dispatch: dispatch, accept: accept, arrive: arrive,
    resolve: resolve, close: close, cancel: cancel, updateTicket: updateTicket, removeTicket: removeTicket,
    addLog: addLog, fillLog: fillLog, pendingRepairs: pendingRepairs, waitingRepairs: waitingRepairs, resultInfo: resultInfo, isPatrolLog: isPatrolRow, logsByDate: logsByDate, logsBetween: logsBetween,
    patrolsOf: patrolsOf, ensurePatrols: ensurePatrols, checkinPatrol: checkinPatrol, patrolSummary: patrolSummary,
    recommendEngineer: recommendEngineer, nextNo: nextNo,
    stats: stats, dailySeries: dailySeries,
    parseRows: parseRows, commitImport: commitImport, dupeCount: dupeCount, exportRows: exportRows, EXPORT_HEADERS: EXPORT_HEADERS,
    isDailyWorkbook: isDailyWorkbook, parseDailyWorkbook: parseDailyWorkbook, buildDailyWorkbook: buildDailyWorkbook,
    buildBackup: buildBackup, restoreBackup: restoreBackup,
    addRoom: addRoom, updateRoom: updateRoom, removeRoom: removeRoom,
    devices: devices, addDevice: addDevice, updateDevice: updateDevice, removeDevice: removeDevice,
    initDevices: initDevices, deviceSummary: deviceSummary, warrantyInfo: warrantyInfo, roomProfiles: roomProfiles,
    previewDeviceImport: previewDeviceImport, commitDeviceImport: commitDeviceImport, buildDevicesWorkbook: buildDevicesWorkbook,
    DEVICE_CATEGORIES: DEVICE_CATEGORIES, DEVICE_STATUS: DEVICE_STATUS,
    kbArticles: kbArticles, addArticle: addArticle, updateArticle: updateArticle, removeArticle: removeArticle,
    viewArticle: viewArticle, helpfulArticle: helpfulArticle,
    matchKb: matchKb, recordKbHit: recordKbHit, settleToKb: settleToKb, kbRefStats: kbRefStats, kbCountByFault: kbCountByFault,
    ROOM_ZONES: ROOM_ZONES, ROOM_TYPES: ROOM_TYPES,
    login: login, logout: logout, currentUser: currentUser, displayName: displayName, userRole: userRole,
    mustChangePassword: mustChangePassword, changePassword: changePassword,
    audit: audit, listAudit: listAudit,
    isAdmin: isAdmin, permissions: permissions, hasPermission: hasPermission, refreshMe: refreshMe,
    createDesktopShortcut: createDesktopShortcut,
    apiPostBlob: apiPostBlob, licenseStatus: licenseStatus, licenseImport: licenseImport,
    listPermissions: listPermissions, listUsers: listUsers, createUser: createUser,
    updateUser: updateUser, deleteUser: deleteUser, setUserPermissions: setUserPermissions, setUserGroups: setUserGroups,
    listGroups: listGroups, createGroup: createGroup, updateGroup: updateGroup, deleteGroup: deleteGroup,
    setGroupPermissions: setGroupPermissions, setGroupMembers: setGroupMembers,
    listDbBackups: listDbBackups, createDbBackup: createDbBackup, restoreDbBackup: restoreDbBackup,
    addFaultType: addFaultType, removeFaultType: removeFaultType, renameFaultType: renameFaultType,
    addSymptom: addSymptom, updateSymptom: updateSymptom, removeSymptom: removeSymptom,
    buildFaultDictWorkbook: buildFaultDictWorkbook, previewFaultImport: previewFaultImport, commitFaultImport: commitFaultImport,
    addRole: addRole, removeRole: removeRole, updatePatrolConfig: updatePatrolConfig,
    updateLessonStages: updateLessonStages,
    addEngineer: addEngineer, updateEngineer: updateEngineer, removeEngineer: removeEngineer,
    getDuty: getDuty, setSchedule: setSchedule, getScheduleRange: getScheduleRange,
    copySchedule: copySchedule, batchSchedule: batchSchedule,
    batchScheduleDates: batchScheduleDates, batchClearSchedule: batchClearSchedule,
    buildRoomsWorkbook: buildRoomsWorkbook, previewRoomImport: previewRoomImport, commitRoomImport: commitRoomImport,
    buildScheduleWorkbook: buildScheduleWorkbook, previewScheduleImport: previewScheduleImport, commitScheduleImport: commitScheduleImport,
    resetDemo: resetDemo, clearAll: clearAll
  };
})(window);
