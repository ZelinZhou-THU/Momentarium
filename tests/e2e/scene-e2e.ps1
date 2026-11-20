# scene 生成链路端到端冒烟（D4 task-32 证据脚本）。
# 前置：后端实例已启动（AI_MODE=fake，DB 需能建 users/gallery/curation/scene schema）。
# 用法：pwsh tests/e2e/scene-e2e.ps1 -BaseUrl http://localhost:8081 -FixtureDir tests/fixtures/synthetic
# 流程：注册→登录→创建展览→上传 3 张→updatecuration 分组→generatescene→轮询 getscenerun 到 awaiting_capture。
param(
  [string]$BaseUrl = 'http://localhost:8081',
  [string]$FixtureDir = (Join-Path $PSScriptRoot '..\fixtures\synthetic'),
  [int]$PhotoCount = 3,
  [int]$PollSeconds = 20
)

$ErrorActionPreference = 'Stop'
$steps = [System.Collections.Generic.List[object]]::new()

function Invoke-ApiStep {
  param([string]$Name, [scriptblock]$Action)
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $detail = & $Action
    $watch.Stop()
    $steps.Add([pscustomobject]@{ Step = $Name; Status = 'OK'; Ms = $watch.ElapsedMilliseconds; Detail = $detail })
    Write-Host ("[OK]   {0} ({1} ms) {2}" -f $Name, $watch.ElapsedMilliseconds, $detail)
    $detail
  }
  catch {
    $watch.Stop()
    $steps.Add([pscustomobject]@{ Step = $Name; Status = 'FAIL'; Ms = $watch.ElapsedMilliseconds; Detail = $_.Exception.Message })
    Write-Host ("[FAIL] {0} ({1} ms)：{2}" -f $Name, $watch.ElapsedMilliseconds, $_.Exception.Message)
    throw
  }
}

$photoFiles = Get-ChildItem -Path $FixtureDir -Filter '*.jpg' | Sort-Object Name | Select-Object -First $PhotoCount
if ($photoFiles.Count -lt $PhotoCount) { throw "fixtures 目录照片不足：$FixtureDir（需要 $PhotoCount 张）" }

$username = 'scene4_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$password = [guid]::NewGuid().ToString('N')
$token = $null
$exhibitionId = $null
$photoIds = @()
$runId = $null

Invoke-ApiStep 'register' {
  $body = @{ username = $username; password = $password } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/register" -ContentType 'application/json' -Body $body
  "user=$($result.user.username)"
} | Out-Null

Invoke-ApiStep 'login' {
  $body = @{ username = $username; password = $password } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body $body
  $script:token = $result.token
  "tokenChars=$($script:token.Length)"
} | Out-Null

$authHeaders = @{ Authorization = "Bearer $token" }

Invoke-ApiStep 'createexhibition' {
  $body = @{ title = '雾港合成演示' } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/createexhibition" -Headers $authHeaders -ContentType 'application/json' -Body $body
  $script:exhibitionId = $result.exhibitionId
  "exhibitionId=$($script:exhibitionId)"
} | Out-Null

Invoke-ApiStep "upload($PhotoCount photos)" {
  $arguments = @('-s', '-X', 'POST', "$BaseUrl/api/photos/upload", '-H', "Authorization: Bearer $token", '-F', "exhibitionId=$exhibitionId")
  foreach ($photo in $photoFiles) { $arguments += @('-F', "files=@$($photo.FullName)") }
  $raw = & curl.exe @arguments
  $result = $raw | ConvertFrom-Json
  if ($result.failures -and $result.failures.Count -gt 0) { throw "上传存在失败项：$($result.failures | ConvertTo-Json -Compress)" }
  $script:photoIds = @($result.photos | ForEach-Object { $_.id })
  "photos=$($script:photoIds.Count)"
} | Out-Null

Invoke-ApiStep 'updatecuration(分组)' {
  $photos = for ($index = 0; $index -lt $photoIds.Count; $index++) {
    @{ photoId = $photoIds[$index]; caption = "海边的第 $($index + 1) 张" }
  }
  $body = @{
    exhibitionId = $exhibitionId
    title = '雾港合成演示'
    narrative = '从海边到山里的三天，记住风和光。'
    groups = @(@{ title = '海边的黄昏'; narrative = '第一天的记忆'; photos = @($photos) })
  } | ConvertTo-Json -Depth 8 -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/updatecuration" -Headers $authHeaders -ContentType 'application/json' -Body $body
  "groups=$($result.groups.Count) curationVersion=$($result.curationVersion)"
} | Out-Null

Invoke-ApiStep 'generatescene' {
  $body = @{ exhibitionId = $exhibitionId; hint = '想要安静一点' } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/generatescene" -Headers $authHeaders -ContentType 'application/json' -Body $body
  $script:runId = $result.runId
  "runId=$($script:runId) status=$($result.status)"
} | Out-Null

Invoke-ApiStep 'poll getscenerun → awaiting_capture' {
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $statuses = [System.Collections.Generic.List[string]]::new()
  $view = $null
  while ($watch.Elapsed.TotalSeconds -lt $PollSeconds) {
    $body = @{ exhibitionId = $exhibitionId } | ConvertTo-Json -Compress
    $view = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/getscenerun" -Headers $authHeaders -ContentType 'application/json' -Body $body
    if ($statuses.Count -eq 0 -or $statuses[$statuses.Count - 1] -ne $view.status) { $statuses.Add($view.status) }
    if ($view.status -eq 'awaiting_capture') { break }
    if ($view.status -in @('failed', 'cancelled')) { throw "运行结束于异常状态：$($view.status)（$($view.errorCode) $($view.errorMessage)）" }
    Start-Sleep -Milliseconds 200
  }
  $watch.Stop()
  if ($null -eq $view -or $view.status -ne 'awaiting_capture') { throw "轮询超时，最后状态：$($view.status)" }
  if (-not $view.code) { throw 'awaiting_capture 但没有 code' }
  "statuses=$($statuses -join '→') source=$($view.source) codeChars=$($view.code.Length) briefMood=$($view.brief.mood)"
} | Out-Null

Write-Host ''
Write-Host '== 结果 =='
$steps | Format-Table -AutoSize
if ($steps | Where-Object { $_.Status -ne 'OK' }) { exit 1 }
Write-Host ("全部 {0} 步通过（AI_MODE=fake，展览 {1}，run {2}）" -f $steps.Count, $exhibitionId, $runId)
