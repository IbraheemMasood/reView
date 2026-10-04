param(
    [switch]$Apply,
    [switch]$Redeploy
)
. (Join-Path $PSScriptRoot 'static-demo-preview.common.ps1')

$state = Read-PreviewState
$reuseProject = $state.status -ne 'planned'
if ($reuseProject -and (-not $Redeploy -or -not $state.projectId -or -not $state.projectName)) {
    throw "Preview lifecycle is '$($state.status)'; pass -Redeploy to reuse its exact recorded project."
}

$sources = [ordered]@{
    'keychecker/index.html' = Join-Path $script:PreviewRoot 'viewer\index.html'
    'keychecker/app.js' = Join-Path $script:PreviewRoot 'viewer\app.js'
    'keychecker/styles.css' = Join-Path $script:PreviewRoot 'viewer\styles.css'
    'keychecker/graph.json' = Join-Path $script:PreviewRoot 'reView-out\keychecker\graph.json'
}
$hashes = [ordered]@{}
foreach ($relative in $sources.Keys) {
    if (-not (Test-Path -LiteralPath $sources[$relative] -PathType Leaf)) { throw "Required viewer file is missing: $($sources[$relative])" }
    $sourceFull = (Resolve-Path -LiteralPath $sources[$relative]).Path
    $repoPrefix = [IO.Path]::GetFullPath($script:PreviewRoot).TrimEnd('\') + '\'
    if (-not $sourceFull.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Source file escapes the repo: $relative" }
    $hashes[$relative] = (Get-FileHash -LiteralPath $sourceFull -Algorithm SHA256).Hash.ToLowerInvariant()
}

if (-not $Apply) {
    Write-Host 'Plan only. The Vercel account and local files were not changed.'
    Write-Host "Account: $($script:PreviewAccount), scope: $($script:PreviewScope)"
    Write-Host "Static payload: $($sources.Keys -join ', '), plus a generated root redirect"
    Write-Host 'Run with -Apply to stage the allowlisted files and deploy the public static demo.'
    return
}

Assert-PreviewIdentity
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$expectedStageParent = [IO.Path]::GetFullPath((Join-Path $temp 'codex-review-redesign-static-preview'))
if (-not [IO.Path]::GetFullPath($script:PreviewStageParent).Equals($expectedStageParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Temporary staging path did not resolve to the expected directory.'
}
if (Test-Path -LiteralPath $script:PreviewStageParent) {
    if (-not (Test-Path -LiteralPath $script:PreviewMarker -PathType Leaf) -or
        [IO.File]::ReadAllText($script:PreviewMarker).Trim() -ne 'reView static preview staging owned by Codex') {
        throw "Refusing to overwrite unowned staging directory $($script:PreviewStageParent)"
    }
    if (Test-Path -LiteralPath $script:PreviewStage) { Remove-Item -LiteralPath $script:PreviewStage -Recurse -Force }
} else {
    New-Item -ItemType Directory -Path $script:PreviewStageParent -Force | Out-Null
    [IO.File]::WriteAllText($script:PreviewMarker, 'reView static preview staging owned by Codex', [Text.UTF8Encoding]::new($false))
}

$keychecker = Join-Path $script:PreviewStage 'keychecker'
New-Item -ItemType Directory -Path $keychecker -Force | Out-Null
foreach ($relative in $sources.Keys) {
    $destination = Join-Path $script:PreviewStage ($relative.Replace('/', '\'))
    Copy-Item -LiteralPath $sources[$relative] -Destination $destination
    $stagedHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($stagedHash -ne $hashes[$relative]) { throw "Staged file changed during copy: $relative" }
}
$redirect = @'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=/keychecker/"><title>reView demo</title></head>
<body><p><a href="/keychecker/">Open the keychecker graph demo</a></p><script>window.location.replace('/keychecker/');</script></body></html>
'@
[IO.File]::WriteAllText((Join-Path $script:PreviewStage 'index.html'), $redirect, [Text.UTF8Encoding]::new($false))
$expectedFiles = @('index.html', 'keychecker/app.js', 'keychecker/graph.json', 'keychecker/index.html', 'keychecker/styles.css') | Sort-Object
$actualFiles = @(Get-ChildItem -LiteralPath $script:PreviewStage -File -Force -Recurse | ForEach-Object {
    $_.FullName.Substring($script:PreviewStage.Length).TrimStart('\', '/').Replace('\', '/')
} | Sort-Object)
if (($actualFiles -join "`n") -cne ($expectedFiles -join "`n")) {
    throw "Staging allowlist failed. Expected $($expectedFiles -join ', '); found $($actualFiles -join ', ')."
}
if ((& git -C $script:PreviewStage rev-parse --show-toplevel 2>$null) -and $LASTEXITCODE -eq 0) {
    throw 'Staging folder unexpectedly resolves inside a Git worktree.'
}
Write-Host "Staged and verified allowlist: $($actualFiles -join ', ')"

try {
    if (-not $reuseProject) {
        $projects = Get-PreviewProjects
        $projectName = $script:PreviewBaseName
        if (@($projects | Where-Object { $_.name -eq $projectName }).Count -gt 0) {
            $projectName = $script:PreviewBaseName + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
        }
        $state.status = 'creating-project'
        $state.projectName = $projectName
        $state.vercelAccount = $script:PreviewAccount
        $state.vercelScope = $script:PreviewScope
        $state.createdAtUtc = [DateTime]::UtcNow.ToString('o')
        Save-PreviewState $state
        Invoke-PreviewVercel @('project', 'add', $projectName) $script:PreviewStage | Out-Null
        $matches = @(Get-PreviewProjects | Where-Object { $_.name -eq $projectName })
        if ($matches.Count -ne 1) { throw "Expected one newly created Vercel project named '$projectName'." }
        $state.projectId = [string]$matches[0].id
        $state.status = 'project-created'
    } else {
        $projectMatches = @(Get-PreviewProjects | Where-Object { $_.id -eq $state.projectId -and $_.name -eq $state.projectName })
        if ($projectMatches.Count -ne 1) { throw 'Recorded project identity is missing or ambiguous.' }
        if ($state.deploymentId) {
            $state.previousDeployments = @($state.previousDeployments) + @([PSCustomObject]@{
                deploymentId = $state.deploymentId
                deploymentUrl = $state.deploymentUrl
                target = $state.deploymentTarget
            })
        }
        $state.status = 'project-created'
    }
    $projectName = [string]$state.projectName
    $state.vercelAccount = $script:PreviewAccount
    $state.vercelScope = $script:PreviewScope
    $state.payloadFiles = $expectedFiles
    $state.payloadHashes = $hashes
    $state.gitBranch = (& git -C $script:PreviewRoot branch --show-current).Trim()
    $state.gitCommit = (& git -C $script:PreviewRoot rev-parse HEAD).Trim()
    $state.workingTreeDirty = [bool](& git -C $script:PreviewRoot status --porcelain)
    Save-PreviewState $state

    $settings = Invoke-PreviewApi 'GET' "/v9/projects/$($state.projectId)"
    if ($null -eq $settings -or $settings.id -ne $state.projectId -or $settings.name -ne $projectName) {
        throw 'Vercel project identity could not be verified after creation.'
    }
    if ($settings.link) { throw 'New static Vercel project unexpectedly has a Git integration.' }

    Invoke-PreviewVercel @('link', '--project', $projectName, '--yes') $script:PreviewStage | Out-Null
    $state.status = 'deploying'
    Save-PreviewState $state
    $deployOutput = Invoke-PreviewVercel @('deploy', '--yes') $script:PreviewStage
    $urls = [regex]::Matches($deployOutput, '(?i)https?://[a-z0-9][a-z0-9.-]*\.vercel\.app')
    if ($urls.Count -eq 0) { throw 'Vercel deployment output did not include a preview URL.' }
    $deploymentUrl = $urls[$urls.Count - 1].Value.TrimEnd('/')
    $inspect = ConvertFrom-PreviewCliJson (Invoke-PreviewVercel @('inspect', $deploymentUrl, '--json') $script:PreviewStage)
    $deploymentId = if ($inspect.id) { [string]$inspect.id } else { [string]$inspect.uid }
    $deploymentDetails = if ($deploymentId) { Invoke-PreviewApi 'GET' "/v13/deployments/$deploymentId" } else { $null }
    if (-not $deploymentId -or -not $deploymentDetails -or $deploymentDetails.projectId -ne $state.projectId) { throw 'Deployment ID or project association could not be verified.' }
    if ($inspect.readyState -and $inspect.readyState -ne 'READY') { throw "Deployment is not ready: $($inspect.readyState)" }

    $previewTarget = if ($deploymentDetails.target) { [string]$deploymentDetails.target } else { [string]$inspect.target }
    if ($previewTarget -ne 'production') {
        Invoke-PreviewVercel @('promote', $deploymentId, '--yes') $script:PreviewStage | Out-Null
    }
    $deploymentInventory = Invoke-PreviewApi 'GET' "/v6/deployments?projectId=$($state.projectId)&limit=100"
    if ($null -eq $deploymentInventory -or $null -ne $deploymentInventory.pagination.next) { throw 'Could not verify the complete Vercel deployment inventory.' }
    $production = @($deploymentInventory.deployments | Where-Object { $_.target -eq 'production' } | Sort-Object -Property createdAt -Descending)
    if ($production.Count -eq 0) { throw 'Vercel did not create a public production alias for the static demo.' }
    $publicDeploymentId = [string]$production[0].uid
    $publicDeploymentDetails = Invoke-PreviewApi 'GET' "/v13/deployments/$publicDeploymentId"
    if (-not $publicDeploymentDetails -or $publicDeploymentDetails.projectId -ne $state.projectId -or $publicDeploymentDetails.target -ne 'production') {
        throw 'Promoted deployment identity or public target could not be verified.'
    }
    $publicDeploymentUrl = 'https://' + ([string]$production[0].url -replace '^https?://', '').TrimEnd('/')
    $publicAlias = "https://$projectName.vercel.app"
    $state.previewDeploymentId = $deploymentId
    $state.previewDeploymentUrl = $deploymentUrl
    if ($deploymentId -ne $publicDeploymentId) {
        $state.previousDeployments = @($state.previousDeployments) + @([PSCustomObject]@{
            deploymentId = $deploymentId
            deploymentUrl = $deploymentUrl
            target = $previewTarget
        })
    }
    $state.deploymentId = $publicDeploymentId
    $state.deploymentUrl = $publicDeploymentUrl
    $state.demoUrl = "$publicAlias/keychecker/"
    $state.deploymentTarget = 'production'
    $state.status = 'deployed-pending-public-check'
    Save-PreviewState $state

    $hostedFiles = [ordered]@{
        'keychecker/index.html' = '/keychecker/'
        'keychecker/app.js' = '/keychecker/app.js'
        'keychecker/styles.css' = '/keychecker/styles.css'
        'keychecker/graph.json' = '/keychecker/graph.json'
    }
    $publicAssetsVerified = $false
    $publicCheckError = $null
    for ($attempt = 1; $attempt -le 12 -and -not $publicAssetsVerified; $attempt++) {
        $publicAssetsVerified = $true
        foreach ($relative in $hostedFiles.Keys) {
            try {
                $cacheBuster = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + '-' + $attempt
                $response = Invoke-WebRequest -Uri "$publicAlias$($hostedFiles[$relative])?codexcheck=$cacheBuster" -UseBasicParsing -TimeoutSec 30
                if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
                $remoteHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes([string]$response.Content))).ToLowerInvariant()
                if ($remoteHash -ne $hashes[$relative]) { throw 'content hash mismatch' }
            } catch {
                $publicAssetsVerified = $false
                $publicCheckError = "Public asset verification is still settling for $relative ($($_.Exception.Message))."
                break
            }
        }
        if (-not $publicAssetsVerified -and $attempt -lt 12) { Start-Sleep -Seconds 2 }
    }
    if (-not $publicAssetsVerified) { throw $publicCheckError }
    $rootResponse = Invoke-WebRequest -Uri $publicAlias -UseBasicParsing -TimeoutSec 30
    if ($rootResponse.StatusCode -ne 200) { throw 'Public root redirect did not return HTTP 200.' }
    $state.status = 'deployed'
    $state.deployedAtUtc = [DateTime]::UtcNow.ToString('o')
    $state.lastError = $null
    Save-PreviewState $state
    Write-Host "Preview ready: $($state.demoUrl)"
    Write-Host "Project: $($state.projectName) ($($state.projectId)); deployment: $($state.deploymentId)"
} catch {
    $state.lastError = ($_.Exception.Message -replace [regex]::Escape($env:VERCEL_TOKEN), '[redacted]')
    Save-PreviewState $state
    throw
}
