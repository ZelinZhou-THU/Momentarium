# curation 三条 API 的端到端冒烟（D3 task-25 证据脚本）。
# 前置：后端实例已启动，且 AI_MODE=fake（或真实网关但会产生费用）、数据库含 users/gallery/curation schema。
# 用法：pwsh tests/e2e/curation-e2e.ps1 -BaseUrl http://localhost:8081 -FixtureDir tests/fixtures/synthetic
# 输出：每步状态/耗时/关键 JSON 摘要；任何一步失败即抛错退出。
param(
  [string]$BaseUrl = 'http://localhost:8081',
  [string]$FixtureDir = (Join-Path $PSScriptRoot '..\fixtures\synthetic'),
  [int]$PhotoCount = 3
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

$photoCandidates = Get-ChildItem -Path $FixtureDir -Filter '*.jpg' | Sort-Object Name | Select-Object -First $PhotoCount
if ($photoCandidates.Count -lt $PhotoCount) { throw "fixtures 目录照片不足：$FixtureDir（需要 $PhotoCount 张）" }

$username = 'curd3_' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$password = [guid]::NewGuid().ToString('N')
$token = $null
$exhibitionId = $null

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
  foreach ($photo in $photoCandidates) {
    $arguments += @('-F', "files=@$($photo.FullName)")
  }
  $raw = & curl.exe @arguments
  $result = $raw | ConvertFrom-Json
  if ($result.failures -and $result.failures.Count -gt 0) { throw "上传存在失败项：$($result.failures | ConvertTo-Json -Compress)" }
  "photos=$($result.photos.Count)"
} | Out-Null

Invoke-ApiStep 'suggestthemes' {
  $body = @{ exhibitionId = $exhibitionId; hint = '想要安静一点' } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/suggestthemes" -Headers $authHeaders -ContentType 'application/json' -Body $body
  $proposals = $result.proposals
  $covered = ($proposals | ForEach-Object { $_.groups } | ForEach-Object { $_.photoIds } | Sort-Object -Unique).Count
  "proposals=$($proposals.Count) names=$($proposals | ForEach-Object { $_.name } | Join-String -Separator '/') coveredPhotoIds=$covered"
} | Out-Null

Invoke-ApiStep 'refinecuration' {
  $body = @{ exhibitionId = $exhibitionId; instruction = '把海边那几张放前面，图注改短一点' } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/refinecuration" -Headers $authHeaders -ContentType 'application/json' -Body $body
  "reply=$($result.reply) groups=$($result.proposal.groups.Count)"
} | Out-Null

Invoke-ApiStep 'getchathistory' {
  $body = @{ exhibitionId = $exhibitionId } | ConvertTo-Json -Compress
  $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/getchathistory" -Headers $authHeaders -ContentType 'application/json' -Body $body
  "messages=$($result.messages.Count) roles=$($result.messages | ForEach-Object { $_.role } | Join-String -Separator ',')"
} | Out-Null

Write-Host ''
Write-Host '== 结果 =='
$steps | Format-Table -AutoSize
if ($steps | Where-Object { $_.Status -ne 'OK' }) { exit 1 }
Write-Host ("全部 {0} 步通过（AI_MODE=fake，展览 {1}）" -f $steps.Count, $exhibitionId)
