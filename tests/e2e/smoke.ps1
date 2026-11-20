<#
.SYNOPSIS
    Momentarium 平台后端端到端冒烟测试。

.DESCRIPTION
    在已启动的后端上验证 users + gallery 主路径与契约形状（可选 curation）：
      health -> register -> login -> getcurrentuser(200)
             -> createexhibition -> upload 照片 -> list -> get -> update meta -> setcover
             -> deletephoto -> deleteexhibition -> 已删 404
             -> 无 token getcurrentuser(401) -> logout -> 已登出 token getcurrentuser(401)

    加 -IncludeCuration 时上传 3 张照片并追加 D3 curation 流程：
      updatecuration 分 2 章 -> suggestthemes(fake AI, 2–3 提案且覆盖全部照片) ->
      refinecuration(提案) -> getchathistory(消息)，最后清理展览。

    每一步输出 HTTP 状态码与耗时，并检查响应对象的字段形状（camelCase、UUID、ISO-8601 UTC、
    Option 字段不省略、错误结构 error.code）。任一步失败时非零退出，便于 Gate / CI 使用。

    冒烟会注册一个带时间戳的临时账号（qa_smoke_<timestamp>_<rand>），不会打印任何令牌或密码。

.PARAMETER BaseUrl
    后端根地址，默认 http://localhost:8080。

.PARAMETER TimeoutSeconds
    单次请求超时，默认 15 秒。

.PARAMETER PhotoPath
    上传步骤使用的本地照片；默认 tests/fixtures/synthetic/sample-01-coast.jpg。
    加 -IncludeCuration 且未指定时，默认上传 sample-01/02/03 三张；指定时同一张重复上传 3 次。

.PARAMETER UsernamePrefix
    临时账号前缀，默认 qa_smoke，格式 ^[A-Za-z0-9_]{3,12}$。多人共用同一实例时用独立前缀
    （如 qa_d5_w5）避免用户名冲突，且不要清理他人数据。

.PARAMETER IncludeCuration
    追加 D3 curation 流程（updatecuration / suggestthemes / refinecuration / getchathistory）。
    需要后端 AI_MODE=fake（或可用的 fake 端口），并要求上传 3 张照片；默认关闭以保持 D2 冒烟行为。

.PARAMETER IncludeScene
    追加 D4 scene 流程（updatecuration 分章 → generatescene → 轮询 getscenerun 到 awaiting_capture，
    断言 code 非空且 brief 齐全）。需要 AI_MODE=fake 与 scene 路由；默认关闭。可与 -IncludeCuration 组合。

.PARAMETER IncludeReview
    追加 D5 评审/取消流程：reviewscene 合法回传（纯场景下 photoIdsUsed=[] 合法）→succeeded(source=ai, review 五维+pass)
    →重复回传 409；硬门禁失败回传（errors/network/fps/非法截图）→attempts+1 回 generating 并重新生成到
    awaiting_capture（不得 succeeded）；cancelscene 非终态→cancelled→终态再取消 409。需要 AI_MODE=fake；
    默认关闭，可与其它开关组合。

.PARAMETER IncludePublish
    追加 D6 发布主路径：scene succeeded 后 publish（v1）→ 匿名 getpublishedexhibition 200 且内容冻结 → 改草稿
    → 公开读不变且旧场景 sceneStale → publish 400 VALIDATION(SCENE_STALE) → 重新生成并评审 pass → publish（v2）
    → 公开读更新 → 未发布展览匿名读 404。需要 AI_MODE=fake；默认关闭；会自动补齐 generate→review 前置。

.EXAMPLE
    pwsh tests/e2e/smoke.ps1 -BaseUrl http://localhost:8080

.EXAMPLE
    pwsh tests/e2e/smoke.ps1 -BaseUrl http://localhost:8080 -IncludeCuration

.EXAMPLE
    pwsh tests/e2e/smoke.ps1 -BaseUrl http://localhost:8080 -IncludeScene

.EXAMPLE
    pwsh tests/e2e/smoke.ps1 -BaseUrl http://localhost:8080 -IncludeReview

.EXAMPLE
    pwsh tests/e2e/smoke.ps1 -BaseUrl http://localhost:8080 -IncludePublish
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [int]$TimeoutSeconds = 15,
    [string]$PhotoPath,
    [string]$UsernamePrefix = 'qa_smoke',
    [switch]$IncludeCuration,
    [switch]$IncludeScene,
    [switch]$IncludeReview,
    [switch]$IncludePublish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$base = $BaseUrl.TrimEnd('/')
$uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$isoUtcPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
$results = [System.Collections.Generic.List[object]]::new()

# ---------- 响应形状校验（返回 '' 表示通过，否则返回可读问题描述） ----------

function New-JsonDocument {
    param([string]$JsonText)
    if ([string]::IsNullOrWhiteSpace($JsonText)) { return $null }
    try {
        return [System.Text.Json.JsonDocument]::Parse($JsonText)
    } catch {
        return $null
    }
}

function Get-JsonPropertyNames {
    param([System.Text.Json.JsonElement]$Element)
    return @($Element.EnumerateObject() | ForEach-Object { $_.Name })
}

function Test-JsonKeySet {
    param([string[]]$ActualKeys, [string]$ExpectedCsv)
    $expectedKeys = $ExpectedCsv.Split(',')
    return (($ActualKeys | Sort-Object -CaseSensitive) -join ',') -ceq (($expectedKeys | Sort-Object -CaseSensitive) -join ',')
}

function Test-UserView {
    param([System.Text.Json.JsonElement]$Element)
    $keys = @(Get-JsonPropertyNames $Element)
    if (($keys -join ',') -ne 'id,username,createdAt') {
        return "UserView 字段=[$($keys -join ',')]，期望 [id,username,createdAt]"
    }
    if ($Element.GetProperty('id').ValueKind -ne 'String') { return 'UserView.id 不是字符串' }
    if ($Element.GetProperty('id').GetString() -notmatch $uuidPattern) { return 'UserView.id 不是 UUID 字符串' }
    if ($Element.GetProperty('username').ValueKind -ne 'String') { return 'UserView.username 不是字符串' }
    if ([string]::IsNullOrWhiteSpace($Element.GetProperty('username').GetString())) { return 'UserView.username 为空' }
    if ($Element.GetProperty('createdAt').ValueKind -ne 'String') { return 'UserView.createdAt 不是字符串' }
    if ($Element.GetProperty('createdAt').GetString() -notmatch $isoUtcPattern) {
        return "UserView.createdAt 不是 ISO-8601 UTC：$($Element.GetProperty('createdAt').GetString())"
    }
    return ''
}

function Test-AuthResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'AuthResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        if ($root.ValueKind -ne 'Object') { return 'AuthResponse 不是 JSON 对象' }
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'token,user') {
            return "AuthResponse 字段=[$($keys -join ',')]，期望 [token,user]"
        }
        if ($root.GetProperty('token').ValueKind -ne 'String') { return 'AuthResponse.token 不是字符串' }
        if ([string]::IsNullOrWhiteSpace($root.GetProperty('token').GetString())) { return 'AuthResponse.token 为空' }
        return (Test-UserView $root.GetProperty('user'))
    } finally {
        $doc.Dispose()
    }
}

function Test-UserViewResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'UserView 响应体缺失或不是合法 JSON' }
    try {
        if ($doc.RootElement.ValueKind -ne 'Object') { return 'UserView 不是 JSON 对象' }
        return (Test-UserView $doc.RootElement)
    } finally {
        $doc.Dispose()
    }
}

