#!/usr/bin/env pwsh
<#
.SYNOPSIS
    一键准备演示数据（运行中的 Momentarium 平台实例，AI_MODE=fake）。

.DESCRIPTION
    在已启动的后端实例上创建一套可直接演示整条产品线的数据：
      创建者与投稿者两个账号 → 展览 + 8 张 tests/fixtures/synthetic 照片 → 手动标注 6 个地点
      → AI 策展（取章节最多的提案，补章节叙事与大部分图注，保留一张无图注照片用来演示「采用 AI 建议图注」）
      → 共同投稿（邀请、加入、2 条已提交 + 1 条草稿）→ 创建者把第一条采用进最后一章
      → 对咖啡馆照片生成 AI 地点候选（只生成，留给演示确认）
      → 三维场景（fake）+ 评审通过 → 发布 v1
      → 场景自然语言修订候选（评审通过但不采用）
      → 投稿者在发布后修改已采用的回忆（工作台出现「待确认更新」）。
    结束时输出账号 / 链接并写入 JSON 结果文件。

    可重复运行：账号已存在则直接登录；创建者名下标题为「雾港来信 · 合成素材演示」的旧演示展览会先被删除（不碰其他展览）。
    加 -Cleanup 则在全部完成后删除本次创建的展览（用于演练/自测）。

    注意：
    - 需要实例 AI_MODE=fake（脚本会对生成的场景做评审回传，live 会触发真实模型调用）。
    - 评审回传的运行时证据（fps=30.0、buildMs=12、networkAttempts=0、4 张截图）是**脚本模拟**：
      评审门禁要求 4 张截图，回传是异步的（先返回、再轮询到 succeeded）；不代表真实浏览器运行时。
    - 不打印会话令牌，也不打印密码；密码由调用方通过 -Password 或 MOMENTARIUM_DEMO_PASSWORD 提供。
    - fake 模型对不同照片给出的解读文案会重复，这是 fake 模型本身的特性，脚本不改后端。

.PARAMETER BaseUrl
    后端根地址，默认 http://localhost:8080。

.PARAMETER Username
    创建者账号名，默认 demo_owner（3–32 位字母/数字/下划线）。

.PARAMETER FriendName
    投稿者账号名，默认 demo_friend。

.PARAMETER Password
    两个演示账号的密码（必填；未传时读环境变量 MOMENTARIUM_DEMO_PASSWORD；8–72 位，不写进仓库）。

.PARAMETER PhotoDir
    演示照片目录，默认 tests/fixtures/synthetic。

.PARAMETER OutFile
    结果 JSON 路径，默认系统临时目录下的 momentarium-demo-seed.json。

.PARAMETER Cleanup
    完成后删除本次创建的展览（不保留演示数据）。

.EXAMPLE
    pwsh scripts/demo/seed.ps1 -BaseUrl http://localhost:8080

.EXAMPLE
    pwsh scripts/demo/seed.ps1 -BaseUrl http://localhost:8080 -Username demo_owner2 -FriendName demo_friend2 -Cleanup
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$Username = 'demo_owner',
    [string]$FriendName = 'demo_friend',
    [string]$Password = $env:MOMENTARIUM_DEMO_PASSWORD,
    [string]$PhotoDir,
    [string]$OutFile,
    [switch]$Cleanup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$base = $BaseUrl.TrimEnd('/')
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $PhotoDir) { $PhotoDir = Join-Path $repoRoot 'tests/fixtures/synthetic' }
if (-not $OutFile) { $OutFile = Join-Path ([IO.Path]::GetTempPath()) 'momentarium-demo-seed.json' }
foreach ($name in @($Username, $FriendName)) {
    if ($name -notmatch '^[A-Za-z0-9_]{3,32}$') { throw "非法账号名：$name（3–32 位字母/数字/下划线）" }
}
if ($Username -eq $FriendName) { throw '创建者与投稿者必须是两个不同的账号' }
if (-not $Password) { throw '缺少演示密码：传 -Password 或设置环境变量 MOMENTARIUM_DEMO_PASSWORD' }
if ($Password.Length -lt 8 -or $Password.Length -gt 72) { throw '密码需 8–72 位' }

