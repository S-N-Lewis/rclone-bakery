# 🥖 Bakery（rclone-bakery）

**Foolproof one-way rclone backup with a friendly web UI.** 把系统的 rclone 包装成傻瓜式**单向备份**工具（macOS / Linux 本地网页应用，Node.js + vanilla JS，中文界面）。

每天出炉一份带日期标签的新鲜备份：删除/修改的文件自动落进 `backup/<日期>` 烤盘格，像面包房一样按天取用。

原理：对每个任务执行 `rclone sync 源 → 目标`（单向镜像）。开启"保留删除/修改"后，
被删除或被改动的文件会先移动到 `--backup-dir`（`remote:backup/<日期>/<目标名>`，
如 `gdrive1:backup/2026-11-18/docs`），保留 N 天（默认 30 天）后自动清理。

> 注意：rclone 要求 `--backup-dir` 不能位于目标目录内部，所以备份目录放在远端根下
> `backup/<日期>/<目标末段>`，而不是 `目标/backup/...`。

## 启动

```bash
npm install   # 首次
npm start     # 启动后自动打开 http://localhost:5321
```

- rclone 路径默认 `/opt/homebrew/bin/rclone`，可用环境变量 `RCLONE_PATH` 覆盖。
- 端口默认 5321，可用 `PORT` 覆盖；`NO_BROWSER=1 npm start` 可禁止自动开浏览器。
- 任务配置与运行历史持久化在 `data/*.json`（已 gitignore，不含任何凭据；token 只存在 rclone 自己的配置文件里）。

## 连接 Google Drive 账号

1. 首页「① Google Drive 账号」输入 remote 名（如 `gdrive1`），点「连接」。
2. 会执行 `rclone authorize drive` 并弹出 Google 登录窗口，登录授权。
3. 应用从 rclone 输出中解析 token JSON，自动执行 `rclone config create <name> drive token=...` 写入配置。
4. 页面显示「已连接」即完成；可在 rclone 官方配置文件（`rclone config file` 查看位置）中核对。

解析逻辑是纯函数（`lib/token-parser.js`），带 fixture 单测：`npm test`。

## 创建备份任务

「② 备份任务 → ＋ 新建任务」：

- **本地源文件夹**：手输路径或点「浏览…」服务端列目录选择；
- **目标**：`remote:路径` 形式，如 `gdrive1:Backups/work`；
- **计划**：手动 / 每天 HH:mm / 每周 星期几 HH:mm；
- **保留天数**：删除/修改文件在 backup-dir 里留几天，0 表示不保留（不传 --backup-dir）。

每个任务可「立即运行」或「dry-run 预览」（`--dry-run --verbose`，只显示将发生什么，不做任何改动）。
「③ 运行记录」实时流式显示日志，并保留每次运行的开始/结束/传输量/退出码。

## v0.2 新增（参考 rclone 官方 WebUI 功能面 + 自有优化）

- **macOS 系统通知**：每次备份/恢复结束弹系统通知（成功/失败+传输量），`NO_NOTIFY=1` 可关
- **上传限速**：任务级 `--bwlimit`（填 `10MiB/s`、`500KiB/s` 或纯字节/秒，自动归一化）
- **备份目录浏览与一键恢复**：「④ 备份目录」列出任务的所有 `backup/<日期>` 快照（文件数+大小），
  可把某天快照 `rclone copy` 回源文件夹（只补旧文件、不删新增，支持 dry-run）——这是官方 WebUI 没有的闭环功能
- **远端文件浏览器**：只读浏览 `remote:path`（`rclone lsjson`），确认备份结果用
- **运行耗时**：运行历史新增耗时列
- 修复/工程：`rclone size --json`（键是 count 不是 files）、`--bwlimit` 不接受 `/s` 后缀

> 注：rclone/rclone-webui-react 已归档，官方继任为 [rclone/rclone-web](https://github.com/rclone/rclone-web)（`rclone gui`）。

## 定时方案的选择：进程内 scheduler（不用 launchd）

实现：`setInterval` 每 30 秒检查一次到点任务（`lib/scheduler.js`），触发即运行。
选择理由：
1. 所有逻辑收在一个 Node 进程里，定时触发的运行在网页端同样能看到实时日志；
2. 任务配置和 `lastRunDate` 持久化在 `data/tasks.json`，重启不丢、当天不会重复触发；
3. launchd 需要额外安装/卸载 plist、日志还要绕回 Web 端，复杂度不值。

代价：应用没在运行时定时不会执行——本地工具可接受，常开 `npm start` 即可。

## 工程说明

- 依赖只有 express；前端 vanilla JS（`public/index.html` 单文件），无打包器。
- 运行日志写在 `data/logs/run-<id>.log`，接口从文件读取，刷新页面不丢。
- `scripts/acceptance.sh`：用 rclone 本地 backend 造 mock remote，验证完整单向备份
  （删除/修改的文件落入 `backup/<日期>`）与 dry-run，独立于网页应用可直接 `./scripts/acceptance.sh` 运行。
- 单测：`npm test`（token 解析 fixture 单测 + scheduler 单测，共 11 条）。
- 本仓库不提交任何凭据/数据（`data/`、`node_modules/` 已 gitignore），也不做 git push。

## REST 接口（供调试）

```
GET    /api/remotes            已有 remote 及授权状态
POST   /api/authorize          {name} 触发 rclone authorize 并写配置
GET    /api/ls?path=...        服务端列目录（选源文件夹）
GET    /api/tasks              任务列表 + lastRunDate
POST   /api/tasks              新建任务
DELETE /api/tasks/:id          删除任务
POST   /api/tasks/:id/run      {dryRun:boolean} 运行/dry-run
GET    /api/runs               运行历史
GET    /api/runs/:id           单次运行详情 + 日志
```