function Test-EmptyResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'EmptyResponse 响应体缺失或不是合法 JSON' }
    try {
        if ($doc.RootElement.ValueKind -ne 'Object') { return 'EmptyResponse 不是 JSON 对象' }
        $keys = @(Get-JsonPropertyNames $doc.RootElement)
        if ($keys.Count -ne 0) { return "EmptyResponse 应为 {}，实际字段=[$($keys -join ',')]" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-HealthResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'health 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'status') { return "health 字段=[$($keys -join ',')]，期望 [status]" }
        if ($root.GetProperty('status').GetString() -ne 'ok') { return "health.status=$($root.GetProperty('status').GetString())，期望 ok" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-ErrorResponse {
    param([string]$JsonText, [string]$ExpectedCode)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return '错误响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        if ($root.ValueKind -ne 'Object') { return '错误响应不是 JSON 对象' }
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'error') { return "错误响应字段=[$($keys -join ',')]，期望 [error]" }
        $errorElement = $root.GetProperty('error')
        $errorKeys = @(Get-JsonPropertyNames $errorElement)
        if ($errorKeys -notcontains 'code') { return '错误响应缺少 error.code' }
        if ($errorElement.GetProperty('code').GetString() -ne $ExpectedCode) {
            return "error.code=$($errorElement.GetProperty('code').GetString())，期望 $ExpectedCode"
        }
        if ($errorKeys -notcontains 'message' -or $errorElement.GetProperty('message').ValueKind -ne 'String') {
            return '错误响应缺少字符串 error.message'
        }
        if ($errorKeys -contains 'details') {
            $detailsKind = $errorElement.GetProperty('details').ValueKind
            if ($detailsKind -ne 'Object' -and $detailsKind -ne 'Null') { return 'error.details 必须是对象或 null' }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# ---------- gallery 响应形状校验 ----------

function Test-CreateExhibitionResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'CreateExhibitionResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'exhibitionId') { return "CreateExhibitionResponse 字段=[$($keys -join ',')]，期望 [exhibitionId]" }
        if ($root.GetProperty('exhibitionId').ValueKind -ne 'String') { return 'exhibitionId 不是字符串' }
        if ($root.GetProperty('exhibitionId').GetString() -notmatch $uuidPattern) { return 'exhibitionId 不是 UUID 字符串' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-MyExhibitionsResponse {
    param([string]$JsonText, [string]$ExpectedExhibitionId, [int]$ExpectedPhotoCount = -1)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'MyExhibitionsResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'exhibitions') { return "MyExhibitionsResponse 字段=[$($keys -join ',')]，期望 [exhibitions]" }
        $items = $root.GetProperty('exhibitions')
        if ($items.ValueKind -ne 'Array') { return 'exhibitions 不是数组' }
        $ids = @()
        for ($index = 0; $index -lt $items.GetArrayLength(); $index++) {
            $summary = $items[$index]
            $summaryKeys = @(Get-JsonPropertyNames $summary)
            $expectedKeys = 'id,title,photoCount,updatedAt,cover,sceneStale,publication,hasUnpublishedChanges,pendingContributionCount,scenePalette'
            if (-not (Test-JsonKeySet $summaryKeys $expectedKeys)) {
                return "exhibitions[$index] 字段=[$($summaryKeys -join ',')]，期望 [$expectedKeys]"
            }
            if ($summary.GetProperty('updatedAt').GetString() -notmatch $isoUtcPattern) { return "exhibitions[$index].updatedAt 不是 ISO-8601 UTC" }
            if ($summary.GetProperty('id').GetString() -notmatch $uuidPattern) { return "exhibitions[$index].id 不是 UUID 字符串" }
            $ids += $summary.GetProperty('id').GetString()
            $cover = $summary.GetProperty('cover')
            $coverKeys = @(Get-JsonPropertyNames $cover)
            if (($coverKeys -join ',') -ne 'kind,imageUrl,width,height') {
                return "exhibitions[$index].cover 字段=[$($coverKeys -join ',')]"
            }
            if (@('auto', 'photo', 'render') -notcontains $cover.GetProperty('kind').GetString()) {
                return "exhibitions[$index].cover.kind 不是封面枚举值"
            }
        }
        if ($ids -notcontains $ExpectedExhibitionId) { return "列表中没有刚创建的展览 $ExpectedExhibitionId" }
        if ($ExpectedPhotoCount -ge 0) {
            for ($index = 0; $index -lt $items.GetArrayLength(); $index++) {
                $summary = $items[$index]
                if ($summary.GetProperty('id').GetString() -eq $ExpectedExhibitionId) {
                    $photoCount = $summary.GetProperty('photoCount').GetInt32()
                    if ($photoCount -ne $ExpectedPhotoCount) { return "刚创建的展览 photoCount=$photoCount，期望 $ExpectedPhotoCount" }
                }
            }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-CoverViewResponse {
    param([string]$JsonText, [string]$ExpectedKind)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'CoverView 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'kind,imageUrl,width,height') { return "CoverView 字段=[$($keys -join ',')]，期望 [kind,imageUrl,width,height]" }
        if ($root.GetProperty('kind').GetString() -ne $ExpectedKind) { return "CoverView.kind=$($root.GetProperty('kind').GetString())，期望 $ExpectedKind" }
        if ($root.GetProperty('imageUrl').GetString() -notlike '/api/*') { return 'CoverView.imageUrl 不是相对路径' }
        if ($root.GetProperty('width').GetInt32() -le 0) { return 'CoverView.width 应为正数' }
        if ($root.GetProperty('height').GetInt32() -le 0) { return 'CoverView.height 应为正数' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-ExhibitionDetailResponse {
    param(
        [string]$JsonText,
        [string]$ExpectedExhibitionId,
        [string[]]$ExpectedPhotoIds,
        [int]$ExpectedUngroupedCount = -1,
        [int]$ExpectedGroupCount = -1
    )
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'ExhibitionDetail 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $expectedKeys = 'id,title,narrative,updatedAt,groups,ungroupedPhotos,locations,sceneRun,sceneStale,cover,publication,hasUnpublishedChanges,pendingContributionCount,scenePalette,currentSceneRun'
        $keys = @(Get-JsonPropertyNames $root)
        if (-not (Test-JsonKeySet $keys $expectedKeys)) { return "ExhibitionDetail 字段=[$($keys -join ',')]，期望 [$expectedKeys]" }
        if ($root.GetProperty('id').GetString() -ne $ExpectedExhibitionId) { return 'ExhibitionDetail.id 与请求的展览不一致' }
        if ($root.GetProperty('updatedAt').GetString() -notmatch $isoUtcPattern) { return 'ExhibitionDetail.updatedAt 不是 ISO-8601 UTC' }
        $sceneRunKind = $root.GetProperty('sceneRun').ValueKind
        if ($sceneRunKind -ne 'Null' -and $sceneRunKind -ne 'Object') { return 'ExhibitionDetail.sceneRun 必须是对象或 null' }
        $photoIds = @()
        $groupItems = $root.GetProperty('groups')
        if ($groupItems.ValueKind -ne 'Array') { return 'ExhibitionDetail.groups 不是数组' }
        for ($groupIndex = 0; $groupIndex -lt $groupItems.GetArrayLength(); $groupIndex++) {
            $group = $groupItems[$groupIndex]
            $groupKeys = @(Get-JsonPropertyNames $group)
            if (($groupKeys -join ',') -ne 'id,title,narrative,position,photos') { return "groups[$groupIndex] 字段不符" }
            $photos = $group.GetProperty('photos')
            for ($photoIndex = 0; $photoIndex -lt $photos.GetArrayLength(); $photoIndex++) {
                $photo = $photos[$photoIndex]
                $photoKeys = @(Get-JsonPropertyNames $photo)
                $expectedPhotoKeys = 'id,originalName,mime,width,height,caption,groupId,positionInGroup,contentUrl,thumbUrl,memories'
                if (-not (Test-JsonKeySet $photoKeys $expectedPhotoKeys)) { return "groups[$groupIndex].photos[$photoIndex] 字段不符" }
                $photoIds += $photo.GetProperty('id').GetString()
            }
        }
        $ungrouped = $root.GetProperty('ungroupedPhotos')
        if ($ungrouped.ValueKind -ne 'Array') { return 'ExhibitionDetail.ungroupedPhotos 不是数组' }
        for ($index = 0; $index -lt $ungrouped.GetArrayLength(); $index++) {
            $photo = $ungrouped[$index]
            $photoKeys = @(Get-JsonPropertyNames $photo)
            $expectedPhotoKeys = 'id,originalName,mime,width,height,caption,groupId,positionInGroup,contentUrl,thumbUrl,memories'
            if (-not (Test-JsonKeySet $photoKeys $expectedPhotoKeys)) { return "ungroupedPhotos[$index] 字段不符" }
            if ($photo.GetProperty('groupId').ValueKind -ne 'Null') { return "ungroupedPhotos[$index].groupId 必须是 null" }
            if ($photo.GetProperty('positionInGroup').ValueKind -ne 'Null') { return "ungroupedPhotos[$index].positionInGroup 必须是 null" }
            $photoIds += $photo.GetProperty('id').GetString()
        }
        if ($ExpectedGroupCount -ge 0 -and $groupItems.GetArrayLength() -ne $ExpectedGroupCount) {
            return "groups 数量=$($groupItems.GetArrayLength())，期望 $ExpectedGroupCount"
        }
        if ($ExpectedUngroupedCount -ge 0 -and $ungrouped.GetArrayLength() -ne $ExpectedUngroupedCount) {
            return "ungroupedPhotos 数量=$($ungrouped.GetArrayLength())，期望 $ExpectedUngroupedCount"
        }
        $duplicates = @($photoIds | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
        if ($duplicates.Count -gt 0) { return "详情中照片重复出现：$($duplicates -join ', ')" }
        $missing = @($ExpectedPhotoIds | Where-Object { $photoIds -notcontains $_ })
        if ($missing.Count -gt 0) { return "详情中缺少照片：$($missing -join ', ')" }
        $unexpected = @($photoIds | Where-Object { $ExpectedPhotoIds -notcontains $_ })
        if ($unexpected.Count -gt 0) { return "详情中出现未上传照片：$($unexpected -join ', ')" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-UploadResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'UploadPhotosResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'photos,failures') { return "UploadPhotosResponse 字段=[$($keys -join ',')]，期望 [photos,failures]" }
        $photos = $root.GetProperty('photos')
        if ($photos.ValueKind -ne 'Array' -or $photos.GetArrayLength() -lt 1) { return 'photos 应为非空数组' }
        $failures = $root.GetProperty('failures')
        if ($failures.ValueKind -ne 'Array') { return 'failures 不是数组' }
        if ($failures.GetArrayLength() -ne 0) { return '合法 JPEG 上传不应产生 failures' }
        $photo = $photos[0]
        $photoKeys = @(Get-JsonPropertyNames $photo)
        $expectedPhotoKeys = 'id,originalName,mime,width,height,caption,groupId,positionInGroup,contentUrl,thumbUrl,memories'
        if (-not (Test-JsonKeySet $photoKeys $expectedPhotoKeys)) { return "photos[0] 字段=[$($photoKeys -join ',')]" }
        if ($photo.GetProperty('id').GetString() -notmatch $uuidPattern) { return 'photos[0].id 不是 UUID 字符串' }
        if ($photo.GetProperty('mime').GetString() -ne 'image/jpeg') { return "photos[0].mime=$($photo.GetProperty('mime').GetString())，期望 image/jpeg" }
        if ($photo.GetProperty('groupId').ValueKind -ne 'Null') { return 'photos[0].groupId 必须是 null（未分组）' }
        if ($photo.GetProperty('positionInGroup').ValueKind -ne 'Null') { return 'photos[0].positionInGroup 必须是 null（未分组）' }
        if ($photo.GetProperty('contentUrl').GetString() -notlike '/api/photos/*') { return 'photos[0].contentUrl 不是相对路径' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# ---------- curation 响应形状校验（-IncludeCuration） ----------

function Test-ThemeSuggestionsResponse {
    param([string]$JsonText, [string[]]$ExpectedPhotoIds)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'ThemeSuggestionsResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'proposals') { return "ThemeSuggestionsResponse 字段=[$($keys -join ',')]，期望 [proposals]" }
        $proposals = $root.GetProperty('proposals')
        if ($proposals.ValueKind -ne 'Array') { return 'proposals 不是数组' }
        $proposalCount = $proposals.GetArrayLength()
        if ($proposalCount -lt 2 -or $proposalCount -gt 3) { return "proposals 数量=$proposalCount，期望 2–3" }
        for ($proposalIndex = 0; $proposalIndex -lt $proposalCount; $proposalIndex++) {
            $proposal = $proposals[$proposalIndex]
            $proposalKeys = @(Get-JsonPropertyNames $proposal)
            if (($proposalKeys -join ',') -ne 'name,concept,groups') { return "proposals[$proposalIndex] 字段=[$($proposalKeys -join ',')]" }
            if ([string]::IsNullOrWhiteSpace($proposal.GetProperty('name').GetString())) { return "proposals[$proposalIndex].name 为空" }
            if ([string]::IsNullOrWhiteSpace($proposal.GetProperty('concept').GetString())) { return "proposals[$proposalIndex].concept 为空" }
            $groups = $proposal.GetProperty('groups')
            if ($groups.ValueKind -ne 'Array' -or $groups.GetArrayLength() -lt 1) { return "proposals[$proposalIndex].groups 应为非空数组" }
            $proposalPhotoIds = @()
            for ($groupIndex = 0; $groupIndex -lt $groups.GetArrayLength(); $groupIndex++) {
                $group = $groups[$groupIndex]
                $groupKeys = @(Get-JsonPropertyNames $group)
                if (($groupKeys -join ',') -ne 'title,photoIds') { return "proposals[$proposalIndex].groups[$groupIndex] 字段=[$($groupKeys -join ',')]" }
                if ([string]::IsNullOrWhiteSpace($group.GetProperty('title').GetString())) { return "proposals[$proposalIndex].groups[$groupIndex].title 为空" }
                $ids = $group.GetProperty('photoIds')
                if ($ids.ValueKind -ne 'Array' -or $ids.GetArrayLength() -lt 1) { return "proposals[$proposalIndex].groups[$groupIndex].photoIds 应为非空数组" }
                for ($idIndex = 0; $idIndex -lt $ids.GetArrayLength(); $idIndex++) {
                    $photoId = $ids[$idIndex].GetString()
                    if ($photoId -notmatch $uuidPattern) { return "proposals[$proposalIndex].groups[$groupIndex].photoIds[$idIndex] 不是 UUID" }
                    $proposalPhotoIds += $photoId
                }
            }
            $duplicates = @($proposalPhotoIds | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
            if ($duplicates.Count -gt 0) { return "proposals[$proposalIndex] 照片重复：$($duplicates -join ', ')" }
            $missing = @($ExpectedPhotoIds | Where-Object { $proposalPhotoIds -notcontains $_ })
            if ($missing.Count -gt 0) { return "proposals[$proposalIndex] 未覆盖全部照片：$($missing -join ', ')" }
            $unexpected = @($proposalPhotoIds | Where-Object { $ExpectedPhotoIds -notcontains $_ })
            if ($unexpected.Count -gt 0) { return "proposals[$proposalIndex] 出现未知照片：$($unexpected -join ', ')" }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-RefineCurationResponse {
    param([string]$JsonText, [string[]]$ExpectedPhotoIds)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'RefineCurationResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'reply,proposal') { return "RefineCurationResponse 字段=[$($keys -join ',')]，期望 [reply,proposal]" }
        if ([string]::IsNullOrWhiteSpace($root.GetProperty('reply').GetString())) { return 'RefineCurationResponse.reply 为空' }
        $proposal = $root.GetProperty('proposal')
        $proposalKeys = @(Get-JsonPropertyNames $proposal)
        if (($proposalKeys -join ',') -ne 'title,narrative,groups') { return "proposal 字段=[$($proposalKeys -join ',')]" }
        $groups = $proposal.GetProperty('groups')
        if ($groups.ValueKind -ne 'Array' -or $groups.GetArrayLength() -lt 1) { return 'proposal.groups 应为非空数组' }
        $proposalPhotoIds = @()
        for ($groupIndex = 0; $groupIndex -lt $groups.GetArrayLength(); $groupIndex++) {
            $group = $groups[$groupIndex]
            $groupKeys = @(Get-JsonPropertyNames $group)
            if (($groupKeys -join ',') -ne 'title,narrative,photos') { return "proposal.groups[$groupIndex] 字段=[$($groupKeys -join ',')]" }
            $photos = $group.GetProperty('photos')
            if ($photos.ValueKind -ne 'Array') { return "proposal.groups[$groupIndex].photos 不是数组" }
            for ($photoIndex = 0; $photoIndex -lt $photos.GetArrayLength(); $photoIndex++) {
                $photo = $photos[$photoIndex]
                $photoKeys = @(Get-JsonPropertyNames $photo)
                if (($photoKeys -join ',') -ne 'photoId,caption') { return "proposal.groups[$groupIndex].photos[$photoIndex] 字段=[$($photoKeys -join ',')]" }
                if ($photo.GetProperty('photoId').GetString() -notmatch $uuidPattern) { return "proposal.groups[$groupIndex].photos[$photoIndex].photoId 不是 UUID" }
                $proposalPhotoIds += $photo.GetProperty('photoId').GetString()
            }
        }
        $duplicates = @($proposalPhotoIds | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
        if ($duplicates.Count -gt 0) { return "proposal 照片重复：$($duplicates -join ', ')" }
        $missing = @($ExpectedPhotoIds | Where-Object { $proposalPhotoIds -notcontains $_ })
        if ($missing.Count -gt 0) { return "proposal 未覆盖全部照片：$($missing -join ', ')" }
        $unexpected = @($proposalPhotoIds | Where-Object { $ExpectedPhotoIds -notcontains $_ })
        if ($unexpected.Count -gt 0) { return "proposal 出现未知照片：$($unexpected -join ', ')" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-ChatHistoryResponse {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'ChatHistoryResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'messages') { return "ChatHistoryResponse 字段=[$($keys -join ',')]，期望 [messages]" }
        $messages = $root.GetProperty('messages')
        if ($messages.ValueKind -ne 'Array' -or $messages.GetArrayLength() -lt 1) { return 'messages 应为非空数组' }
        for ($index = 0; $index -lt $messages.GetArrayLength(); $index++) {
            $message = $messages[$index]
            $messageKeys = @(Get-JsonPropertyNames $message)
            if (($messageKeys -join ',') -ne 'role,content,createdAt') { return "messages[$index] 字段=[$($messageKeys -join ',')]" }
            if (@('user', 'assistant') -notcontains $message.GetProperty('role').GetString()) { return "messages[$index].role 不是 user/assistant" }
            if ([string]::IsNullOrWhiteSpace($message.GetProperty('content').GetString())) { return "messages[$index].content 为空" }
            if ($message.GetProperty('createdAt').GetString() -notmatch $isoUtcPattern) { return "messages[$index].createdAt 不是 ISO-8601 UTC" }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# ---------- scene 响应形状校验（-IncludeScene，D4 范围：generatescene/getscenerun） ----------

function Test-SceneRunView {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'SceneRunView 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $expectedKeys = 'runId,exhibitionId,status,source,attempts,hint,photoIds,curationVersion,brief,code,review,errorCode,errorMessage,createdAt,updatedAt,kind,isCurrent,revisionInstruction,parentRunId,dismissed'
        $keys = @(Get-JsonPropertyNames $root)
        if (-not (Test-JsonKeySet $keys $expectedKeys)) { return "SceneRunView 字段=[$($keys -join ',')]，期望 [$expectedKeys]" }
        if ($root.GetProperty('runId').GetString() -notmatch $uuidPattern) { return 'SceneRunView.runId 不是 UUID' }
        if ($root.GetProperty('exhibitionId').GetString() -notmatch $uuidPattern) { return 'SceneRunView.exhibitionId 不是 UUID' }
        if (@('queued', 'generating', 'awaiting_capture', 'reviewing', 'succeeded', 'failed', 'cancelled') -notcontains $root.GetProperty('status').GetString()) { return 'SceneRunView.status 不是场景状态枚举值' }
        $sourceKind = $root.GetProperty('source').ValueKind
        if ($sourceKind -ne 'Null' -and (@('ai', 'fallback') -notcontains $root.GetProperty('source').GetString())) { return 'SceneRunView.source 不是 ai/fallback' }
        if ($root.GetProperty('attempts').ValueKind -ne 'Number') { return 'SceneRunView.attempts 不是数字' }
        if ($root.GetProperty('curationVersion').ValueKind -ne 'Number') { return 'SceneRunView.curationVersion 不是数字' }
        if ($root.GetProperty('createdAt').GetString() -notmatch $isoUtcPattern) { return 'SceneRunView.createdAt 不是 ISO-8601 UTC' }
        if ($root.GetProperty('updatedAt').GetString() -notmatch $isoUtcPattern) { return 'SceneRunView.updatedAt 不是 ISO-8601 UTC' }
        $photoIds = $root.GetProperty('photoIds')
        if ($photoIds.ValueKind -ne 'Array') { return 'SceneRunView.photoIds 不是数组' }
        for ($index = 0; $index -lt $photoIds.GetArrayLength(); $index++) {
            if ($photoIds[$index].GetString() -notmatch $uuidPattern) { return "SceneRunView.photoIds[$index] 不是 UUID" }
        }
        $brief = $root.GetProperty('brief')
        if ($brief.ValueKind -ne 'Null') {
            if ((@(Get-JsonPropertyNames $brief) -join ',') -ne 'mood,memoryReading,scenePrompt,entranceNarration,palette,avoid,userHint') { return 'SceneRunView.brief 字段不符' }
        }
        $review = $root.GetProperty('review')
        if ($review.ValueKind -ne 'Null') {
            if ((@(Get-JsonPropertyNames $review) -join ',') -ne 'scores,verdict,issues,summary') { return 'SceneRunView.review 字段不符' }
            if (@('pass', 'revise') -notcontains $review.GetProperty('verdict').GetString()) { return 'SceneRunView.review.verdict 不是 pass/revise' }
            if ((@(Get-JsonPropertyNames $review.GetProperty('scores')) -join ',') -ne 'moodMatch,photoPresence,composition,lightingColor,completeness') { return 'SceneRunView.review.scores 字段不符' }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-SceneAwaitingCapture {
    param([string]$JsonText)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'SceneRunView 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        if ($root.GetProperty('status').GetString() -ne 'awaiting_capture') { return '场景未到达 awaiting_capture' }
        $code = $root.GetProperty('code')
        if ($code.ValueKind -ne 'String' -or [string]::IsNullOrWhiteSpace($code.GetString())) { return 'awaiting_capture 时 code 必须非空' }
        $brief = $root.GetProperty('brief')
        if ($brief.ValueKind -ne 'Object') { return 'awaiting_capture 时 brief 必须存在' }
        foreach ($field in @('mood', 'memoryReading', 'scenePrompt', 'entranceNarration')) {
            if ([string]::IsNullOrWhiteSpace($brief.GetProperty($field).GetString())) { return "brief.$field 为空" }
        }
        if ($brief.GetProperty('palette').GetArrayLength() -lt 1) { return 'brief.palette 为空' }
        if ($brief.GetProperty('avoid').GetArrayLength() -lt 1) { return 'brief.avoid 为空' }
        if ($brief.GetProperty('avoid').GetArrayLength() -gt 8) { return 'brief.avoid 超过 8 条（v3 允许 6–8 条）' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Wait-SceneAwaitingCapture {
    param([string]$ExhibitionBody, [string]$AuthToken, [int]$WaitSeconds = 30)
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $result = [pscustomobject]@{ Ok = $false; HttpStatus = 0; Ms = 0; Body = ''; Problem = "${WaitSeconds}s 内未到达 awaiting_capture"; RunId = ''; PhotoIds = @(); Status = '' }
    while ((Get-Date) -lt $deadline) {
        $run = Invoke-Api -Method POST -Path '/api/getscenerun' -JsonBody $ExhibitionBody -Token $AuthToken
        $result.HttpStatus = $run.Status
        $result.Ms = $run.Ms
        if ($run.Status -ne 200) {
            $result.Problem = "getscenerun 状态=$($run.Status)：$(Hide-Tokens $run.Body)"
            return $result
        }
        $result.Problem = Test-SceneRunView $run.Body
        if (-not [string]::IsNullOrEmpty($result.Problem)) { return $result }
        $doc = [System.Text.Json.JsonDocument]::Parse($run.Body)
        $result.Status = $doc.RootElement.GetProperty('status').GetString()
        $result.Body = $run.Body
        $result.RunId = $doc.RootElement.GetProperty('runId').GetString()
        $result.PhotoIds = @($doc.RootElement.GetProperty('photoIds').EnumerateArray() | ForEach-Object { $_.GetString() })
        $doc.Dispose()
        if ($result.Status -eq 'awaiting_capture') {
            $result.Problem = Test-SceneAwaitingCapture $result.Body
            $result.Ok = [string]::IsNullOrEmpty($result.Problem)
            return $result
        }
        if ($result.Status -eq 'failed' -or $result.Status -eq 'cancelled') {
            $result.Problem = "场景运行进入终态 $($result.Status)，未到达 awaiting_capture"
            return $result
        }
        Start-Sleep -Milliseconds 700
    }
    return $result
}

function Wait-SceneReviewCompletion {
    param($Response, [string]$RunId, [string]$AuthToken)
    $body = @{ runId = $RunId } | ConvertTo-Json -Compress
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($Response.Status -eq 200 -and [DateTime]::UtcNow -lt $deadline) {
        $sceneRun = $Response.Body | ConvertFrom-Json
        if ($sceneRun.status -ne 'reviewing') { break }
        Start-Sleep -Milliseconds 200
        $Response = Invoke-Api -Method POST -Path '/api/getscenerunbyid' -JsonBody $body -Token $AuthToken
    }
    return $Response
}

function Test-SceneReviewOutcome {
    param([string]$JsonText, [string]$ExpectedStatus, [string]$ExpectedSource, [bool]$ExpectReviewPass)
    $baseProblem = Test-SceneRunView $JsonText
    if (-not [string]::IsNullOrEmpty($baseProblem)) { return $baseProblem }
    $doc = New-JsonDocument $JsonText
    try {
        $root = $doc.RootElement
        if ($root.GetProperty('status').GetString() -ne $ExpectedStatus) { return "status=$($root.GetProperty('status').GetString())，期望 $ExpectedStatus" }
        if (-not [string]::IsNullOrWhiteSpace($ExpectedSource) -and $root.GetProperty('source').GetString() -ne $ExpectedSource) {
            return "source=$($root.GetProperty('source').GetString())，期望 $ExpectedSource"
        }
        $review = $root.GetProperty('review')
        if ($ExpectReviewPass) {
            if ($review.ValueKind -ne 'Object') { return 'review 缺失（通过时应保留评审结果）' }
            if ($review.GetProperty('verdict').GetString() -ne 'pass') { return "review.verdict=$($review.GetProperty('verdict').GetString())，期望 pass" }
            $scores = $review.GetProperty('scores')
            foreach ($field in @('moodMatch', 'photoPresence', 'composition', 'lightingColor', 'completeness')) {
                $value = $scores.GetProperty($field).GetInt32()
                if ($value -lt 1 -or $value -gt 5) { return "review.scores.$field=$value 不在 1–5" }
            }
            if ($review.GetProperty('issues').GetArrayLength() -gt 6) { return 'review.issues 超过 6 条' }
            if ([string]::IsNullOrWhiteSpace($review.GetProperty('summary').GetString())) { return 'review.summary 为空' }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-SceneGateRejected {
    param([string]$JsonText)
    $baseProblem = Test-SceneRunView $JsonText
    if (-not [string]::IsNullOrEmpty($baseProblem)) { return $baseProblem }
    $doc = New-JsonDocument $JsonText
    try {
        $root = $doc.RootElement
        $status = $root.GetProperty('status').GetString()
        if (@('generating', 'awaiting_capture', 'reviewing') -notcontains $status) { return "硬门禁失败后 status=$status，期望回 generating" }
        if ($root.GetProperty('attempts').GetInt32() -ne 1) { return "attempts=$($root.GetProperty('attempts').GetInt32())，期望 1（首次修订）" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-SceneCancelled {
    param([string]$JsonText)
    $baseProblem = Test-SceneRunView $JsonText
    if (-not [string]::IsNullOrEmpty($baseProblem)) { return $baseProblem }
    $doc = New-JsonDocument $JsonText
    try {
        if ($doc.RootElement.GetProperty('status').GetString() -ne 'cancelled') { return '场景运行不是 cancelled' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# 生成 ≤320px 的合法 JPEG data URL（评审 captures 用；避免内嵌 600KB+ 大图拖慢冒烟）。
function Get-SmallJpegDataUrl {
    param([string]$SourcePath, [int]$MaxEdge = 320)
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { Exit-WithFailure "找不到评审截图 fixture：$SourcePath" }
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($SourcePath)
    $bitmap = $null
    try {
        $scale = [math]::Min(1.0, [double]$MaxEdge / [math]::Max($source.Width, $source.Height))
        $width = [math]::Max(1, [int][math]::Round($source.Width * $scale))
        $height = [math]::Max(1, [int][math]::Round($source.Height * $scale))
        $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($source, 0, 0, $width, $height)
        } finally {
            $graphics.Dispose()
        }
        $stream = [System.IO.MemoryStream]::new()
        try {
            $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
            $encoderParams = [System.Drawing.Imaging.EncoderParameters]::new(1)
            try {
                $encoderParams.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]82)
                $bitmap.Save($stream, $encoder, $encoderParams)
            } finally {
                $encoderParams.Dispose()
            }
            return 'data:image/jpeg;base64,' + [Convert]::ToBase64String($stream.ToArray())
        } finally {
            $stream.Dispose()
        }
    } finally {
        if ($null -ne $bitmap) { $bitmap.Dispose() }
        $source.Dispose()
    }
}

function Test-ValidationReason {
    param([string]$JsonText, [string]$ExpectedReason)
    $baseProblem = Test-ErrorResponse $JsonText 'VALIDATION'
    if (-not [string]::IsNullOrEmpty($baseProblem)) { return $baseProblem }
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return '错误响应体缺失或不是合法 JSON' }
    try {
        $details = $doc.RootElement.GetProperty('error').GetProperty('details')
        if ($details.ValueKind -ne 'Object') { return 'error.details 缺失或不是对象' }
        $detailKeys = @(Get-JsonPropertyNames $details)
        if ($detailKeys -notcontains 'reason') { return 'error.details.reason 缺失' }
        $reason = $details.GetProperty('reason').GetString()
        if ($reason -ne $ExpectedReason) { return "error.details.reason=$reason，期望 $ExpectedReason" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# ---------- D6 publish 响应形状校验（-IncludePublish） ----------

function Test-ExhibitionPublishState {
    param(
        [string]$JsonText,
        [bool]$ExpectedSceneStale,
        [int]$ExpectedPublicationVersion = -1,
        [bool]$ExpectedHasUnpublishedChanges
    )
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'ExhibitionDetail 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $sceneStale = $root.GetProperty('sceneStale').GetBoolean()
        if ($sceneStale -ne $ExpectedSceneStale) { return "sceneStale=$sceneStale，期望 $ExpectedSceneStale" }
        $publication = $root.GetProperty('publication')
        if ($ExpectedPublicationVersion -eq 0) {
            if ($publication.ValueKind -ne 'Null') { return '未发布时 publication 应为 null' }
        } elseif ($ExpectedPublicationVersion -gt 0) {
            if ($publication.ValueKind -ne 'Object') { return 'publication 缺失' }
            $version = $publication.GetProperty('version').GetInt32()
            if ($version -ne $ExpectedPublicationVersion) { return "publication.version=$version，期望 $ExpectedPublicationVersion" }
        }
        $hasUnpublishedChanges = $root.GetProperty('hasUnpublishedChanges').GetBoolean()
        if ($hasUnpublishedChanges -ne $ExpectedHasUnpublishedChanges) { return "hasUnpublishedChanges=$hasUnpublishedChanges，期望 $ExpectedHasUnpublishedChanges" }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-PublishResponse {
    param([string]$JsonText, [int]$ExpectedVersion)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'PublishExhibitionResponse 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $keys = @(Get-JsonPropertyNames $root)
        if (($keys -join ',') -ne 'version,publishedAt') { return "PublishExhibitionResponse 字段=[$($keys -join ',')]，期望 [version,publishedAt]" }
        $version = $root.GetProperty('version').GetInt32()
        if ($version -ne $ExpectedVersion) { return "version=$version，期望 $ExpectedVersion" }
        if ($root.GetProperty('publishedAt').GetString() -notmatch $isoUtcPattern) { return 'publishedAt 不是 ISO-8601 UTC' }
        return ''
    } finally {
        $doc.Dispose()
    }
}

function Test-PublicExhibitionView {
    param([string]$JsonText, [string]$ExpectedId, [int]$ExpectedVersion, [string]$ExpectedTitle)
    $doc = New-JsonDocument $JsonText
    if ($null -eq $doc) { return 'PublicExhibitionView 响应体缺失或不是合法 JSON' }
    try {
        $root = $doc.RootElement
        $expectedKeys = 'id,version,title,narrative,narration,cover,groups,photos,locations,publishedAt,author,scenePalette'
        $keys = @(Get-JsonPropertyNames $root)
        if (-not (Test-JsonKeySet $keys $expectedKeys)) { return "PublicExhibitionView 字段=[$($keys -join ',')]，期望 [$expectedKeys]" }
        if ($root.GetProperty('id').GetString() -ne $ExpectedId) { return 'PublicExhibitionView.id 与展览不一致' }
        if ($root.GetProperty('version').GetInt32() -ne $ExpectedVersion) { return "version=$($root.GetProperty('version').GetInt32())，期望 $ExpectedVersion" }
        if ($root.GetProperty('title').GetString() -ne $ExpectedTitle) { return "title=$($root.GetProperty('title').GetString())，期望 $ExpectedTitle" }
        foreach ($field in @('narrative', 'narration')) {
            if ($root.GetProperty($field).ValueKind -ne 'String') { return "$field 不是字符串" }
        }
        if ($root.GetProperty('publishedAt').GetString() -notmatch $isoUtcPattern) { return 'publishedAt 不是 ISO-8601 UTC' }
        $cover = $root.GetProperty('cover')
        if ((@(Get-JsonPropertyNames $cover) -join ',') -ne 'kind,imageUrl,width,height') { return 'cover 字段不符' }
        if (@('auto', 'photo', 'render') -notcontains $cover.GetProperty('kind').GetString()) { return 'cover.kind 不是封面枚举值' }
        if ($cover.GetProperty('imageUrl').GetString() -notlike '/api/*') { return 'cover.imageUrl 不是相对路径' }
        foreach ($arrayField in @('groups', 'photos')) {
            if ($root.GetProperty($arrayField).ValueKind -ne 'Array') { return "$arrayField 不是数组" }
        }
        if ($root.GetProperty('groups').GetArrayLength() -lt 1) { return 'groups 为空' }
        if ($root.GetProperty('photos').GetArrayLength() -lt 1) { return 'photos 为空' }
        $groups = $root.GetProperty('groups')
        for ($groupIndex = 0; $groupIndex -lt $groups.GetArrayLength(); $groupIndex++) {
            $group = $groups[$groupIndex]
            if ((@(Get-JsonPropertyNames $group) -join ',') -ne 'id,title,narrative,position,photos') { return "groups[$groupIndex] 字段不符" }
            if ($group.GetProperty('id').GetString() -notmatch $uuidPattern) { return "groups[$groupIndex].id 不是 UUID" }
            $groupPhotos = $group.GetProperty('photos')
            if ($groupPhotos.ValueKind -ne 'Array') { return "groups[$groupIndex].photos 不是数组" }
            for ($photoIndex = 0; $photoIndex -lt $groupPhotos.GetArrayLength(); $photoIndex++) {
                $photo = $groupPhotos[$photoIndex]
                if (-not (Test-JsonKeySet @(Get-JsonPropertyNames $photo) 'id,width,height,caption,contentUrl,thumbUrl,reading,memories')) { return "groups[$groupIndex].photos[$photoIndex] 字段不符" }
                if ($photo.GetProperty('contentUrl').GetString() -notlike '/api/photos/*') { return 'contentUrl 不是相对路径' }
            }
        }
        $photos = $root.GetProperty('photos')
        for ($photoIndex = 0; $photoIndex -lt $photos.GetArrayLength(); $photoIndex++) {
            $photo = $photos[$photoIndex]
            if (-not (Test-JsonKeySet @(Get-JsonPropertyNames $photo) 'id,width,height,caption,contentUrl,thumbUrl,reading,memories')) { return "photos[$photoIndex] 字段不符" }
            if ($photo.GetProperty('id').GetString() -notmatch $uuidPattern) { return "photos[$photoIndex].id 不是 UUID" }
            if ($photo.GetProperty('thumbUrl').GetString() -notlike '/api/photos/*') { return 'thumbUrl 不是相对路径' }
        }
        return ''
    } finally {
        $doc.Dispose()
    }
}

# ---------- HTTP 与结果输出 ----------

function Invoke-Api {
    param(
        [ValidateSet('GET', 'POST')][string]$Method,
        [string]$Path,
        [string]$JsonBody,
        [string]$Token
    )
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) { $headers['Authorization'] = "Bearer $Token" }
    $request = @{
        Uri                = "$base$Path"
        Method             = $Method
        Headers            = $headers
        SkipHttpErrorCheck = $true
        TimeoutSec         = $TimeoutSeconds
    }
    if ($PSBoundParameters.ContainsKey('JsonBody')) {
        $request['ContentType'] = 'application/json'
        $request['Body'] = $JsonBody
    }
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest @request
        $watch.Stop()
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = [string]$response.Content; Ms = $watch.ElapsedMilliseconds; Reachable = $true }
    } catch {
        $watch.Stop()
        return [pscustomobject]@{ Status = 0; Body = ''; Ms = $watch.ElapsedMilliseconds; Reachable = $false }
    }
}

function Invoke-Upload {
    param(
        [string]$Path,
        [string]$Token,
        [string]$ExhibitionId,
        [string]$PhotoFilePath
    )
    $headers = @{ Authorization = "Bearer $Token" }
    $form = @{
        exhibitionId = $ExhibitionId
        files        = Get-Item -LiteralPath $PhotoFilePath
    }
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri "$base$Path" -Method POST -Headers $headers -Form $form -SkipHttpErrorCheck -TimeoutSec $TimeoutSeconds
        $watch.Stop()
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = [string]$response.Content; Ms = $watch.ElapsedMilliseconds; Reachable = $true }
    } catch {
        $watch.Stop()
        return [pscustomobject]@{ Status = 0; Body = ''; Ms = $watch.ElapsedMilliseconds; Reachable = $false }
    }
}

function Add-StepResult {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [int]$Status,
        [int[]]$ExpectedStatus,
        [long]$Ms,
        [string]$Problem
    )
    $ok = ($ExpectedStatus -contains $Status) -and [string]::IsNullOrEmpty($Problem)
    $line = '{0,2}. {1,-4} {2,-28} {3,3} {4,6} ms  {5}' -f
        ($results.Count + 1), $Method, $Path, $Status, $Ms, $(if ($ok) { 'OK' } else { 'FAIL' })
    Write-Host $line
    if (-not $ok) {
        Write-Host ('      期望状态 {0}；{1}' -f ($ExpectedStatus -join '/'), $Problem) -ForegroundColor Red
    }
    $results.Add([pscustomobject]@{
            Name     = $Name
            Path     = $Path
            Ok       = $ok
            Status   = $Status
            Expected = ($ExpectedStatus -join '/')
            Ms       = $Ms
            Problem  = $Problem
        })
}

function Hide-Tokens {
    param([string]$Text)
    return [regex]::Replace($Text, '"token"\s*:\s*"[^"]*"', '"token":"***"')
}

function Exit-WithFailure {
    param([string]$Reason)
    Write-Host ''
    Write-Host "FAILED: $Reason" -ForegroundColor Red
    exit 1
}

# ---------- 主流程 ----------

Write-Host ''
Write-Host "Momentarium E2E smoke -> $base" -ForegroundColor Cyan
Write-Host "开始时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixtureDirectory = Join-Path $repoRoot 'tests/fixtures/synthetic'
$needsThreePhotos = $IncludeCuration -or $IncludeScene -or $IncludeReview -or $IncludePublish
$defaultPhotoPaths = @(
    (Join-Path $fixtureDirectory 'sample-01-coast.jpg'),
    (Join-Path $fixtureDirectory 'sample-02-coast.jpg'),
    (Join-Path $fixtureDirectory 'sample-03-coast.jpg')
)
if (-not $PSBoundParameters.ContainsKey('PhotoPath')) {
    $uploadPaths = @(
        if ($needsThreePhotos) { $defaultPhotoPaths } else { $defaultPhotoPaths[0] }
    )
} else {
    $uploadPaths = @(
        if ($needsThreePhotos) { $PhotoPath; $PhotoPath; $PhotoPath } else { $PhotoPath }
    )
}
$missingPaths = @($uploadPaths | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missingPaths.Count -gt 0) {
    Exit-WithFailure "找不到上传用 fixture：$($missingPaths -join ', ')（可用 -PhotoPath 指定）"
}
$expectedPhotoCount = $uploadPaths.Count
Write-Host ("上传 fixture: {0} 张（{1}）" -f $uploadPaths.Count, ($uploadPaths -join ', '))
if ($IncludeCuration) { Write-Host 'D3 curation 流程: 已启用（需要假 AI 端口）' }
if ($IncludeScene -or $IncludeReview -or $IncludePublish) { Write-Host 'D4/D5/D6 scene（生成/评审/发布）流程: 已启用（需要假 AI 端口与 scene/gallery D6 路由）' }
Write-Host ''

# 0) 连通性：health 失败说明后端未启动或地址错误，直接失败退出。
$health = Invoke-Api -Method GET -Path '/api/health'
if (-not $health.Reachable) {
    Add-StepResult -Name 'health' -Method 'GET' -Path '/api/health' -Status $health.Status -ExpectedStatus @(200) -Ms $health.Ms -Problem '无法连接后端（连接被拒绝或超时）'
    Exit-WithFailure "后端不可达（$base/api/health）。请先启动后端：sbt run"
}
$healthProblem = if ($health.Status -eq 200) { Test-HealthResponse $health.Body } else { "响应体：$(Hide-Tokens $health.Body)" }
Add-StepResult -Name 'health' -Method 'GET' -Path '/api/health' -Status $health.Status -ExpectedStatus @(200) -Ms $health.Ms -Problem $healthProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'health 未通过，后续步骤不执行' }

# 1) register：新账号（时间戳 + 随机后缀保证幂等重跑不冲突）。
if ($UsernamePrefix -notmatch '^[A-Za-z0-9_]{3,12}$') {
    Exit-WithFailure "非法 -UsernamePrefix：$UsernamePrefix（需 3–12 位字母/数字/下划线，避免超过用户名 32 字符上限）"
}
$username = '{0}_{1}_{2}' -f $UsernamePrefix, (Get-Date -Format 'yyyyMMddHHmmss'), ('{0:x4}' -f (Get-Random -Maximum 65536))
$password = 'SmokePassw0rd!'
$registerBody = @{ username = $username; password = $password } | ConvertTo-Json -Compress
$register = Invoke-Api -Method POST -Path '/api/register' -JsonBody $registerBody
$registerProblem = if ($register.Status -in @(200, 201)) { Test-AuthResponse $register.Body } else { "响应体：$(Hide-Tokens $register.Body)" }
Add-StepResult -Name 'register' -Method 'POST' -Path '/api/register' -Status $register.Status -ExpectedStatus @(200, 201) -Ms $register.Ms -Problem $registerProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'register 未通过（契约 AuthResponse）' }
$registerDoc = [System.Text.Json.JsonDocument]::Parse($register.Body)
$registeredUserElement = $registerDoc.RootElement.GetProperty('user')
$registerUserId = $registeredUserElement.GetProperty('id').GetString()
$registeredUsername = $registeredUserElement.GetProperty('username').GetString()
$registerDoc.Dispose()

# 2) login：换取会话令牌；同一用户的 user.id 必须与 register 一致。
$loginBody = @{ username = $username; password = $password } | ConvertTo-Json -Compress
$login = Invoke-Api -Method POST -Path '/api/login' -JsonBody $loginBody
$loginProblem = if ($login.Status -eq 200) { Test-AuthResponse $login.Body } else { "响应体：$(Hide-Tokens $login.Body)" }
Add-StepResult -Name 'login' -Method 'POST' -Path '/api/login' -Status $login.Status -ExpectedStatus @(200) -Ms $login.Ms -Problem $loginProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'login 未通过（契约 AuthResponse）' }
$loginDoc = [System.Text.Json.JsonDocument]::Parse($login.Body)
$token = $loginDoc.RootElement.GetProperty('token').GetString()
$loginUserId = $loginDoc.RootElement.GetProperty('user').GetProperty('id').GetString()
$loginDoc.Dispose()
if ($loginUserId -ne $registerUserId) {
    Exit-WithFailure "login 返回的 user.id 与 register 不一致（$loginUserId != $registerUserId）"
}

# 3) getcurrentuser：带令牌返回当前用户 UserView。
$current = Invoke-Api -Method POST -Path '/api/getcurrentuser' -JsonBody '{}' -Token $token
$currentProblem = if ($current.Status -eq 200) { Test-UserViewResponse $current.Body } else { "响应体：$(Hide-Tokens $current.Body)" }
Add-StepResult -Name 'getcurrentuser' -Method 'POST' -Path '/api/getcurrentuser' -Status $current.Status -ExpectedStatus @(200) -Ms $current.Ms -Problem $currentProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'getcurrentuser 未通过（契约 UserView）' }
$currentDoc = [System.Text.Json.JsonDocument]::Parse($current.Body)
$currentUsername = $currentDoc.RootElement.GetProperty('username').GetString()
$currentDoc.Dispose()
if ($currentUsername -ne $registeredUsername) {
    Exit-WithFailure "getcurrentuser 返回 username=$currentUsername，与注册用户 $registeredUsername 不一致"
}

# 4) gallery：创建展览（记录 exhibitionId 供后续步骤）。
$createExhibitionBody = @{ title = 'QA 冒烟展览' } | ConvertTo-Json -Compress
$createExhibition = Invoke-Api -Method POST -Path '/api/createexhibition' -JsonBody $createExhibitionBody -Token $token
$createExhibitionProblem = if ($createExhibition.Status -eq 200) { Test-CreateExhibitionResponse $createExhibition.Body } else { "响应体：$(Hide-Tokens $createExhibition.Body)" }
Add-StepResult -Name 'createexhibition' -Method 'POST' -Path '/api/createexhibition' -Status $createExhibition.Status -ExpectedStatus @(200) -Ms $createExhibition.Ms -Problem $createExhibitionProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'createexhibition 未通过（契约 CreateExhibitionResponse）' }
$createExhibitionDoc = [System.Text.Json.JsonDocument]::Parse($createExhibition.Body)
$exhibitionId = $createExhibitionDoc.RootElement.GetProperty('exhibitionId').GetString()
$createExhibitionDoc.Dispose()

# 5) gallery：multipart 上传 tests/fixtures/synthetic 照片（PhotoView + 空 failures）；-IncludeCuration 时上传 3 张。
$photoIds = @()
for ($uploadIndex = 0; $uploadIndex -lt $uploadPaths.Count; $uploadIndex++) {
    $uploadPath = $uploadPaths[$uploadIndex]
    $upload = Invoke-Upload -Path '/api/photos/upload' -Token $token -ExhibitionId $exhibitionId -PhotoFilePath $uploadPath
    $uploadProblem = if ($upload.Status -eq 200) { Test-UploadResponse $upload.Body } else { "响应体：$(Hide-Tokens $upload.Body)" }
    Add-StepResult -Name ("upload photo {0}/{1}" -f ($uploadIndex + 1), $uploadPaths.Count) -Method 'POST' -Path '/api/photos/upload' -Status $upload.Status -ExpectedStatus @(200) -Ms $upload.Ms -Problem $uploadProblem
    if (-not $results[-1].Ok) { Exit-WithFailure "第 $($uploadIndex + 1) 张照片上传未通过（契约 UploadPhotosResponse）" }
    $uploadDoc = [System.Text.Json.JsonDocument]::Parse($upload.Body)
    $photoIds += $uploadDoc.RootElement.GetProperty('photos')[0].GetProperty('id').GetString()
    $uploadDoc.Dispose()
}

# 6) gallery：列表包含新展览且 photoCount 与上传数一致。
$listExhibitions = Invoke-Api -Method POST -Path '/api/listmyexhibitions' -JsonBody '{}' -Token $token
$listExhibitionsProblem = if ($listExhibitions.Status -eq 200) { Test-MyExhibitionsResponse $listExhibitions.Body $exhibitionId $expectedPhotoCount } else { "响应体：$(Hide-Tokens $listExhibitions.Body)" }
Add-StepResult -Name 'listmyexhibitions' -Method 'POST' -Path '/api/listmyexhibitions' -Status $listExhibitions.Status -ExpectedStatus @(200) -Ms $listExhibitions.Ms -Problem $listExhibitionsProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'listmyexhibitions 未通过（契约 MyExhibitionsResponse）' }

# 7) gallery：详情包含刚上传的照片（默认全部未分组）。
$getExhibitionBody = @{ exhibitionId = $exhibitionId } | ConvertTo-Json -Compress
$getExhibition = Invoke-Api -Method POST -Path '/api/getexhibition' -JsonBody $getExhibitionBody -Token $token
$getExhibitionProblem = if ($getExhibition.Status -eq 200) { Test-ExhibitionDetailResponse $getExhibition.Body $exhibitionId $photoIds -ExpectedUngroupedCount $expectedPhotoCount } else { "响应体：$(Hide-Tokens $getExhibition.Body)" }
Add-StepResult -Name 'getexhibition' -Method 'POST' -Path '/api/getexhibition' -Status $getExhibition.Status -ExpectedStatus @(200) -Ms $getExhibition.Ms -Problem $getExhibitionProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'getexhibition 未通过（契约 ExhibitionDetail）' }

if ($needsThreePhotos) {
    # 7a) gallery：updatecuration 把照片分成 2 章（curation/scene 流程的前置：全部照片必须分组）。
    $groupOnePhotos = @(
        @{ photoId = $photoIds[0]; caption = '海边的第一张' },
        @{ photoId = $photoIds[1]; caption = '' }
    )
    $groupTwoPhotos = @(@{ photoId = $photoIds[2]; caption = '' })
    $updateCurationBody = @{
        exhibitionId = $exhibitionId
        title        = 'QA 冒烟策展'
        narrative    = '冒烟测试用策展叙事。'
        groups       = @(
            @{ title = '海边的雨'; narrative = '礁石与浪花。'; photos = $groupOnePhotos },
            @{ title = '街巷与咖啡'; narrative = '雨后的街。'; photos = $groupTwoPhotos }
        )
    } | ConvertTo-Json -Compress -Depth 8
    $updateCuration = Invoke-Api -Method POST -Path '/api/updatecuration' -JsonBody $updateCurationBody -Token $token
    $updateCurationProblem = if ($updateCuration.Status -eq 200) {
        Test-ExhibitionDetailResponse $updateCuration.Body $exhibitionId $photoIds -ExpectedUngroupedCount 0 -ExpectedGroupCount 2
    } else { "响应体：$(Hide-Tokens $updateCuration.Body)" }
    Add-StepResult -Name 'updatecuration' -Method 'POST' -Path '/api/updatecuration' -Status $updateCuration.Status -ExpectedStatus @(200) -Ms $updateCuration.Ms -Problem $updateCurationProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'updatecuration 未通过（契约 ExhibitionDetail）' }
}

if ($IncludeCuration) {
    # 7b) curation：suggestthemes（AI_MODE=fake）→ 2–3 个提案且每个覆盖全部照片、不重复。
    $suggestBody = @{ exhibitionId = $exhibitionId; hint = $null } | ConvertTo-Json -Compress
    $suggest = Invoke-Api -Method POST -Path '/api/suggestthemes' -JsonBody $suggestBody -Token $token
    $suggestProblem = if ($suggest.Status -eq 200) { Test-ThemeSuggestionsResponse $suggest.Body $photoIds } else { "响应体：$(Hide-Tokens $suggest.Body)" }
    Add-StepResult -Name 'suggestthemes' -Method 'POST' -Path '/api/suggestthemes' -Status $suggest.Status -ExpectedStatus @(200) -Ms $suggest.Ms -Problem $suggestProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'suggestthemes 未通过（契约 ThemeSuggestionsResponse）' }

    # 7c) curation：refinecuration → reply + CurationProposal（覆盖全部照片）。
    $refineBody = @{ exhibitionId = $exhibitionId; instruction = '把海边的照片放在第一章，整体语气更安静一些。' } | ConvertTo-Json -Compress
    $refine = Invoke-Api -Method POST -Path '/api/refinecuration' -JsonBody $refineBody -Token $token
    $refineProblem = if ($refine.Status -eq 200) { Test-RefineCurationResponse $refine.Body $photoIds } else { "响应体：$(Hide-Tokens $refine.Body)" }
    Add-StepResult -Name 'refinecuration' -Method 'POST' -Path '/api/refinecuration' -Status $refine.Status -ExpectedStatus @(200) -Ms $refine.Ms -Problem $refineProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'refinecuration 未通过（契约 RefineCurationResponse）' }

    # 7d) curation：getchathistory → 已有对话消息（role 小写、createdAt ISO-8601 UTC）。
    $chatHistory = Invoke-Api -Method POST -Path '/api/getchathistory' -JsonBody $getExhibitionBody -Token $token
    $chatHistoryProblem = if ($chatHistory.Status -eq 200) { Test-ChatHistoryResponse $chatHistory.Body } else { "响应体：$(Hide-Tokens $chatHistory.Body)" }
    Add-StepResult -Name 'getchathistory' -Method 'POST' -Path '/api/getchathistory' -Status $chatHistory.Status -ExpectedStatus @(200) -Ms $chatHistory.Ms -Problem $chatHistoryProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'getchathistory 未通过（契约 ChatHistoryResponse）' }
}

if ($IncludeScene -or $IncludeReview -or $IncludePublish) {
    # 7e) scene：generatescene（AI_MODE=fake）→ 轮询 getscenerun 到 awaiting_capture（≤30s）并校验 code/brief。
    $generateBody = @{ exhibitionId = $exhibitionId; hint = $null } | ConvertTo-Json -Compress
    $generate = Invoke-Api -Method POST -Path '/api/generatescene' -JsonBody $generateBody -Token $token
    $generateProblem = if ($generate.Status -eq 200) { Test-SceneRunView $generate.Body } else { "响应体：$(Hide-Tokens $generate.Body)" }
    Add-StepResult -Name 'generatescene' -Method 'POST' -Path '/api/generatescene' -Status $generate.Status -ExpectedStatus @(200) -Ms $generate.Ms -Problem $generateProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'generatescene 未通过（契约 SceneRunView）' }

    $sceneWait = Wait-SceneAwaitingCapture -ExhibitionBody $getExhibitionBody -AuthToken $token
    Add-StepResult -Name 'getscenerun(poll)' -Method 'POST' -Path '/api/getscenerun' -Status $sceneWait.HttpStatus -ExpectedStatus @(200) -Ms $sceneWait.Ms -Problem $sceneWait.Problem
    if (-not $sceneWait.Ok) { Exit-WithFailure '场景生成轮询未通过（awaiting_capture/code/brief）' }
    $sceneRunId = $sceneWait.RunId
}

if ($IncludeReview -or $IncludePublish) {
    if ([string]::IsNullOrWhiteSpace($sceneRunId)) { Exit-WithFailure 'reviewscene 前置缺失：未拿到 runId' }
    # 8a) reviewscene 主路径：4 张合法 JPEG data URL + RuntimeEvidence → succeeded(source=ai, review pass)。
    #     纯场景改造后 photoIdsUsed=[] 为合法（照片在侧栏/大图展示，不要求出现在 3D 场景里）。
    $validCaptures = @('sample-01-coast.jpg', 'sample-02-coast.jpg', 'sample-03-coast.jpg', 'sample-08-street.jpg') |
        ForEach-Object { Get-SmallJpegDataUrl -SourcePath (Join-Path $fixtureDirectory $_) }
    $goodRuntime = @{ buildMs = 12; fps = 30.0; errors = @(); photoIdsUsed = @(); networkAttempts = 0 }
    $reviewBody = @{ runId = $sceneRunId; captures = $validCaptures; runtime = $goodRuntime } | ConvertTo-Json -Compress -Depth 6
    $review = Invoke-Api -Method POST -Path '/api/reviewscene' -JsonBody $reviewBody -Token $token
    $review = Wait-SceneReviewCompletion $review $sceneRunId $token
    $reviewProblem = if ($review.Status -eq 200) { Test-SceneReviewOutcome $review.Body 'succeeded' 'ai' $true } else { "响应体：$(Hide-Tokens $review.Body)" }
    Add-StepResult -Name 'reviewscene(pass)' -Method 'POST' -Path '/api/reviewscene' -Status $review.Status -ExpectedStatus @(200) -Ms $review.Ms -Problem $reviewProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'reviewscene 主路径未通过（succeeded/source=ai/review pass）' }
}

if ($IncludePublish) {
    # 8p) D6 发布主路径：断言 sceneStale=false → publish v1 → 匿名公开读冻结 → 改草稿公开读不变 →
    #     再 publish v2 → 公开读更新 → 未发布展览匿名读 404。
    $publishDetail = Invoke-Api -Method POST -Path '/api/getexhibition' -JsonBody $getExhibitionBody -Token $token
    $publishDetailProblem = if ($publishDetail.Status -eq 200) {
        Test-ExhibitionPublishState $publishDetail.Body -ExpectedSceneStale $false -ExpectedPublicationVersion 0 -ExpectedHasUnpublishedChanges $false
    } else { "响应体：$(Hide-Tokens $publishDetail.Body)" }
    Add-StepResult -Name 'getexhibition(pre-publish)' -Method 'POST' -Path '/api/getexhibition' -Status $publishDetail.Status -ExpectedStatus @(200) -Ms $publishDetail.Ms -Problem $publishDetailProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '发布前置断言失败（sceneStale/publication/hasUnpublishedChanges）' }

    $publishBody = @{ exhibitionId = $exhibitionId } | ConvertTo-Json -Compress
    $publish1 = Invoke-Api -Method POST -Path '/api/publish' -JsonBody $publishBody -Token $token
    $publish1Problem = if ($publish1.Status -eq 200) { Test-PublishResponse $publish1.Body 1 } else { "响应体：$(Hide-Tokens $publish1.Body)" }
    Add-StepResult -Name 'publish(v1)' -Method 'POST' -Path '/api/publish' -Status $publish1.Status -ExpectedStatus @(200) -Ms $publish1.Ms -Problem $publish1Problem
    if (-not $results[-1].Ok) { Exit-WithFailure '首次 publish 未通过（契约 PublishExhibitionResponse v1）' }

    $publicV1 = Invoke-Api -Method POST -Path '/api/getpublishedexhibition' -JsonBody $publishBody
    $publicV1Problem = if ($publicV1.Status -eq 200) {
        Test-PublicExhibitionView $publicV1.Body $exhibitionId 1 'QA 冒烟策展'
    } else { "响应体：$(Hide-Tokens $publicV1.Body)" }
    Add-StepResult -Name 'anonymous getpublishedexhibition(v1)' -Method 'POST' -Path '/api/getpublishedexhibition' -Status $publicV1.Status -ExpectedStatus @(200) -Ms $publicV1.Ms -Problem $publicV1Problem
    if (-not $results[-1].Ok) { Exit-WithFailure '匿名公开读 v1 未通过（PublicExhibitionView）' }

    # 改草稿标题/叙事 → 公开读必须保持 v1 冻结内容不变。
    $editBody = @{ exhibitionId = $exhibitionId; title = 'QA 冒烟展览（发布后改名）'; narrative = '发布后的草稿叙事变更' } | ConvertTo-Json -Compress
    $edit = Invoke-Api -Method POST -Path '/api/updateexhibitionmeta' -JsonBody $editBody -Token $token
    $editProblem = if ($edit.Status -eq 200) { Test-EmptyResponse $edit.Body } else { "响应体：$(Hide-Tokens $edit.Body)" }
    Add-StepResult -Name 'updateexhibitionmeta(after publish)' -Method 'POST' -Path '/api/updateexhibitionmeta' -Status $edit.Status -ExpectedStatus @(200) -Ms $edit.Ms -Problem $editProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '发布后改草稿失败' }

    $publicAfterEdit = Invoke-Api -Method POST -Path '/api/getpublishedexhibition' -JsonBody $publishBody
    $publicAfterEditProblem = if ($publicAfterEdit.Status -eq 200) {
        Test-PublicExhibitionView $publicAfterEdit.Body $exhibitionId 1 'QA 冒烟策展'
    } else { "响应体：$(Hide-Tokens $publicAfterEdit.Body)" }
    Add-StepResult -Name 'anonymous public frozen(v1)' -Method 'POST' -Path '/api/getpublishedexhibition' -Status $publicAfterEdit.Status -ExpectedStatus @(200) -Ms $publicAfterEdit.Ms -Problem $publicAfterEditProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '改草稿后公开读未保持 v1 冻结' }

    $publishDetail2 = Invoke-Api -Method POST -Path '/api/getexhibition' -JsonBody $getExhibitionBody -Token $token
    $publishDetail2Problem = if ($publishDetail2.Status -eq 200) {
        Test-ExhibitionPublishState $publishDetail2.Body -ExpectedSceneStale $true -ExpectedPublicationVersion 1 -ExpectedHasUnpublishedChanges $true
    } else { "响应体：$(Hide-Tokens $publishDetail2.Body)" }
    Add-StepResult -Name 'getexhibition(stale after edit)' -Method 'POST' -Path '/api/getexhibition' -Status $publishDetail2.Status -ExpectedStatus @(200) -Ms $publishDetail2.Ms -Problem $publishDetail2Problem
    if (-not $results[-1].Ok) { Exit-WithFailure '改草稿后预期 sceneStale=true/hasUnpublishedChanges=true' }

    # 改草稿使 sceneStale=true：此时 publish 必须 400 VALIDATION(SCENE_STALE)，不得误发布旧场景。
    $stalePublish = Invoke-Api -Method POST -Path '/api/publish' -JsonBody $publishBody -Token $token
    $stalePublishProblem = if ($stalePublish.Status -eq 400) { Test-ValidationReason $stalePublish.Body 'SCENE_STALE' } else { "响应体：$(Hide-Tokens $stalePublish.Body)" }
    Add-StepResult -Name 'publish(stale) 400 SCENE_STALE' -Method 'POST' -Path '/api/publish' -Status $stalePublish.Status -ExpectedStatus @(400) -Ms $stalePublish.Ms -Problem $stalePublishProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '草稿变更后 publish 未按契约返回 400 VALIDATION(SCENE_STALE)' }

    # 更新发布前必须先重新生成场景：generatescene → awaiting_capture → reviewscene pass → succeeded。
    $regenGenerate = Invoke-Api -Method POST -Path '/api/generatescene' -JsonBody $generateBody -Token $token
    $regenGenerateProblem = if ($regenGenerate.Status -eq 200) { Test-SceneRunView $regenGenerate.Body } else { "响应体：$(Hide-Tokens $regenGenerate.Body)" }
    Add-StepResult -Name 'generatescene(for v2)' -Method 'POST' -Path '/api/generatescene' -Status $regenGenerate.Status -ExpectedStatus @(200) -Ms $regenGenerate.Ms -Problem $regenGenerateProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'v2 前重新生成场景失败（generatescene）' }

    $regenWait = Wait-SceneAwaitingCapture -ExhibitionBody $getExhibitionBody -AuthToken $token
    Add-StepResult -Name 'getscenerun(poll for v2)' -Method 'POST' -Path '/api/getscenerun' -Status $regenWait.HttpStatus -ExpectedStatus @(200) -Ms $regenWait.Ms -Problem $regenWait.Problem
    if (-not $regenWait.Ok) { Exit-WithFailure 'v2 前重新生成未到 awaiting_capture' }

    $regenRuntime = @{ buildMs = 12; fps = 30.0; errors = @(); photoIdsUsed = @(); networkAttempts = 0 }
    $regenReviewBody = @{ runId = $regenWait.RunId; captures = $validCaptures; runtime = $regenRuntime } | ConvertTo-Json -Compress -Depth 6
    $regenReview = Invoke-Api -Method POST -Path '/api/reviewscene' -JsonBody $regenReviewBody -Token $token
    $regenReview = Wait-SceneReviewCompletion $regenReview $regenWait.RunId $token
    $regenReviewProblem = if ($regenReview.Status -eq 200) { Test-SceneReviewOutcome $regenReview.Body 'succeeded' 'ai' $true } else { "响应体：$(Hide-Tokens $regenReview.Body)" }
    Add-StepResult -Name 'reviewscene(for v2)' -Method 'POST' -Path '/api/reviewscene' -Status $regenReview.Status -ExpectedStatus @(200) -Ms $regenReview.Ms -Problem $regenReviewProblem
    if (-not $results[-1].Ok) { Exit-WithFailure 'v2 前重新生成场景评审未通过' }

    $publish2 = Invoke-Api -Method POST -Path '/api/publish' -JsonBody $publishBody -Token $token
    $publish2Problem = if ($publish2.Status -eq 200) { Test-PublishResponse $publish2.Body 2 } else { "响应体：$(Hide-Tokens $publish2.Body)" }
    Add-StepResult -Name 'publish(v2)' -Method 'POST' -Path '/api/publish' -Status $publish2.Status -ExpectedStatus @(200) -Ms $publish2.Ms -Problem $publish2Problem
    if (-not $results[-1].Ok) { Exit-WithFailure '再次 publish 未按契约返回 v2' }

    $publicV2 = Invoke-Api -Method POST -Path '/api/getpublishedexhibition' -JsonBody $publishBody
    $publicV2Problem = if ($publicV2.Status -eq 200) {
        Test-PublicExhibitionView $publicV2.Body $exhibitionId 2 'QA 冒烟展览（发布后改名）'
    } else { "响应体：$(Hide-Tokens $publicV2.Body)" }
    Add-StepResult -Name 'anonymous getpublishedexhibition(v2)' -Method 'POST' -Path '/api/getpublishedexhibition' -Status $publicV2.Status -ExpectedStatus @(200) -Ms $publicV2.Ms -Problem $publicV2Problem
    if (-not $results[-1].Ok) { Exit-WithFailure '匿名公开读 v2 未通过（版本/标题未更新）' }

    # 未发布展览匿名读 → 404 NOT_FOUND（不泄露草稿）。
    $draftCreateBody = @{ title = 'QA 未发布展览' } | ConvertTo-Json -Compress
    $draftCreate = Invoke-Api -Method POST -Path '/api/createexhibition' -JsonBody $draftCreateBody -Token $token
    $draftCreateProblem = if ($draftCreate.Status -eq 200) { Test-CreateExhibitionResponse $draftCreate.Body } else { "响应体：$(Hide-Tokens $draftCreate.Body)" }
    Add-StepResult -Name 'createexhibition(never published)' -Method 'POST' -Path '/api/createexhibition' -Status $draftCreate.Status -ExpectedStatus @(200) -Ms $draftCreate.Ms -Problem $draftCreateProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '创建未发布展览失败' }
    $draftDoc = [System.Text.Json.JsonDocument]::Parse($draftCreate.Body)
    $draftExhibitionId = $draftDoc.RootElement.GetProperty('exhibitionId').GetString()
    $draftDoc.Dispose()

    $draftPublicBody = @{ exhibitionId = $draftExhibitionId } | ConvertTo-Json -Compress
    $draftPublic = Invoke-Api -Method POST -Path '/api/getpublishedexhibition' -JsonBody $draftPublicBody
    $draftPublicProblem = if ($draftPublic.Status -eq 404) { Test-ErrorResponse $draftPublic.Body 'NOT_FOUND' } else { "响应体：$(Hide-Tokens $draftPublic.Body)" }
    Add-StepResult -Name 'anonymous getpublishedexhibition(never published) 404' -Method 'POST' -Path '/api/getpublishedexhibition' -Status $draftPublic.Status -ExpectedStatus @(404) -Ms $draftPublic.Ms -Problem $draftPublicProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '未发布展览公开读未按契约返回 404' }

    # 未发布但有 3 张已分组照片：publish 必须 400 VALIDATION(SCENE_NOT_READY)（无 succeeded run 的 reason 口径）。
    $draftPhotoIds = @()
    for ($draftUploadIndex = 0; $draftUploadIndex -lt $uploadPaths.Count; $draftUploadIndex++) {
        $draftUpload = Invoke-Upload -Path '/api/photos/upload' -Token $token -ExhibitionId $draftExhibitionId -PhotoFilePath $uploadPaths[$draftUploadIndex]
        $draftUploadProblem = if ($draftUpload.Status -eq 200) { Test-UploadResponse $draftUpload.Body } else { "响应体：$(Hide-Tokens $draftUpload.Body)" }
        Add-StepResult -Name ("upload photo(draft) {0}/{1}" -f ($draftUploadIndex + 1), $uploadPaths.Count) -Method 'POST' -Path '/api/photos/upload' -Status $draftUpload.Status -ExpectedStatus @(200) -Ms $draftUpload.Ms -Problem $draftUploadProblem
        if (-not $results[-1].Ok) { Exit-WithFailure "未发布展览上传照片失败（$($draftUploadIndex + 1)）" }
        $draftUploadDoc = [System.Text.Json.JsonDocument]::Parse($draftUpload.Body)
        $draftPhotoIds += $draftUploadDoc.RootElement.GetProperty('photos')[0].GetProperty('id').GetString()
        $draftUploadDoc.Dispose()
    }
    $draftCurationBody = @{
        exhibitionId = $draftExhibitionId
        title        = 'QA 未发布展览'
        narrative    = '未生成场景的草稿。'
        groups       = @(
            @{ title = '第一章'; narrative = ''; photos = @(@{ photoId = $draftPhotoIds[0]; caption = '' }, @{ photoId = $draftPhotoIds[1]; caption = '' }) },
            @{ title = '第二章'; narrative = ''; photos = @(@{ photoId = $draftPhotoIds[2]; caption = '' }) }
        )
    } | ConvertTo-Json -Compress -Depth 8
    $draftCuration = Invoke-Api -Method POST -Path '/api/updatecuration' -JsonBody $draftCurationBody -Token $token
    $draftCurationProblem = if ($draftCuration.Status -eq 200) {
        Test-ExhibitionDetailResponse $draftCuration.Body $draftExhibitionId $draftPhotoIds -ExpectedUngroupedCount 0 -ExpectedGroupCount 2
    } else { "响应体：$(Hide-Tokens $draftCuration.Body)" }
    Add-StepResult -Name 'updatecuration(never published)' -Method 'POST' -Path '/api/updatecuration' -Status $draftCuration.Status -ExpectedStatus @(200) -Ms $draftCuration.Ms -Problem $draftCurationProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '未发布展览 updatecuration 失败' }

    $notReadyPublish = Invoke-Api -Method POST -Path '/api/publish' -JsonBody $draftPublicBody -Token $token
    $notReadyProblem = if ($notReadyPublish.Status -eq 400) { Test-ValidationReason $notReadyPublish.Body 'SCENE_NOT_READY' } else { "响应体：$(Hide-Tokens $notReadyPublish.Body)" }
    Add-StepResult -Name 'publish(no scene) 400 SCENE_NOT_READY' -Method 'POST' -Path '/api/publish' -Status $notReadyPublish.Status -ExpectedStatus @(400) -Ms $notReadyPublish.Ms -Problem $notReadyProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '无 succeeded 场景时 publish 未按契约返回 400 VALIDATION(SCENE_NOT_READY)' }

    $draftDeleteBody = @{ exhibitionId = $draftExhibitionId } | ConvertTo-Json -Compress
    $draftDelete = Invoke-Api -Method POST -Path '/api/deleteexhibition' -JsonBody $draftDeleteBody -Token $token
    $draftDeleteProblem = if ($draftDelete.Status -eq 200) { Test-EmptyResponse $draftDelete.Body } else { "响应体：$(Hide-Tokens $draftDelete.Body)" }
    Add-StepResult -Name 'deleteexhibition(never published)' -Method 'POST' -Path '/api/deleteexhibition' -Status $draftDelete.Status -ExpectedStatus @(200) -Ms $draftDelete.Ms -Problem $draftDeleteProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '清理未发布展览失败' }
}

if ($IncludeReview) {
    # 8b) 对已 succeeded 的 run 重复回传 → 409 CONFLICT（防双花）。
    $reviewAgain = Invoke-Api -Method POST -Path '/api/reviewscene' -JsonBody $reviewBody -Token $token
    $reviewAgainProblem = if ($reviewAgain.Status -eq 409) { Test-ErrorResponse $reviewAgain.Body 'CONFLICT' } else { "响应体：$(Hide-Tokens $reviewAgain.Body)" }
    Add-StepResult -Name 'reviewscene repeat 409' -Method 'POST' -Path '/api/reviewscene' -Status $reviewAgain.Status -ExpectedStatus @(409) -Ms $reviewAgain.Ms -Problem $reviewAgainProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '重复回传未按契约返回 409 CONFLICT' }

    # 8c) 硬门禁负例矩阵：硬门禁失败 → 200 后 attempts=1 回 generating（不得 succeeded）；每类用新 run，测完取消。
    #     纯场景下 photoIdsUsed=[] 属合法（由 8a 主路径覆盖），不再作为负例。
    $gateCases = @('errors', 'network', 'fps', 'capture')
    $lastCancelledRunId = ''
    foreach ($caseName in $gateCases) {
        $caseGenerate = Invoke-Api -Method POST -Path '/api/generatescene' -JsonBody $generateBody -Token $token
        $caseGenerateProblem = if ($caseGenerate.Status -eq 200) { Test-SceneRunView $caseGenerate.Body } else { "响应体：$(Hide-Tokens $caseGenerate.Body)" }
        Add-StepResult -Name "generatescene[gate:$caseName]" -Method 'POST' -Path '/api/generatescene' -Status $caseGenerate.Status -ExpectedStatus @(200) -Ms $caseGenerate.Ms -Problem $caseGenerateProblem
        if (-not $results[-1].Ok) { Exit-WithFailure "硬门禁用例 $caseName 前置 generatescene 失败" }

        $caseWait = Wait-SceneAwaitingCapture -ExhibitionBody $getExhibitionBody -AuthToken $token
        Add-StepResult -Name "getscenerun[poll:$caseName]" -Method 'POST' -Path '/api/getscenerun' -Status $caseWait.HttpStatus -ExpectedStatus @(200) -Ms $caseWait.Ms -Problem $caseWait.Problem
        if (-not $caseWait.Ok) { Exit-WithFailure "硬门禁用例 $caseName 前置轮询未到 awaiting_capture" }

        $caseRuntime = switch ($caseName) {
            'errors' { @{ buildMs = 1; fps = 30.0; errors = @('WEBGL_CONTEXT_LOST'); photoIdsUsed = @(); networkAttempts = 0 } }
            'network' { @{ buildMs = 1; fps = 30.0; errors = @(); photoIdsUsed = @(); networkAttempts = 2 } }
            'fps' { @{ buildMs = 1; fps = 10.0; errors = @(); photoIdsUsed = @(); networkAttempts = 0 } }
            default { @{ buildMs = 1; fps = 30.0; errors = @(); photoIdsUsed = @(); networkAttempts = 0 } }
        }
        $caseCaptures = if ($caseName -eq 'capture') { @('not-a-data-url', 'data:image/png;base64,AAAA') } else { $validCaptures }
        $caseReviewBody = @{ runId = $caseWait.RunId; captures = $caseCaptures; runtime = $caseRuntime } | ConvertTo-Json -Compress -Depth 6
        $caseReview = Invoke-Api -Method POST -Path '/api/reviewscene' -JsonBody $caseReviewBody -Token $token
        $caseReviewProblem = if ($caseReview.Status -eq 200) { Test-SceneGateRejected $caseReview.Body } else { "响应体：$(Hide-Tokens $caseReview.Body)" }
        Add-StepResult -Name "reviewscene[gate-fail:$caseName]" -Method 'POST' -Path '/api/reviewscene' -Status $caseReview.Status -ExpectedStatus @(200) -Ms $caseReview.Ms -Problem $caseReviewProblem
        if (-not $results[-1].Ok) { Exit-WithFailure "硬门禁用例 $caseName 未按契约回到修订（attempts=1，不得 succeeded）" }

        $caseRegenerated = Wait-SceneAwaitingCapture -ExhibitionBody $getExhibitionBody -AuthToken $token
        Add-StepResult -Name "getscenerun[regenerated:$caseName]" -Method 'POST' -Path '/api/getscenerun' -Status $caseRegenerated.HttpStatus -ExpectedStatus @(200) -Ms $caseRegenerated.Ms -Problem $caseRegenerated.Problem
        if (-not $caseRegenerated.Ok) { Exit-WithFailure "硬门禁用例 $caseName 修订后未回到 awaiting_capture" }

        $caseCancelBody = @{ runId = $caseRegenerated.RunId } | ConvertTo-Json -Compress
        $caseCancel = Invoke-Api -Method POST -Path '/api/cancelscene' -JsonBody $caseCancelBody -Token $token
        $caseCancelProblem = if ($caseCancel.Status -eq 200) { Test-SceneCancelled $caseCancel.Body } else { "响应体：$(Hide-Tokens $caseCancel.Body)" }
        Add-StepResult -Name "cancelscene[$caseName]" -Method 'POST' -Path '/api/cancelscene' -Status $caseCancel.Status -ExpectedStatus @(200) -Ms $caseCancel.Ms -Problem $caseCancelProblem
        if (-not $results[-1].Ok) { Exit-WithFailure "硬门禁用例 $caseName 清理取消失败" }
        $lastCancelledRunId = $caseRegenerated.RunId
    }

    # 8d) 终态再取消 → 409 CONFLICT；取消后 getscenerun 仍 cancelled。
    $lastCancelBody = @{ runId = $lastCancelledRunId } | ConvertTo-Json -Compress
    $cancelAgain = Invoke-Api -Method POST -Path '/api/cancelscene' -JsonBody $lastCancelBody -Token $token
    $cancelAgainProblem = if ($cancelAgain.Status -eq 409) { Test-ErrorResponse $cancelAgain.Body 'CONFLICT' } else { "响应体：$(Hide-Tokens $cancelAgain.Body)" }
    Add-StepResult -Name 'cancelscene repeat 409' -Method 'POST' -Path '/api/cancelscene' -Status $cancelAgain.Status -ExpectedStatus @(409) -Ms $cancelAgain.Ms -Problem $cancelAgainProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '终态取消未按契约返回 409 CONFLICT' }

    $afterCancel = Invoke-Api -Method POST -Path '/api/getscenerun' -JsonBody $getExhibitionBody -Token $token
    $afterCancelProblem = if ($afterCancel.Status -eq 200) { Test-SceneCancelled $afterCancel.Body } else { "响应体：$(Hide-Tokens $afterCancel.Body)" }
    Add-StepResult -Name 'getscenerun after cancel' -Method 'POST' -Path '/api/getscenerun' -Status $afterCancel.Status -ExpectedStatus @(200) -Ms $afterCancel.Ms -Problem $afterCancelProblem
    if (-not $results[-1].Ok) { Exit-WithFailure '取消后 getscenerun 未保持 cancelled' }
}

# 8) gallery：改名（EmptyResponse）。
$updateMetaBody = @{ exhibitionId = $exhibitionId; title = 'QA 冒烟展览（改名）'; narrative = '冒烟测试叙事' } | ConvertTo-Json -Compress
$updateMeta = Invoke-Api -Method POST -Path '/api/updateexhibitionmeta' -JsonBody $updateMetaBody -Token $token
$updateMetaProblem = if ($updateMeta.Status -eq 200) { Test-EmptyResponse $updateMeta.Body } else { "响应体：$(Hide-Tokens $updateMeta.Body)" }
Add-StepResult -Name 'updateexhibitionmeta' -Method 'POST' -Path '/api/updateexhibitionmeta' -Status $updateMeta.Status -ExpectedStatus @(200) -Ms $updateMeta.Ms -Problem $updateMetaProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'updateexhibitionmeta 未通过（契约 EmptyResponse {}）' }

# 9) gallery：setcover=photo（CoverView 形状）。
$setCoverBody = @{ exhibitionId = $exhibitionId; kind = 'photo'; photoId = $photoIds[0]; renderKey = $null } | ConvertTo-Json -Compress
$setCover = Invoke-Api -Method POST -Path '/api/setcover' -JsonBody $setCoverBody -Token $token
$setCoverProblem = if ($setCover.Status -eq 200) { Test-CoverViewResponse $setCover.Body 'photo' } else { "响应体：$(Hide-Tokens $setCover.Body)" }
Add-StepResult -Name 'setcover' -Method 'POST' -Path '/api/setcover' -Status $setCover.Status -ExpectedStatus @(200) -Ms $setCover.Ms -Problem $setCoverProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'setcover 未通过（契约 CoverView）' }