$demoTitle = '雾港来信 · 合成素材演示'
$stepCount = 0

function Api {
    param([string]$Path, $Body = @{}, [string]$Token, [int[]]$Expect = @(200))
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $json = $Body | ConvertTo-Json -Compress -Depth 10
    $response = Invoke-WebRequest -Uri "$base$Path" -Method POST -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -SkipHttpErrorCheck -TimeoutSec 60
    if ($Expect -notcontains [int]$response.StatusCode) { throw "$Path -> $($response.StatusCode): $($response.Content)" }
    $script:stepCount++
    Write-Host ('  {0,-34} {1}' -f $Path, $response.StatusCode)
    if ([string]::IsNullOrWhiteSpace($response.Content)) { return $null }
    return ($response.Content | ConvertFrom-Json -Depth 20)
}

function Upload {
    param([string]$Path, [hashtable]$Form, [string]$Token)
    $response = Invoke-WebRequest -Uri "$base$Path" -Method POST -Headers @{ Authorization = "Bearer $Token" } -Form $Form -SkipHttpErrorCheck -TimeoutSec 60
    if ([int]$response.StatusCode -ne 200) { throw "$Path -> $($response.StatusCode): $($response.Content)" }
    $script:stepCount++
    Write-Host ('  {0,-34} {1}' -f $Path, $response.StatusCode)
    return ($response.Content | ConvertFrom-Json -Depth 20)
}

function Photo([string]$name) {
    $path = Join-Path $PhotoDir $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "缺少演示照片：$path" }
    return Get-Item -LiteralPath $path
}

function JpegDataUrl([string]$path, [int]$maxEdge = 320) {
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($path)
    try {
        $scale = [math]::Min(1.0, [double]$maxEdge / [math]::Max($source.Width, $source.Height))
        $width = [int][math]::Max(1, [math]::Round($source.Width * $scale))
        $height = [int][math]::Max(1, [math]::Round($source.Height * $scale))
        $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.DrawImage($source, 0, 0, $width, $height)
        $graphics.Dispose()
        $stream = [IO.MemoryStream]::new()
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bitmap.Dispose()
        return 'data:image/jpeg;base64,' + [Convert]::ToBase64String($stream.ToArray())
    } finally { $source.Dispose() }
}

# 轮询场景运行到目标状态；-RunId 给定时按 id 查（修订候选不是「当前」运行）。
function WaitRun {
    param([string]$ExhibitionId, [string]$Token, [string]$Target = 'awaiting_capture', [string]$RunId)
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $run = if ($RunId) { Api '/api/getscenerunbyid' @{ runId = $RunId } $Token } else { Api '/api/getscenerun' @{ exhibitionId = $ExhibitionId } $Token }
        if ($run.status -eq $Target) { return $run }
        if ($run.status -in @('failed', 'cancelled')) { throw "场景运行 $($run.status)：$($run.errorMessage)" }
        Start-Sleep -Milliseconds 700
    }
    throw "等待场景运行到 $Target 超时（实例是否 AI_MODE=fake？）"
}

# 回传模拟证据：评审门禁要求 4 张截图；回传立即返回时可能还没评完，再轮询到 succeeded。
function PassReview($run, [string]$ExhibitionId, [string]$Token) {
    $captures = @('sample-01-coast.jpg', 'sample-12-mountain.jpg', 'sample-08-street.jpg', 'sample-11-indoor.jpg') |
        ForEach-Object { JpegDataUrl (Join-Path $PhotoDir $_) }
    $body = @{
        runId = $run.runId
        captures = @($captures)
        runtime = @{ buildMs = 12; fps = 30.0; errors = @(); photoIdsUsed = @($run.photoIds); networkAttempts = 0 }
    }
    $result = Api '/api/reviewscene' $body $Token
    if ($result.status -eq 'succeeded') { return $result }
    return (WaitRun $ExhibitionId $Token 'succeeded' $run.runId)
}

