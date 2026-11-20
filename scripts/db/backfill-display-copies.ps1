#!/usr/bin/env pwsh
<#
.SYNOPSIS
    P0-B2 历史展示副本回填（一次性 JVM 迁移入口，默认只允许测试库）。

.DESCRIPTION
    通过 `sbt "runMain services.system.migrations.BackfillDisplayCopies"` 调用独立迁移入口：
      - 为全部 exhibition_photos（含 active 快照引用的归档照片）生成去 EXIF/GPS 展示副本；
      - 对草稿与 active 快照引用的 render 封面，如含 EXIF/注释等元数据则重编码；
      - 只写展示副本与重编码 render 文件，不改原图与数据库行；已有展示副本跳过，可安全重跑；
      - 完成标记与摘要写入 DATA_DIR/migrations/backfill-display-copies.json。

    安全边界：
      - 必须显式给出 -DbUrl；默认只接受数据库名以 `_test` 结尾的测试库；
      - 真实开发库 momentarium 与展示库的执行属独立审批项，需显式加 -AllowNonTestDatabase；
      - 数据库口令仍从 backend/.env 读取，脚本不接收、不打印口令。

.PARAMETER DbUrl
    目标 JDBC URL，例如 jdbc:postgresql://localhost:5432/momentarium_test。

.PARAMETER DataDir
    DATA_DIR（迁移只读原图、只写展示副本/重编码 render 文件）；默认 backend/data/backfill-display-copies。

.PARAMETER AllowNonTestDatabase
    仅供独立审批后的真实库/展示库执行；未显式提供时拒绝非 *_test 数据库。

.PARAMETER SbtPath
    sbt 启动器路径；默认使用 PATH 中的 sbt。

.EXAMPLE
    pwsh scripts/db/backfill-display-copies.ps1 -DbUrl 'jdbc:postgresql://localhost:5432/momentarium_test'

.EXAMPLE
    pwsh scripts/db/backfill-display-copies.ps1 `
      -DbUrl 'jdbc:postgresql://localhost:5432/momentarium_test' `
      -DataDir 'data/momentarium-backfill-data'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DbUrl,
    [string]$DataDir = 'data/backfill-display-copies',
    [switch]$AllowNonTestDatabase,
    [string]$SbtPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$migrationName = 'backfill-display-copies'
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
Write-Host "[$migrationName] 只写展示副本/重编码 render 文件，不改原图与数据库行；已有展示副本跳过。"

$env:DB_URL = $normalizedUrl
$env:DATA_DIR = $resolvedDataDir
$env:AI_MODE = 'fake'

Push-Location -LiteralPath $backendDirectory
try {
    & $SbtPath -batch 'runMain services.system.migrations.BackfillDisplayCopies'
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    throw "回填未完全成功（sbt 退出码 $exitCode）。修复失败项后可直接重跑；已存在展示副本会跳过、不会重复写。"
}
Write-Host "[$migrationName] 完成；摘要与完成标记见上方输出（DATA_DIR/migrations/$migrationName.json）。"