# 10) gallery：删除照片（EmptyResponse）。
$deletePhotoBody = @{ photoId = $photoIds[0] } | ConvertTo-Json -Compress
$deletePhoto = Invoke-Api -Method POST -Path '/api/deletephoto' -JsonBody $deletePhotoBody -Token $token
$deletePhotoProblem = if ($deletePhoto.Status -eq 200) { Test-EmptyResponse $deletePhoto.Body } else { "响应体：$(Hide-Tokens $deletePhoto.Body)" }
Add-StepResult -Name 'deletephoto' -Method 'POST' -Path '/api/deletephoto' -Status $deletePhoto.Status -ExpectedStatus @(200) -Ms $deletePhoto.Ms -Problem $deletePhotoProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'deletephoto 未通过（契约 EmptyResponse {}）' }

# 11) gallery：删除展览（EmptyResponse）。
$deleteExhibitionBody = @{ exhibitionId = $exhibitionId } | ConvertTo-Json -Compress
$deleteExhibition = Invoke-Api -Method POST -Path '/api/deleteexhibition' -JsonBody $deleteExhibitionBody -Token $token
$deleteExhibitionProblem = if ($deleteExhibition.Status -eq 200) { Test-EmptyResponse $deleteExhibition.Body } else { "响应体：$(Hide-Tokens $deleteExhibition.Body)" }
Add-StepResult -Name 'deleteexhibition' -Method 'POST' -Path '/api/deleteexhibition' -Status $deleteExhibition.Status -ExpectedStatus @(200) -Ms $deleteExhibition.Ms -Problem $deleteExhibitionProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'deleteexhibition 未通过（契约 EmptyResponse {}）' }