# 图注与章节叙事：手写的短句，保证演示页有内容；sample-10 故意留空，演示「采用 AI 建议图注」。
$captionByFile = @{
    'sample-01-coast.jpg' = '雾湾的海岸线。'
    'sample-02-coast.jpg' = '潮水退去后的礁石。'
    'sample-03-coast.jpg' = '沙脊岬的午后。'
    'sample-08-street.jpg' = '港口市场的清晨。'
    'sample-09-street.jpg' = '巷口的雨刚停。'
    'sample-11-indoor.jpg' = '窗边的一杯热咖啡。'
    'sample-12-mountain.jpg' = '云里的长风岭。'
}
$chapterNarratives = @(
    '先沿着海岸走，让风把行李里的城市味道吹淡一点。',
    '雨一直断断续续，市场里的灯比天色更早亮起来。',
    '回到室内，把一路的潮湿和山里的云，一起放进杯子里。',
    '故事没有讲完，剩下的留给下一次路过。'
)

Write-Host ''
Write-Host "Momentarium 演示数据准备 -> $base" -ForegroundColor Cyan

Write-Host '== 账号'
foreach ($name in @($Username, $FriendName)) {
    $null = Api '/api/register' @{ username = $name; password = $Password } -Expect @(200, 201, 409)
}
$owner = Api '/api/login' @{ username = $Username; password = $Password }
$friend = Api '/api/login' @{ username = $FriendName; password = $Password }
$ot = $owner.token
$ft = $friend.token
$null = Api '/api/updatemyprofile' @{ displayName = '林间拾光'; bio = '喜欢在雨天和海边拍照。'; homepagePublic = $true } $ot
$null = Api '/api/updatemyprofile' @{ displayName = '海风'; bio = '和朋友一起给虚构海港写了一封信。'; homepagePublic = $false } $ft

Write-Host "== 清理上次的同名演示展览「$demoTitle」（幂等重跑，不碰其他展览）"
$mine = Api '/api/listmyexhibitions' @{} $ot
foreach ($old in @($mine.exhibitions | Where-Object { $_.title -eq $demoTitle })) {
    $null = Api '/api/deleteexhibition' @{ exhibitionId = $old.id } $ot
}

Write-Host '== 展览与照片'
$created = Api '/api/createexhibition' @{ title = $demoTitle } $ot
$exId = $created.exhibitionId
$ownerFiles = @(
    'sample-01-coast.jpg', 'sample-02-coast.jpg', 'sample-03-coast.jpg', 'sample-08-street.jpg',
    'sample-09-street.jpg', 'sample-10-street.jpg', 'sample-11-indoor.jpg', 'sample-12-mountain.jpg'
)
$photoIdByFile = @{}
foreach ($file in $ownerFiles) {
    $uploaded = Upload '/api/photos/upload' @{ exhibitionId = $exId; files = (Photo $file) } $ot
    $photoIdByFile[$file] = $uploaded.photos[0].id
}
$fileByPhotoId = @{}
foreach ($entry in $photoIdByFile.GetEnumerator()) { $fileByPhotoId[$entry.Value] = $entry.Key }

