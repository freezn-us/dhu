/* 使用说明 */
(function () {
  'use strict';
  var U = window.UI, S = window.Store;

  function render() {
    var st = S.getState();
    return '' +
      '<div class="page-head"><div><div class="page-title">使用说明</div>' +
      '<div class="page-sub">轻量版 · 纯前端 · 离线可用 · 数据保存在本机浏览器</div></div></div>' +
      '<div class="grid grid-2" style="align-items:start">' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('arrow') + '日志填报闭环</h3></div>' +
      '<div style="font-size:13px;line-height:2.1;color:#3f4652">' +
      '<div><b style="color:#1677ff">① 来电登记</b>：记录来电人、教室、故障现象、紧急度，生成 <span class="mono">WL-日期-序号</span> 待填报报修日志。</div>' +
      '<div><b style="color:#fa8c16">② 指派</b>：登记时可直接选工程师，系统按楼栋与在办量推荐；也可先不指派，等补录时再确定。</div>' +
      '<div><b style="color:#1677ff">③ 每日工作日志</b>：默认显示当天，按上午 / 下午 / 晚上三时段填写；页面顶部只读显示当天当班人员（来自「基础配置 → 排班日历」）；待填报报修会单独提示，点击「填报」即可补录并保留原编号。<b>普通用户仅可编辑/删除当天的日志</b>（不限填报人），历史日期与巡检记录只读；管理员不受限制。</div>' +
      '<div><b style="color:#722ed1">④ 新增记录</b>：在每日工作日志各时段点「新增一条」，支持快捷短语一键带入、责任人多选（限当天当班人员）、保存并继续新增；可选择「课前巡检 / 上课中 / 上课后」阶段，阶段可在基础配置中增删改名并设默认；同一故障影响多个教室时用「批量录入多教室」。</div>' +
      '<div><b style="color:#52c41a">⑤ 巡视管理</b>：每天 0 点自动生成 3 个时段的巡视任务；超过时段结束时间仍未打卡的任务，会在打开系统时自动完成并生成巡检日志；打卡后自动写入巡检日志，发现异常可同时生成待填报报修。</div>' +
      '<div><b style="color:#13c2c2">⑥ 自动报表</b>：按任意时间范围统计日志量、故障 TOP、楼栋/教室分布、工程师工作量与处理时长，并导出 Excel。</div></div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('database') + '数据存在哪里</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.95;color:#646a73">' +
      '数据保存在服务端 <span class="mono">SQLite</span> 数据库（<span class="mono">data/dhu_ops.db</span>），浏览器不落地业务数据；需先运行 <span class="mono">python server.py</span> 并登录后使用。' +
      '<br>账号密码以 SHA-256+salt 哈希存于服务端，登录后凭 token 访问接口，退出或 token 失效即无法读写数据。' +
      '<br>更换电脑/浏览器不影响数据；仍建议定期在「导入 / 导出」导出备份 JSON（含日志与巡视记录）。' +
      '<br>首次打开会自动生成演示日志；正式使用前在「导入 / 导出 → 清空全部日志」后开始录入。' +
      '<br>当前：<b>' + st.tickets.length + '</b> 条日志 · 教室 <b>' + st.settings.rooms.length + '</b> 间 · 工程师 <b>' + st.settings.engineers.length + '</b> 人。</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('upload') + '导入格式</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.9;color:#646a73">' +
      '在「导入 / 导出」下载模板，必填四列：<b>来电时间、教室、故障类型、故障现象</b>；日志编号可留空自动生成。' +
      '<br>支持东华大学「每日运维工作日志」月度 Excel 直接导入：按各 sheet 的三行表头解析，时段、故障类型、处理结果、责任人自动归位。' +
      '<br>仅支持 .xlsx 格式；导入前会先解析预览，错误行逐行提示并跳过，不影响其他行；与系统中完全相同的日志不会重复导入。</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('mobile') + '手机端使用</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.9;color:#646a73">' +
      '把窗口缩窄到 900px 以下即为移动端布局：底部导航为工作台 / 日志 / 巡视 / 报表，列表自动转为卡片，详情全屏展开。' +
      '<br>右上角「手机预览」会打开 430px 宽的窗口，方便在电脑上演示。' +
      '<br>右上角显示当前登录的用户名；工程师账号登录后，日志录入与巡视打卡默认以本人署名。</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('alert') + '规则与限制</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.9;color:#646a73">' +
      '日志状态：待填报 → 已指派 → 处理中 → 待跟进 → 已记录；已记录日志可编辑，已取消留痕。' +
      '<br>日志类型：报修处理（来电产生）、日常巡检（巡视打卡生成）、主动维护、其他事项。' +
      '<br>巡视：每天固定上午 7:30-11:30、下午 13:00-17:00、晚上 18:00-21:30 三个时段，共 6 项检查标准。' +
      '<br>系统内置账号与权限体系：管理员在「系统管理 → 用户与权限」中维护登录账号、分配菜单权限，并可通过用户组批量授权；普通用户仅能看到被授权的菜单。多人同时录入的数据实时保存在服务端 SQLite，局域网内可共享。' +
      '<br>审计日志：「系统管理 → 审计日志」记录登录 / 退出、页面访问以及日志、工单、巡视、配置、数据与用户管理操作，详情用中文说明改动了哪个模块、哪些内容（含修改前后的值），可按日期、用户、模块、关键词检索并导出 CSV，仅管理员可见。</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('download') + '桌面快捷方式</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.9;color:#646a73">' +
      '不必每次先开浏览器再输网址。点下面按钮生成桌面图标，以后双击它就能直接进入系统。' +
      '<br>在<b>服务器这台电脑</b>上点击，图标会直接出现在公共桌面（该机所有 Windows 账户可见）；' +
      '在<b>其他电脑</b>上点击，会下载一个快捷方式文件，把它拖到桌面即可。' +
      '<br>快捷方式记录的是当前访问地址，服务器 IP 变更后需要重新生成一次。' +
      '<div style="margin-top:10px"><button class="btn btn-primary" onclick="App.createShortcut()">' + U.icon('download', 14) + '创建桌面快捷方式</button></div>' +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '使用手册下载</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.9;color:#646a73">' +
      '完整的系统使用手册，包含快速上手、业务闭环、知识库沉淀、报表、系统设置、常见问题等章节，可离线查阅。' +
      '<div style="margin-top:10px"><a class="btn btn-primary" href="/assets/docs/东华大学多媒体教室运维系统_使用手册_v1.3.0.pdf" download>' + U.icon('download', 14) + '下载使用手册 PDF（v1.3.0）</a></div>' +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('alert') + '关于本系统</h3></div>' +
      '<div style="font-size:12.5px;line-height:1.95;color:#646a73">' +
      '东华大学多媒体教室运维系统 · 版本 <b class="mono">' + (window.APP_VERSION || '-') + '</b>' +
      '<br>著作权人：<b>东华大学信息中心</b>　© 2026 版权所有' +
      '<br>本系统为定制开发软件，程序代码、界面设计、数据结构与报表统计口径均受著作权法保护；未经书面许可，不得复制、传播、反编译、二次销售或用于其他项目。' +
      '<br>授权范围以随系统导入的授权文件（<span class="mono">license.json</span>）载明的机构、机器码与有效期为准，授权仅限绑定机器使用。' +
      '</div></div>' +

      '<div class="card"><div class="card-head"><h3>' + U.icon('file') + '快捷入口</h3></div>' +
      '<div class="quick-grid">' +
      '<button class="quick" onclick="App.go(\'daily-log\')"><span class="ico" style="background:#e6f4ff;color:#1677ff">' + U.icon('calendar', 17) + '</span><span><b>每日工作日志</b><span>按三时段填报</span></span></button>' +
      '<button class="quick" onclick="App.go(\'patrol\')"><span class="ico" style="background:#f6ffed;color:#52c41a">' + U.icon('check', 17) + '</span><span><b>巡视打卡</b><span>每日三时段</span></span></button>' +
      '<button class="quick" onclick="App.go(\'intake\')"><span class="ico" style="background:#fff7e6;color:#fa8c16">' + U.icon('phone', 17) + '</span><span><b>登记来电</b><span>生成待填报报修</span></span></button>' +
      '<button class="quick" onclick="App.go(\'reports\')"><span class="ico" style="background:#f9f0ff;color:#722ed1">' + U.icon('chart', 17) + '</span><span><b>查看报表</b><span>导出 Excel</span></span></button>' +
      '</div></div></div>';
  }

  window.Views = window.Views || {};
  window.Views.help = { render: render };
})();
