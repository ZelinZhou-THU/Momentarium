#!/usr/bin/env pwsh
<#
.SYNOPSIS
    阶段 4 当前场景指针回填（一次性 JVM 迁移入口，默认只允许测试库）。

.DESCRIPTION
    通过 `sbt "runMain services.system.migrations.BackfillCurrentSceneRunIds"` 调用独立迁移入口：
      - 为 gallery.exhibitions.current_scene_run_id 的空指针回填该展览最新一次 succeeded 运行
        （按 created_at DESC, id DESC 排序，核对所属展览与状态）；无成功运行保留空值；
      - 只填空指针，不覆盖已设置的指针，不刷新展览 updated_at；可失败后重跑；
      - 完成标记与摘要写入 DATA_DIR/migrations/backfill-current-scene-run-ids.json（不新增系统表）；
      - 不挂常规启动、不做运行期“空指针取最新成功”兜底。

    安全边界：
      - 必须显式给出 -DbUrl；默认只接受数据库名以 `_test` 结尾的测试库；
      - 真实开发库 momentarium 与展示库的执行属独立审批项，需显式加 -AllowNonTestDatabase；
      - 数据库口令仍从 backend/.env 读取，脚本不接收、不打印口令。

.PARAMETER DbUrl
    目标 JDBC URL，例如 jdbc:postgresql://localhost:5432/momentarium_test。

.PARAMETER DataDir
    DATA_DIR（迁移只写完成标记/摘要文件）；默认 backend/data/backfill-current-scene-run-ids。

.PARAMETER AllowNonTestDatabase
    仅供独立审批后的真实库/展示库执行；未显式提供时拒绝非 *_test 数据库。

.PARAMETER SbtPath
    sbt 启动器路径；默认使用 PATH 中的 sbt。

.EXAMPLE
    pwsh scripts/db/backfill-current-scene-run-ids.ps1 -DbUrl 'jdbc:postgresql://localhost:5432/momentarium_test'

.EXAMPLE
    pwsh scripts/db/backfill-current-scene-run-ids.ps1 `
      -DbUrl 'jdbc:postgresql://localhost:5432/momentarium_test' `
      -DataDir 'data/momentarium-scene-pointer-backfill'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DbUrl,
    [string]$DataDir = 'data/backfill-current-scene-run-ids',
    [switch]$AllowNonTestDatabase,
    [string]$SbtPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$migrationName = 'backfill-current-scene-run-ids'
$normalizedUrl = $DbUrl.Trim()
$databaseName = ($normalizedUrl.TrimEnd('/') -split '/')[-1]
$databaseName = $databaseName.Split('?')[0]
if (-not $databaseName) { throw "无法从 -DbUrl 解析数据库名：$normalizedUrl" }
$isTestDatabase = $databaseName -like '*_test'
if (-not $isTestDatabase -and -not $AllowNonTestDatabase) {
    throw "拒绝执行：目标数据库 '$databaseName' 不是测试库（*_test）。真实库 momentarium 与展示库的执行为独立审批项；如已审批请显式加 -AllowNonTestDatabase。"
}
if ($isTestDatabase -eq $false) {
    Write-Warning "已显式允许非测试库执行：$databaseName"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDirectory = Join-Path $repoRoot 'backend'
if (-not (Test-Path -LiteralPath $backendDirectory)) { throw "找不到 backend 目录：$backendDirectory" }
if (-not $SbtPath) { $SbtPath = 'sbt' }
if (-not $DataDir) { throw '-DataDir 不能为空' }
$resolvedDataDir =
    if ([System.IO.Path]::IsPathRooted($DataDir)) { $DataDir } else { Join-Path $backendDirectory $DataDir }

Write-Host "[$migrationName] 目标数据库 = $databaseName"
Write-Host "[$migrationName] DB_URL      = $normalizedUrl"
Write-Host "[$migrationName] DATA_DIR    = $resolvedDataDir"
Write-Host "[$migrationName] AI_MODE     = fake（迁移不调用模型）"
Write-Host "[$migrationName] 只填空的 current_scene_run_id 指针，不覆盖已设置指针、不改公开快照。"

$env:DB_URL = $normalizedUrl
$env:DATA_DIR = $resolvedDataDir
$env:AI_MODE = 'fake'

Push-Location -LiteralPath $backendDirectory
try {
    & $SbtPath -batch 'runMain services.system.migrations.BackfillCurrentSceneRunIds'
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    throw "指针回填未完全成功（sbt 退出码 $exitCode）。修复失败项后可直接重跑；已设置指针的展览会跳过、不会覆盖。"
}
Write-Host "[$migrationName] 完成；摘要与完成标记见上方输出（DATA_DIR/migrations/$migrationName.json）。"
