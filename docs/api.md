# API 接口文档

> 由 `docs/_gen_api_md.py` 对 `server.py` 做 AST 静态解析生成，代码基线 v1.3.8。
> 重新生成：`python docs/_gen_api_md.py`（不导入 server，无建库副作用）

## 调用约定

- 鉴权列含义：**登录用户** = 需 `Authorization: Bearer <token>`（token 由 `/api/login` 签发）；**管理员** = 在登录基础上还要求管理员角色；**无需登录** = 公开接口。
- 未登录或会话失效返回 401；权限不足返回 403；参数错误返回 400 与 `{"error": "原因"}`。`/api/` 下所有错误统一为 JSON。
- 业务数据以 `/api/state` 整体读写（GET 下发含 `rev`，POST 回带 `baseRev` 做乐观锁；版本不一致返回 409 并附最新 state）。报表查询走 `/api/report/*`，由 mart 宽表支撑。
- 授权状态影响写入与登录：宽限期只读，过期禁止登录（见 `/api/license`）。

## 静态与自检

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/` | GET | 无需登录 | — |
| `/api/health` | GET | 无需登录 | — |

## 登录与会话

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/login` | POST | 无需登录 | — |
| `/api/logout` | POST | 无需登录 | — |
| `/api/me` | GET | 登录用户 | — |

## 授权

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/license` | GET | 无需登录 | — |
| `/api/license` | POST | 登录用户 | — |

## 业务状态

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/desktop/shortcut` | POST | 登录用户 | 本机：直接在公共桌面生成 .lnk；局域网其他电脑：返回降级标记，由前端下载 .url。 |
| `/api/export/csv` | POST | 登录用户 | — |
| `/api/state` | GET,POST | 登录用户 | — |

## 备份与恢复

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/backup` | POST | 管理员 | — |
| `/api/backup/restore` | POST | 管理员 | — |
| `/api/backups` | GET | 管理员 | — |

## 账号与权限

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/groups` | GET,POST | 管理员 | — |
| `/api/groups/<int:gid>` | DELETE,PUT | 管理员 | — |
| `/api/groups/<int:gid>/members` | PUT | 管理员 | — |
| `/api/groups/<int:gid>/permissions` | PUT | 管理员 | — |
| `/api/permissions` | GET | 登录用户 | — |
| `/api/users` | GET,POST | 管理员 | — |
| `/api/users/<name>` | DELETE,PUT | 管理员 | — |
| `/api/users/<name>/groups` | PUT | 管理员 | — |
| `/api/users/<name>/permissions` | PUT | 管理员 | — |

## 审计

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/audit` | POST | 登录用户 | — |
| `/api/audit` | GET | 管理员 | — |

## 统计报表

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/report/compare` | GET | 登录用户 | 两个时间段的关键指标对比。from/to 为主区间，from2/to2 为对比区间（可选）。 |
| `/api/report/device/summary` | GET | 登录用户 | 设备台账概览：状态分布、保修预警、按类别。 |
| `/api/report/device/warranty` | GET | 登录用户 | 保修预警列表（按到期时间升序）。 |
| `/api/report/patrol` | GET | 登录用户 | 巡视统计：完成率、异常 TOP、参与人、异常 vs 工单关联。 |
| `/api/report/pdf` | POST | 登录用户 | — |
| `/api/report/summary` | GET | 登录用户 | 核心汇总：总量、状态分布、故障 TOP、楼栋、工程师工作量、时效指标。 |
| `/api/report/trend` | GET | 登录用户 | 逐日 / 逐周 / 逐月工单量。 |

## 其他

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/<path:path>` | GET | 无需登录 | — |

---

共 32 个接口。
