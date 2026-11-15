# 东华大学多媒体教室运维系统 · 版本化发布脚本
# 每次运行都会生成一个新版本号（默认在当前版本末位 +1），把安装包归档到 releases\v<版本>\
# 用法：
#   .\build_release.ps1                         自动递增版本（1.0.0 -> 1.0.1）
#   .\build_release.ps1 -Version 1.1.0          指定版本号
#   .\build_release.ps1 -Version 1.0.0 -Notes "修复xxx"
param(
    [string]$Version = '',
    [string]$Notes = '',
    [switch]$NoBump
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $Root 'dist'
$Releases = Join-Path $Root 'releases'
$AppName = '东华大学多媒体教室运维系统'

function Write-Utf8($path, $text) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------- 1. 计算版本号 ----------
$prev = $null
$vf = Join-Path $Root 'version.json'
if (Test-Path $vf) {
    try { $prev = [string](Get-Content $vf -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {}
}
if ($Version) {
    $newVersion = $Version.Trim().TrimStart('v', 'V')
} elseif ($prev -and -not $NoBump) {
    # 版本号可能是 1.5.0-beta.1 之类的预发布格式：先取 '-' 前的主版本，
    # 只递增第 3 段数字，避免对 "0-beta" 这类片段做 [int] 转换而抛异常。
    $core = ($prev -split '-')[0]
    $parts = @($core.Split('.'))
    while ($parts.Count -lt 3) { $parts += '0' }
    try { $patch = [int]$parts[2] + 1 } catch { $patch = 1 }
    $newVersion = $parts[0] + '.' + $parts[1] + '.' + $patch
} elseif ($prev) {
    $newVersion = $prev
} else {
    $newVersion = '1.0.0'
}
if (-not $newVersion) { throw '无法确定版本号' }

$buildTime = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
if (-not $Notes) { $Notes = '常规构建与验证' }

# ---------- 版权与产品元数据（发布件统一引用，只需改这里） ----------
$Product = '东华大学多媒体教室运维系统'
$Company = '东华大学信息中心'
$Copyright = '© 2026 东华大学信息中心 版权所有'

# 优先使用构建虚拟环境中的 Python（需含 pyinstaller / rjsmin / rcssmin）
$PyExe = Join-Path $Root '.build-venv\Scripts\python.exe'
if (-not (Test-Path $PyExe)) { $PyExe = 'python' }

Write-Host '============================================'
Write-Host ("  构建版本 v" + $newVersion) -ForegroundColor Cyan
Write-Host '============================================'

# ---------- 2. 写入版本文件 ----------
$verJson = [ordered]@{ version = $newVersion; buildTime = $buildTime; notes = $Notes } | ConvertTo-Json
Write-Utf8 $vf $verJson
Write-Utf8 (Join-Path $Root 'assets\version.json') $verJson
Write-Utf8 (Join-Path $Root 'assets\version.js') ("/* 由 build_release.ps1 自动生成，请勿手工修改 */`r`nwindow.APP_VERSION = '" + $newVersion + "';`r`n")

# ---------- 2.5 前端压缩与 Windows 版本资源 ----------
Write-Host '[1/5] 压缩前端资源并生成版本资源 ...'
$FrontDir = Join-Path $Root 'build\assets'
$VerResDir = Join-Path $Root 'build\version'
& $PyExe (Join-Path $Root 'tools\minify_assets.py') --src (Join-Path $Root 'assets') --out $FrontDir `
    --version $newVersion --copyright $Copyright --product $Product
if ($LASTEXITCODE -ne 0) { throw '前端压缩失败' }
& $PyExe (Join-Path $Root 'tools\make_version_info.py') --version $newVersion --out $VerResDir `
    --company $Company --product $Product --copyright $Copyright
if ($LASTEXITCODE -ne 0) { throw '生成版本资源失败' }

# 发布前断言：敏感文件不得进入安装包；压缩产物与版本资源必须存在
$forbidden = Get-ChildItem -Path $FrontDir -Recurse -File | Where-Object {
    $_.Extension -in '.pem', '.key', '.p12', '.pfx' -or $_.Name -like '*private*'
}
if ($forbidden) { throw ('发布资源中发现敏感文件：' + (($forbidden | ForEach-Object { $_.FullName }) -join ', ')) }
if (-not (Test-Path (Join-Path $FrontDir 'store.js'))) { throw '前端压缩产物缺失，已中止打包' }
if (-not (Test-Path (Join-Path $VerResDir 'server.txt'))) { throw '版本资源缺失，已中止打包' }

# ---------- 3. 打包服务端 ----------
$Icon = Join-Path $Root 'assets\dhu-ops.ico'
Write-Host '[2/5] 打包服务端 dhu-ops-server.exe ...'
Push-Location $Root
try {
    Remove-Item (Join-Path $Dist 'dhu-ops-server.spec') -ErrorAction SilentlyContinue
    & $PyExe -m PyInstaller --noconfirm --clean --onefile --noconsole --name dhu-ops-server `
        --icon $Icon `
        --version-file (Join-Path $VerResDir 'server.txt') `
        --distpath $Dist --workpath (Join-Path $env:TEMP 'dhu_build_server') --specpath $Dist `
        --add-data "$Root\index.html;." --add-data "$FrontDir;assets" --add-data "$Root\vendor;vendor" `
        --exclude-module numpy --exclude-module scipy --exclude-module pandas --exclude-module matplotlib `
        --exclude-module tkinter --exclude-module IPython --exclude-module pytest `
        "$Root\server.py"
    if ($LASTEXITCODE -ne 0) { throw '服务端打包失败' }

    Write-Host '[3/5] 打包桌面启动器 DHU-Ops-Launcher.exe ...'
    Remove-Item (Join-Path $Dist 'DHU-Ops-Launcher.spec') -ErrorAction SilentlyContinue
    & $PyExe -m PyInstaller --noconfirm --clean --onefile --noconsole --name DHU-Ops-Launcher `
        --icon $Icon `
        --version-file (Join-Path $VerResDir 'launcher.txt') `
        --distpath $Dist --workpath (Join-Path $env:TEMP 'dhu_build_launcher') --specpath $Dist `
        "$Root\launcher.py"
    if ($LASTEXITCODE -ne 0) { throw '启动器打包失败' }

    Write-Host '[4/5] 打包安装程序 DHU-Ops-Setup.exe ...'
    Remove-Item (Join-Path $Dist 'DHU-Ops-Setup.spec') -ErrorAction SilentlyContinue
    & $PyExe -m PyInstaller --noconfirm --clean --onefile --windowed --uac-admin --name DHU-Ops-Setup `
        --icon $Icon `
        --version-file (Join-Path $VerResDir 'setup.txt') `
        --distpath $Dist --workpath (Join-Path $env:TEMP 'dhu_build_setup') --specpath $Dist `
        --exclude-module numpy --exclude-module mkl --exclude-module scipy `
        --exclude-module pandas --exclude-module matplotlib `
        --add-binary "$Dist\dhu-ops-server.exe;." `
        --add-binary "$Dist\DHU-Ops-Launcher.exe;." `
        --add-data "$Icon;." `
        --add-data "$Root\version.json;." --add-data "$Root\rollback.ps1;." `
        "$Root\installer_gui.py"
    if ($LASTEXITCODE -ne 0) { throw '安装程序打包失败' }
} finally {
    Pop-Location
}

# ---------- 4. 归档到 releases\v<版本> ----------
$relDir = Join-Path $Releases ('v' + $newVersion)
New-Item -ItemType Directory -Force -Path $relDir | Out-Null
foreach ($f in @('dhu-ops-server.exe', 'DHU-Ops-Launcher.exe', 'DHU-Ops-Setup.exe')) {
    Copy-Item (Join-Path $Dist $f) (Join-Path $relDir $f) -Force
}
Copy-Item $vf (Join-Path $relDir 'version.json') -Force
Copy-Item (Join-Path $Root 'rollback.ps1') (Join-Path $relDir 'rollback.ps1') -Force
Copy-Item (Join-Path $Root 'build\assets-manifest.json') (Join-Path $relDir 'assets-manifest.json') -Force

# ---------- 5. 组装一键安装包 zip ----------
Write-Host '[5/5] 组装一键安装包 ...'
$stage = Join-Path $env:TEMP ('dhu_pkg_' + $newVersion)
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$oldZip = Join-Path $Root ($AppName + '_一键安装包.zip')
$base = Join-Path $stage $AppName
if (Test-Path $oldZip) {
    Expand-Archive -Path $oldZip -DestinationPath $stage -Force
}
New-Item -ItemType Directory -Force -Path $base | Out-Null
foreach ($f in @('dhu-ops-server.exe', 'DHU-Ops-Launcher.exe', 'DHU-Ops-Setup.exe')) {
    Copy-Item (Join-Path $Dist $f) (Join-Path $base $f) -Force
}
Copy-Item $vf (Join-Path $base 'version.json') -Force
Copy-Item (Join-Path $Root 'rollback.ps1') (Join-Path $base 'rollback.ps1') -Force

$bat = @'
@echo off
chcp 936 >nul
setlocal EnableExtensions
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 正在请求管理员权限...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1" %*
echo.
pause
'@
[System.IO.File]::WriteAllText((Join-Path $base '版本回滚.bat'), ($bat -replace "`r?`n", "`r`n"), [System.Text.Encoding]::GetEncoding(936))

$verTxt = @"
版本号：v$newVersion
构建时间：$buildTime
版本说明：$Notes

回滚方法：
  1. 升级安装新版本时，安装程序会自动把旧版本备份到 安装目录\versions\旧版本号\
  2. 双击安装目录下的「版本回滚.bat」，按提示输入要回滚的版本号（如 1.0.0）
  3. 也可以在命令行执行：版本回滚.bat 1.0.0
  4. 回滚前脚本会自动备份当前版本，可再次切回

本版本发布文件：
  releases\v$newVersion\  服务端与安装程序
"@
Write-Utf8 (Join-Path $base '版本说明.txt') $verTxt

$zipOut = Join-Path $Releases ($AppName + '_v' + $newVersion + '_一键安装包.zip')
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipOut -CompressionLevel Optimal
Copy-Item $zipOut (Join-Path $Root ($AppName + '_v' + $newVersion + '_一键安装包.zip')) -Force
# 兼容旧链接：保留一个「最新版」通用文件名
Copy-Item $zipOut $oldZip -Force

# ---------- 6. 更新版本清单 ----------
$idx = Join-Path $Releases 'releases.json'
$list = @()
if (Test-Path $idx) {
    try {
        $raw = Get-Content $idx -Raw -Encoding UTF8
        if ($raw) {
            # PS5.1 的 ConvertFrom-Json 会把顶层数组作为单个对象返回，必须先存变量再枚举
            $parsed = $raw | ConvertFrom-Json
            $list = @($parsed | Where-Object { $_ -and $_.PSObject.Properties['version'] })
        }
    } catch { $list = @() }
}
$list = @($list | Where-Object { $_.version -ne $newVersion }) + @([pscustomobject]@{
    version = $newVersion
    buildTime = $buildTime
    notes = $Notes
    server = 'releases\v' + $newVersion + '\dhu-ops-server.exe'
    setup = 'releases\v' + $newVersion + '\DHU-Ops-Setup.exe'
    zip = $zipOut
})
Write-Utf8 $idx (ConvertTo-Json -InputObject @($list) -Depth 5)

# ---------- 7. 清理 ----------
Remove-Item (Join-Path $Dist 'dhu-ops-server.spec'), (Join-Path $Dist 'DHU-Ops-Launcher.spec'), (Join-Path $Dist 'DHU-Ops-Setup.spec') -ErrorAction SilentlyContinue
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ("[完成] v" + $newVersion + " 构建完成") -ForegroundColor Green
Write-Host ("安装包：" + $zipOut)
Write-Host ("归档目录：" + $relDir)
Write-Host ("版本清单：" + $idx)
