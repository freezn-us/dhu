﻿# 东华大学多媒体教室运维系统 · 版本回滚脚本
# 用法：在安装目录双击「版本回滚.bat」，按提示输入版本号；或 版本回滚.bat 1.0.0
param(
    [Parameter(Position = 0)]
    [string]$Version = ''
)

$ErrorActionPreference = 'Continue'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = 'DHU-Ops-Server'
$ExeName = 'dhu-ops-server.exe'
$VersionsRoot = Join-Path $Dir 'versions'

function Read-VersionFile([string]$path) {
    try {
        $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($j.version) { return [string]$j.version }
    } catch {}
    return ''
}

Write-Host '============================================'
Write-Host '  东华大学多媒体教室运维系统 · 版本回滚'
Write-Host '============================================'

$current = ''
if (Test-Path (Join-Path $Dir 'version.json')) {
    $current = Read-VersionFile (Join-Path $Dir 'version.json')
}
if (-not $current) { $current = '未记录' }
Write-Host ("当前版本：v" + $current)
Write-Host ("安装目录：" + $Dir)

$available = @()
if (Test-Path $VersionsRoot) {
    Get-ChildItem $VersionsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-Path (Join-Path $_.FullName $ExeName)) { $available += $_.Name }
    }
}

if ($available.Count -eq 0) {
    Write-Host ''
    Write-Host '[提示] 没有找到可回滚的历史版本。'
    Write-Host '升级安装新版本时，安装程序会自动把旧版本备份到 versions\<版本号>\ 目录。'
    Write-Host '如需回滚，请先把旧版本的 dhu-ops-server.exe 放入上述目录。'
    exit 1
}

$sorted = $available | Sort-Object {
    try { [version]$_ } catch { [version]'0.0.0' }
} -Descending
Write-Host ''
Write-Host '可回滚的历史版本：'
$sorted | ForEach-Object { Write-Host ('  - ' + $_) }

if (-not $Version) {
    $Version = Read-Host '请输入要回滚的版本号（例如 1.0.0）'
}
$Version = $Version.Trim().TrimStart('v', 'V')
if (-not $Version) {
    Write-Host '[错误] 未输入版本号，已取消。'
    exit 1
}
if ($Version -eq $current) {
    Write-Host ('[提示] 当前已经是 v' + $Version + '，无需回滚。')
    exit 0
}
if ($available -notcontains $Version) {
    Write-Host ('[错误] 未找到版本 ' + $Version + ' 的备份，请从上方列表中选择。')
    exit 1
}

$srcDir = Join-Path $VersionsRoot $Version
Write-Host ''
Write-Host ('即将回滚：v' + $current + '  ->  v' + $Version)
$ans = Read-Host '确认执行回滚？输入 Y 回车继续，其他任意键取消'
if ($ans.Trim().ToUpper() -ne 'Y' -and $ans.Trim().ToUpper() -ne 'YES') {
    Write-Host '已取消回滚。'
    exit 0
}

# 回滚前先备份当前版本，方便再次升级/切回
if ($current -ne '未记录' -and $current -ne 'unknown') {
    $curDir = Join-Path $VersionsRoot $current
    if (-not (Test-Path (Join-Path $curDir $ExeName))) {
        New-Item -ItemType Directory -Force -Path $curDir | Out-Null
        Copy-Item (Join-Path $Dir $ExeName) (Join-Path $curDir $ExeName) -Force
        if (Test-Path (Join-Path $Dir 'version.json')) {
            Copy-Item (Join-Path $Dir 'version.json') (Join-Path $curDir 'version.json') -Force
        }
        Write-Host ('已备份当前版本 v' + $current)
    }
}

Write-Host '停止服务...'
& schtasks /end /tn $TaskName 2>$null | Out-Null
Start-Sleep -Milliseconds 800
Get-Process -Name 'dhu-ops-server' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host ('替换程序为 v' + $Version + ' ...')
Copy-Item (Join-Path $srcDir $ExeName) (Join-Path $Dir $ExeName) -Force
$srcVf = Join-Path $srcDir 'version.json'
if (Test-Path $srcVf) {
    Copy-Item $srcVf (Join-Path $Dir 'version.json') -Force
} else {
    $tmp = @{ version = $Version; buildTime = ''; notes = 'rollback' } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $Dir 'version.json'), $tmp, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host '启动服务...'
& schtasks /run /tn $TaskName 2>$null | Out-Null

$port = 8420
try {
    $p = (Get-Content (Join-Path $Dir 'port.txt') -Raw).Trim()
    if ($p) { $port = [int]$p }
} catch {}

$ok = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest ('http://127.0.0.1:' + $port + '/api/health') -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
}

if ($ok) {
    Write-Host ''
    Write-Host ('[成功] 已回滚到 v' + $Version + '，服务运行正常：http://127.0.0.1:' + $port)
} else {
    Write-Host ''
    Write-Host ('[警告] 已替换为 v' + $Version + '，但服务在 25 秒内未通过健康检查。')
    Write-Host '请检查端口是否被占用，或在命令行运行：schtasks /run /tn DHU-Ops-Server'
}
