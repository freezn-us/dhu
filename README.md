# 东华大学多媒体教室运维系统

面向东华大学松江校区多媒体教室的运维管理平台：报修受理、工作日志填报、巡视打卡、教室/设备档案、统计报表。

- **当前版本**：v1.5.2（2026-11-17：保存事务/巡视统计修复，随机初始口令与强制改密，默认仅本机监听；见 [version.json](version.json)；上一版 v1.5.1）
- **架构**：Flask + SQLite 后端（`server.py`）+ 原生 JS 单页前端（`assets/`），PyInstaller 打包为 Windows 安装包
- **数据规模**：253 间教室（一教 89 / 二教 92 / 四教 32 / 化工楼 18 / 中南楼 16 / 机房 6）
- **交付形态**：单机或局域网部署，含 RSA 授权与桌面启动器，双击图标即用

> ⚠️ 本系统**不是纯前端应用**。前端所有数据读写都走 `/api/*` 接口（登录、状态、报表、审计），
> 必须先启动 `server.py`，直接双击 `index.html` 会停在登录页且无法取到数据。
> 早期「纯前端 + localStorage」的轻量版已被后端方案取代，相关描述已作废。

---

## 一、快速开始（开发）

```bash
# 依赖：Python 3.11+、flask、cryptography（授权模块）
python server.py
```

默认 `http://127.0.0.1:8420`（仅本机）。首次启动自动生成随机 12 位管理员初始密码，写入数据库目录下的 `初始管理员密码.txt`，账号 `admin`；首次登录会强制改密，改密成功后该文件自动删除。开发环境可用 `DHU_OPS_INITIAL_ADMIN_PWD` 指定初始口令（仅测试用，会跳过强制改密）。

> 首次空库登录会写入一批演示工单/巡视数据，便于熟悉界面；正式使用前请在「数据维护」中清空演示数据，或停止服务后删除数据库重新初始化（会重新生成初始密码）。

局域网访问：在程序目录（开发为项目根，安装后为 `server.exe` 所在目录）新建 `access.txt` 写入 `lan`；写入 `local` 或删除文件则仅本机。旧部署没有 `access.txt` 且已有数据库时保持原来的 `0.0.0.0` 行为，避免升级后失联。安装器提供“允许局域网访问”选项（默认不勾选），勾选后同时把防火墙规则限制为专用网络 + 本地子网。

环境变量：

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `DHU_OPS_PORT` | 服务端口 | `8420` |
| `DHU_OPS_DB` | SQLite 数据库路径 | 开发 `data/dhu_ops.db`；打包后 `%ProgramData%\DHU-Ops\dhu_ops.db` |
| `DHU_OPS_HOST` | 监听地址（优先级最高） | `127.0.0.1`；`access.txt=lan` 时 `0.0.0.0`；旧库无 `access.txt` 时 `0.0.0.0` |
| `DHU_OPS_INITIAL_ADMIN_PWD` | 首次建库时的管理员初始口令（测试用） | 空（随机生成） |
| `DHU_KEYS_DIR` | 厂商私钥目录 | 项目同级 `../dhu-keys`（签发工具用，服务端不需要） |

端口优先级：`DHU_OPS_PORT` > `HTTP_PLATFORM_PORT`（IIS 注入）> 程序目录 `port.txt` > `8420`。

## 二、功能导航

侧栏分 8 组（`assets/app.js` 的 `NAV`）：

| 分组 | 页面 | 说明 |
| --- | --- | --- |
| 概览 | 工作台 | 今日日志、待填报报修、巡视进度、教室状态墙、14 天趋势 |
| 来电受理 | 来电登记 | 按教室楼栋推荐工程师，生成 `WL-YYYYMMDD-NN` 待填报日志 |
| 日志填报 | 每日工作日志 | 上午/下午/晚上三时段表格，填报、补录、批量、导出、打印 |
| 日志填报 | 巡视管理 | 每天自动生成 3 个时段任务，逐项打卡生成巡检日志 |
| 查询与分析 | 日志查询 | 筛选、详情、编辑、导出 |
| 查询与分析 | 统计报表 | 区间统计、故障 TOP、楼栋/教室分布、工作量、时效与满意度 |
| 资产与知识 | 教室/设备档案 | 教室清单（含区域）、设备台账与保修预警 |
| 资产与知识 | 知识库 | 故障速查与操作指引 |
| 数据与配置 | 导入 / 导出 | CSV/XLSX 导入、全量 JSON 备份恢复 |
| 数据与配置 | 基础配置 | 教室、故障类型、工程师、时段、排班日历 |
| 帮助 | 使用说明 | 内嵌操作指引 |
| 系统管理 | 用户与权限 | **仅管理员**：账号、用户组、权限点 |
| 系统管理 | 审计日志 | **仅管理员**：登录/页面访问/业务操作留痕，可导出 CSV |