# 12) gallery：已删除展览返回 404 NOT_FOUND（不泄露存在性）。
$goneExhibition = Invoke-Api -Method POST -Path '/api/getexhibition' -JsonBody $getExhibitionBody -Token $token
$goneExhibitionProblem = if ($goneExhibition.Status -eq 404) { Test-ErrorResponse $goneExhibition.Body 'NOT_FOUND' } else { "响应体：$(Hide-Tokens $goneExhibition.Body)" }
Add-StepResult -Name 'deleted getexhibition' -Method 'POST' -Path '/api/getexhibition' -Status $goneExhibition.Status -ExpectedStatus @(404) -Ms $goneExhibition.Ms -Problem $goneExhibitionProblem
if (-not $results[-1].Ok) { Exit-WithFailure '已删除展览未按契约返回 404 NOT_FOUND' }

# 13) 无令牌 getcurrentuser：必须 401 UNAUTHORIZED。
$anonymous = Invoke-Api -Method POST -Path '/api/getcurrentuser' -JsonBody '{}'
$anonymousProblem = if ($anonymous.Status -eq 401) { Test-ErrorResponse $anonymous.Body 'UNAUTHORIZED' } else { "响应体：$(Hide-Tokens $anonymous.Body)" }
Add-StepResult -Name 'anonymous getcurrentuser' -Method 'POST' -Path '/api/getcurrentuser' -Status $anonymous.Status -ExpectedStatus @(401) -Ms $anonymous.Ms -Problem $anonymousProblem
if (-not $results[-1].Ok) { Exit-WithFailure '无令牌 getcurrentuser 未按契约返回 401 UNAUTHORIZED' }

