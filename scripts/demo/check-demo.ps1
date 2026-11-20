#!/usr/bin/env pwsh
<#
.SYNOPSIS
    只读检查已有公开演示展览。
.PARAMETER BaseUrl
    服务根地址，默认 http://localhost:8080。
.PARAMETER ExhibitionId
    已发布的展览 ID。
.EXAMPLE
    pwsh scripts/demo/check-demo.ps1 -ExhibitionId <id>
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [Parameter(Mandatory)][string]$ExhibitionId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function Get-Response {
    param([string]$Path, [string]$JsonBody)
    $request = @{
        Uri = "$base$Path"
        Method = if ($PSBoundParameters.ContainsKey('JsonBody')) { 'POST' } else { 'GET' }
        SkipHttpErrorCheck = $true
        TimeoutSec = 20
    }
    if ($PSBoundParameters.ContainsKey('JsonBody')) {
        $request.ContentType = 'application/json'
        $request.Body = $JsonBody
    }
    try {
        $response = Invoke-WebRequest @request
        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            ContentType = [string]$response.Headers['Content-Type']
            Body = [string]$response.Content
            Bytes = [byte[]]$response.RawContentStream.ToArray()
        }
    } catch {
        throw "请求 $Path 失败（网络错误或超时）。"
    }
}

function Require-JsonObject {
    param($Response, [string]$Name)
    if ($Response.Status -ne 200) { throw "$Name 返回 HTTP $($Response.Status)，预期 200。" }
    if ($Response.ContentType -notmatch '^application/json(?:\s*;|$)') { throw "$Name 内容类型不是 application/json。" }
    try { $value = $Response.Body | ConvertFrom-Json -AsHashtable } catch { throw "$Name 响应不是有效 JSON。" }
    if ($value -isnot [System.Collections.IDictionary]) { throw "$Name JSON 根值不是对象。" }
    return $value
}

try {
    $health = Require-JsonObject (Get-Response '/api/health') 'health'
    if ($health.status -cne 'ok') { throw 'health.status 不是 ok。' }

    $body = @{ exhibitionId = $ExhibitionId } | ConvertTo-Json -Compress
    $exhibition = Require-JsonObject (Get-Response '/api/getpublishedexhibition' $body) 'getpublishedexhibition'
    $version = 0
    if ($exhibition.id -cne $ExhibitionId -or
        -not [int]::TryParse([string]$exhibition.version, [ref]$version) -or $version -lt 1) {
        throw '公开展览响应的 id 或 version 无效。'
    }
    if ([string]::IsNullOrWhiteSpace([string]$exhibition.title) -or
        $exhibition.cover -isnot [System.Collections.IDictionary] -or
        $exhibition.cover.kind -notin @('auto', 'photo', 'render') -or
        [string]$exhibition.cover.imageUrl -notmatch '^/api/exhibitions/[^/]+/cover$' -or
        $exhibition.photos -isnot [array] -or $exhibition.photos.Count -lt 1 -or
        $exhibition.groups -isnot [array] -or [string]::IsNullOrWhiteSpace([string]$exhibition.publishedAt)) {
        throw '公开展览响应结构不完整，或不包含可用封面路径/照片/分组。'
    }

    $scene = Require-JsonObject (Get-Response '/api/getpublishedscene' $body) 'getpublishedscene'
    if ([string]::IsNullOrWhiteSpace([string]$scene.code) -or
        [string]::IsNullOrWhiteSpace([string]$scene.runtimeVersion) -or
        [string]::IsNullOrWhiteSpace([string]$scene.generatedAt)) {
        throw '公开场景响应缺少 code、runtimeVersion 或 generatedAt。'
    }

    $coverPath = [string]$exhibition.cover.imageUrl
    if (-not $coverPath.StartsWith('/')) { throw '封面 URL 必须是站内绝对路径。' }
    $cover = Get-Response $coverPath
    if ($cover.Status -ne 200 -or $cover.ContentType -notmatch '^image/(jpeg|png|webp)(?:\s*;|$)' -or $cover.Bytes.Length -lt 12) {
        throw '公开封面不是有效的 JPEG、PNG 或 WebP 图片响应。'
    }
    $signature = [System.BitConverter]::ToString($cover.Bytes[0..11])
    $validImage = switch -Regex ($cover.ContentType) {
        '^image/jpeg(?:\s*;|$)' { $signature.StartsWith('FF-D8-FF'); break }
        '^image/png(?:\s*;|$)' { $signature.StartsWith('89-50-4E-47-0D-0A-1A-0A'); break }
        '^image/webp(?:\s*;|$)' {
            [System.BitConverter]::ToString($cover.Bytes[0..3]) -eq '52-49-46-46' -and
                [System.BitConverter]::ToString($cover.Bytes[8..11]) -eq '57-45-42-50'
            break
        }
        default { $false }
    }
    if (-not $validImage) { throw '封面响应头虽为图片类型，但内容签名无效。' }

    Write-Host "演示展览可用：$ExhibitionId（版本 $version，$($exhibition.photos.Count) 张照片）" -ForegroundColor Green
    exit 0
} catch {
    Write-Host "演示展览检查失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