移动端：宽度 ≤900px 自动切换为底部导航 + 卡片列表；桌面端右上角可开 430×900 手机预览窗口。

## 三、业务流程

日志状态：`待填报 → 已指派 → 处理中 →（未解决转 待跟进）→ 已处理 → 已记录`，另有「已取消」。

紧急度 SLA（响应时限）：紧急 120 分钟、常规 480 分钟、低 1440 分钟。

日志类型：报修处理、日常巡检、主动维护、其他事项。

巡视为长期规则：任何日期仍处「待打卡」且已过时段结束时间的任务都会自动完成并写 `auto` 标记；
发现异常可同时生成待填报报修。

## 四、权限模型

三层：**用户 → 用户组 → 权限点**。

- 12 个可勾选权限点（`server.py` 的 `PERMISSIONS`），与左侧菜单一一对应
- `user-manage`、`audit` 两页不进勾选列表，**仅管理员可见**
- 密码 PBKDF2-HMAC-SHA256（20 万次迭代）+ salt 存 `users` 表，会话 token 存 `sessions` 表（24 小时过期，旧哈希登录时自动升级）
- 首次安装生成随机 12 位管理员初始密码（`初始管理员密码.txt`），`must_change_pwd=1`，改密前仅 `/api/me`、`/api/change-password`、`/api/logout` 等身份接口可用；密码至少 10 位、不得与登录名相同；管理员重置他人密码后强制其重新改密并删除其旧会话；离线可用 `server.exe --reset-admin` 重置
- 日志改删权限：普通用户可编辑/删除**当天**任意日志，历史日期只读
- **服务端权限校验（v1.5.1 起）**：权限点不再只控制菜单显隐。`/api/state` 按「本次提交中发生变化的顶层域」检查权限点（映射见 `STATE_FIELD_PERMS`），越权返回 **403** 并附 `denied` 列表，且不写库；管理员恒放行，首次写入（空库）放行，未改动字段原样提交不受影响。六个报表 JSON 接口与 `/api/report/pdf` 需 `reports` 权限；CSV 导出需 `data`/`tickets`/`reports` 之一；审计上报按类别校验权限（页面访问全员、登录/用户/系统仅管理员）
  > 权限点是**页面级**而非行级：`/api/state` GET 仍返回全量业务数据

## 五、授权（License）

- 客户端内嵌 RSA 公钥（`license_key.py`），厂商用私钥签发，改任意字段即签名失效
- 与机器码绑定（Windows MachineGuid + MAC + 主机名，取 16 位十六进制）
- 无授权文件时自动生成 30 天试用；到期后 7 天宽限期**只读**，超期禁止登录
- 有防系统时间回拨检测
- **厂商私钥不在本目录**：已移出到项目同级 `../dhu-keys/license_private.pem`，
  避免随项目打包分发而泄露。内嵌同一把私钥的 `DHU-License-Maker.exe` 一并移出。
  客户端只需公钥，运行系统不需要私钥目录。

签发授权：

```bash
python tools/make_license.py --org "东华大学" --machine A1B2-C3D4-E5F6-7890 --days 365
```

> ⚠️ 不要运行 `tools/_gen_keys.py` 重新生成密钥——那会作废所有已签发授权，
> 并需同步替换 `license_key.py` 内嵌公钥后重新发布。该脚本已加确认开关，默认拒绝执行。

## 六、数据存储