# 5) logout：令牌注销，返回 EmptyResponse {}。
$logout = Invoke-Api -Method POST -Path '/api/logout' -JsonBody '{}' -Token $token
$logoutProblem = if ($logout.Status -eq 200) { Test-EmptyResponse $logout.Body } else { "响应体：$(Hide-Tokens $logout.Body)" }
Add-StepResult -Name 'logout' -Method 'POST' -Path '/api/logout' -Status $logout.Status -ExpectedStatus @(200) -Ms $logout.Ms -Problem $logoutProblem
if (-not $results[-1].Ok) { Exit-WithFailure 'logout 未通过（契约 EmptyResponse {}）' }

# 6) 登出后旧令牌失效：必须 401 UNAUTHORIZED。
$afterLogout = Invoke-Api -Method POST -Path '/api/getcurrentuser' -JsonBody '{}' -Token $token
$afterLogoutProblem = if ($afterLogout.Status -eq 401) { Test-ErrorResponse $afterLogout.Body 'UNAUTHORIZED' } else { "响应体：$(Hide-Tokens $afterLogout.Body)" }
Add-StepResult -Name 'logged-out getcurrentuser' -Method 'POST' -Path '/api/getcurrentuser' -Status $afterLogout.Status -ExpectedStatus @(401) -Ms $afterLogout.Ms -Problem $afterLogoutProblem

$failed = @($results | Where-Object { -not $_.Ok })
$totalMs = ($results | Measure-Object -Property Ms -Sum).Sum
Write-Host ''
Write-Host ('步骤: {0}  通过: {1}  失败: {2}  总耗时: {3} ms' -f
    $results.Count, ($results.Count - $failed.Count), $failed.Count, $totalMs) -ForegroundColor $(if ($failed.Count -eq 0) { 'Green' } else { 'Red' })
if ($failed.Count -gt 0) {
    Write-Host '失败步骤：'
    $failed | ForEach-Object { Write-Host ("  - {0}（{1}）：{2}" -f $_.Name, $_.Path, $_.Problem) }
    exit 1
}
Write-Host 'RESULT: PASS' -ForegroundColor Green