Write-Host '== 记忆地图：手动位置（含公开范围与精确点）'
$locations = @(
    @{ file = 'sample-01-coast.jpg'; name = '雾港 · 雾湾'; lat = 44.3150; lon = -124.1580; granularity = 'exact' },
    @{ file = 'sample-02-coast.jpg'; name = '雾港 · 雾湾'; lat = 44.3150; lon = -124.1580; granularity = 'exact' },
    @{ file = 'sample-03-coast.jpg'; name = '雾港 · 沙脊岬'; lat = 44.3510; lon = -124.2020; granularity = 'area' },
    @{ file = 'sample-08-street.jpg'; name = '雾港 · 港口市场'; lat = 44.3380; lon = -124.1110; granularity = 'exact' },
    @{ file = 'sample-09-street.jpg'; name = '雾港'; lat = 44.3240; lon = -124.1050; granularity = 'area' },
    @{ file = 'sample-12-mountain.jpg'; name = '雾港 · 长风岭'; lat = 44.3200; lon = -124.0430; granularity = 'exact' }
)
foreach ($place in $locations) {
    $null = Api '/api/setphotolocation' @{ photoId = $photoIdByFile[$place.file]; name = $place.name; latitude = $place.lat; longitude = $place.lon; granularity = $place.granularity } $ot
}

Write-Host '== AI 策展：取章节最多的提案，补章节叙事与图注'
$suggested = Api '/api/suggestthemes' @{ exhibitionId = $exId; hint = $null } $ot
$proposal = @($suggested.proposals | Sort-Object { @($_.groups).Count } -Descending)[0]
$chapters = @($proposal.groups)
$groups = @(for ($index = 0; $index -lt $chapters.Count; $index++) {
    $chapter = $chapters[$index]
    @{
        title = $chapter.title
        narrative = if ($index -lt $chapterNarratives.Count) { $chapterNarratives[$index] } else { '' }
        photos = @($chapter.photoIds | ForEach-Object {
            $file = $fileByPhotoId[$_]
            @{ photoId = $_; caption = if ($file -and $captionByFile.ContainsKey($file)) { $captionByFile[$file] } else { '' } }
        })
    }
})
# 标题保持「雾港来信 · 合成素材演示」，让重跑时能按标题找到并清理旧展览。
$null = Api '/api/updatecuration' @{ exhibitionId = $exId; title = $demoTitle; narrative = $proposal.concept; groups = $groups } $ot
$lastGroupId = (Api '/api/getexhibition' @{ exhibitionId = $exId } $ot).groups[-1].id

Write-Host '== 共同投稿：邀请、加入、两条已提交 + 一条草稿'
$invite = Api '/api/createcontributioninvite' @{ exhibitionId = $exId } $ot
$null = Api '/api/joincontribution' @{ token = $invite.token } $ft
function NewContribution([string]$text, $caption, $location, [string]$file, [bool]$submit) {
    $contribution = Api '/api/createcontribution' @{ exhibitionId = $exId; memoryText = $text; suggestedCaption = $caption; location = $location } $ft
    $null = Upload '/api/contributions/upload' @{ exhibitionId = $exId; contributionId = $contribution.id; files = (Photo $file) } $ft
    if ($submit) {
        return (Api '/api/updatecontribution' @{ contributionId = $contribution.id; memoryText = $text; suggestedCaption = $caption; location = $location; submit = $true; removePhoto = $false } $ft)
    }
    return $contribution
}
$c1 = NewContribution '那天我们在海边等雨停，风把外套吹得鼓鼓的，谁也没说话，只听着潮声一层层推上来。' '雨停之前，我们都在听潮。' @{ name = '雾港 · 日出岬'; latitude = 44.3620; longitude = -124.1780 } 'sample-04-coast.jpg' $true
$c2 = NewContribution '回程路上绕去了西边的海岸，云缝里漏下一束光，大家都停下来拍照。' '云缝里的光。' @{ name = '雾港 · 西岸'; latitude = 44.3020; longitude = -124.1830 } 'sample-06-coast.jpg' $true
$c3 = NewContribution '还在整理这张的故事，先存个草稿。' $null $null 'sample-07-coast.jpg' $false