SQLite（开发默认 `data/dhu_ops.db`，打包后落 `%ProgramData%\DHU-Ops\`）：

> 注意：仓库自带的 `data/dhu_ops.db` 只是演示小样本（6 间教室/101 条日志），
> 253 间教室的验证数据在 `data/devtest.db`；真实业务数据只在客户机，不在本仓库。

- **业务数据**：`state` 表单行 JSON，含 `settings` / `tickets` / `patrols` / `assets`
- **报表宽表**：`tickets_mart` / `patrols_mart` / `devices_mart` + 索引，由 `mart_sync()` 从 state 全量同步；服务启动时 `mart_backfill()` 回填
- **账号体系**：`users` / `sessions` / `user_groups` / `group_members` / `user_permissions` / `group_permissions` / `audit_logs`

并发控制：`state.rev` 乐观锁。GET 下发 `rev`，POST 回带 `baseRev`；不一致返回 **409** 并附最新 state，前端据此刷新后重试。

## 七、导入 / 导出

- **导入**：`.csv` / `.xlsx`，先预览「可导入 N 条 / 失败 N 条」及原因，确认后才写入
  - 必填：来电时间、教室、故障类型、故障现象；表头支持别名，状态与紧急度容错映射
  - 编号重复自动重编号；单行出错不影响其他行
  - 支持东华大学「每日运维工作日志」月度 Excel（多 sheet、三行表头）
- **导出**：统计报表 Excel（汇总/故障类型/楼栋分布/教室TOP/工作量/明细 6 个 sheet）或 CSV 明细；PDF 报表走 `/api/report/pdf`
- **备份**：导出全量 JSON（日志、巡视、教室、故障类型、工程师）；恢复为覆盖式，二次确认
- Excel 读写用本地 `vendor/xlsx.full.min.js`（SheetJS 0.18.5），不依赖外网

## 八、发布打包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build_release.ps1 -Notes "本次变更说明"
```

版本号来源是**根目录 `version.json`**（末位自动 +1，`-Version` 可指定），脚本同步写 `assets/version.json` 与 `assets/version.js`。

产物：

- `releases/东华大学多媒体教室运维系统_v<版本>_一键安装包.zip`
- `releases/v<版本>/`：`dhu-ops-server.exe`、`DHU-Ops-Launcher.exe`、`DHU-Ops-Setup.exe`、`rollback.ps1`、`version.json`
- `releases/releases.json` 追加版本记录

安装后可在**安装目录**下用「版本回滚.bat」按版本号回滚，回滚前会自动备份当前版本。

已知无害提示：`hook-cryptography: failed to determine whether cryptography is using OpenSSL >= 3.0.0`，脚本 exit 0 即可忽略。

## 九、测试

```bash
python tests/ui_selftest.py          # Playwright 端到端
python tests/test_daily_import.py    # 真实日报导入校验
```

共 16 个测试脚本。`tests/_env.py` 与 `ui_selftest.py` 已改为**相对项目根动态解析路径**，换目录无需修改。

- 原硬编码旧路径 `d:\pctools win10\dhu` 的 6 个脚本（`test_daily_import.py`、`test_date_clamp.py`、`test_default_room.py`、`test_export_format.py`、`test_march_import.py`、`test_topbar_cal.py`）已全部改为基于 `__file__` 动态解析；旧机器临时 `pylibs` 搜索路径已从全部测试脚本移除，依赖统一由 `.build-venv` 提供。
- 其中 3 个脚本需要真实日报 xlsx 样本：`test_daily_import.py` / `test_export_format.py` 用 `DHU_TEST_XLSX`（或 `tests/fixtures/daily-log.xlsx`），`test_march_import.py` 用 `DHU_TEST_MARCH_XLSX`（或 `tests/fixtures/march-log.xlsx`）。缺样本时会给出明确提示并退出，不再抛 FileNotFoundError。
- `tests/test_state_rev.py`：乐观锁与统一错误响应（15 项）。
- `tests/test_state_perm.py`：服务端权限校验回归（31 项，临时库 + 临时端口，不碰正式数据）。

## 十、文档

| 文档 | 说明 |
| --- | --- |
| [开发交接说明.md](开发交接说明.md) | 架构、目录、开发约定、版本沿革、回滚方式 |
| [docs/api.md](docs/api.md) | 接口清单与鉴权要求，由脚本自动生成 |
| [发布部署说明书.docx](发布部署说明书.docx) | 客户侧部署与升级 |
| `docs/*.pdf` | 开发架构文档、历版使用手册 |

重新生成接口文档：`python docs/_gen_api_md.py`（AST 静态解析，不导入 server、无建库副作用）。

## 十一、已知限制

- 单机或局域网部署，业务数据整体存为单行 JSON；数据量极大时 `/api/state` 全量读写会成为瓶颈
- 备份恢复为覆盖式，不支持按日志合并
- 导入的故障类型必须在字典内（含包含匹配）；工程师不在名单会提示但仍按文本导入
- 报表以「来电时间」归属统计区间，跨月日志按来电月份计
- 打印样式仅隐藏导航与操作区，未做分页优化
- 权限点为**页面级**：`/api/state` GET 仍返回全量业务数据；报表类 GET 接口被工作台依赖，暂未加权限校验
- 已建立 git 基线（`main` 分支，忽略规则见 `.gitignore`）；`backups/` 手工快照仍留在磁盘但不纳入版本控制。代码级回滚优先用 `git`，已安装版本的回滚仍用安装目录下「版本回滚.bat」