Write-Host '== 创建者把第一条投稿采用进最后一章（图注缺省继承建议图注）'
$friendList = Api '/api/listcontributions' @{ exhibitionId = $exId } $ft
$c1Version = @($friendList.contributions | Where-Object { $_.id -eq $c1.id })[0].version
$adopted = Api '/api/adoptcontribution' @{ contributionId = $c1.id; expectedVersion = $c1Version; caption = $null; location = $null; groupId = $lastGroupId } $ot

Write-Host '== AI 地点候选：对咖啡馆照片只生成候选，留给演示时确认'
$candidates = Api '/api/suggestphotolocation' @{ photoId = $photoIdByFile['sample-11-indoor.jpg'] } $ot

Write-Host '== 三维场景（fake）+ 评审通过'
$null = Api '/api/generatescene' @{ exhibitionId = $exId; hint = $null } $ot
$baseRun = WaitRun $exId $ot
$null = PassReview $baseRun $exId $ot

Write-Host '== 发布 v1'
$published = Api '/api/publish' @{ exhibitionId = $exId } $ot

Write-Host '== 场景自然语言修订：生成候选并评审通过，但不自动采用'
$revision = Api '/api/revisescene' @{ parentRunId = $baseRun.runId; instruction = '保留整体构图，把灯塔缩小一些，光线改成黄昏。' } $ot
$reviseRun = WaitRun $exId $ot 'awaiting_capture' $revision.runId
$null = PassReview $reviseRun $exId $ot

Write-Host '== 投稿者在发布后修改已采用的回忆 -> 工作台出现「待确认更新」'
$null = Api '/api/updatecontribution' @{
    contributionId = $c1.id
    memoryText = '那天我们在海边等雨停，风把外套吹得鼓鼓的。后来雨真的停了，彩虹挂在日出岬上，大家都笑了。'
    suggestedCaption = '雨停之前，我们都在听潮；雨停之后，彩虹来了。'
    location = @{ name = '雾港 · 日出岬'; latitude = 44.3620; longitude = -124.1780 }
    submit = $true
    removePhoto = $false
} $ft

$result = [ordered]@{
    base = $base
    owner = $Username
    friend = $FriendName
    exhibitionId = $exId
    publicUrl = "$base/show/$exId"
    workspaceUrl = "$base/exhibitions/$exId"
    inviteUrl = "$base/invite/$($invite.token)"
    authorPage = "$base/u/$Username"
    publishedVersion = $published.version
    baseRunId = $baseRun.runId
    reviseCandidateRunId = $revision.runId
    chapters = $chapters.Count
    contributions = [ordered]@{ adopted = $c1.id; submitted = $c2.id; draft = $c3.id }
    aiLocationCandidates = @($candidates.candidates).Count
    apiCalls = $stepCount
    runtimeEvidenceNote = '脚本模拟的沙箱证据（fps=30.0/buildMs=12/networkAttempts=0/4 张 320px 截图），非真实浏览器运行时'
    createdAt = (Get-Date).ToString('o')
}

if ($Cleanup) {
    $null = Api '/api/deleteexhibition' @{ exhibitionId = $exId } $ot
    $result.cleanedUp = $true
    Write-Host '已按 -Cleanup 删除本次演示展览。' -ForegroundColor Yellow
} else {
    $result.cleanedUp = $false
}

$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutFile -Encoding utf8
Write-Host ''
Write-Host '================ 演示数据已就绪 ================' -ForegroundColor Green
Write-Host ("创建者 / 投稿者 : {0} / {1}" -f $Username, $FriendName)
Write-Host ("展览 ID         : {0}（{1} 章）" -f $exId, $chapters.Count)
Write-Host ("公开链接        : {0}/show/{1}" -f $base, $exId)
Write-Host ("工作台          : {0}/exhibitions/{1}（投稿页签有待处理回忆）" -f $base, $exId)
Write-Host ("结果文件        : {0}" -f $OutFile)
Write-Host '================================================' -ForegroundColor Green
