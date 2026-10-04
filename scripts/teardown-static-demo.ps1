param(
    [switch]$Apply,
    [string]$ConfirmProjectName
)
. (Join-Path $PSScriptRoot 'static-demo-preview.common.ps1')

$state = Read-PreviewState
if ($state.status -in @('planned', 'teardown-complete')) {
    Write-Host "Nothing to tear down. Lifecycle state is '$($state.status)'."
    return
}
if (-not $state.projectName -or -not $state.projectId) { throw 'Ledger has no exact project identity; refusing provider cleanup.' }
if ($state.vercelAccount -ne $script:PreviewAccount -or $state.vercelScope -ne $script:PreviewScope) {
    throw 'Ledger provider account or scope does not match this teardown script.'
}

if (-not $Apply) {
    Write-Host 'Plan only. No provider resources were changed.'
    Write-Host "Project to remove: $($state.projectName) ($($state.projectId))"
    Write-Host "Recorded deployment: $($state.deploymentId) at $($state.deploymentUrl)"
    Write-Host "After review, run with -Apply -ConfirmProjectName $($state.projectName)."
    return
}
if ($ConfirmProjectName -cne [string]$state.projectName) { throw 'Pass -ConfirmProjectName with the exact ledger project name to remove it.' }
Assert-PreviewIdentity

$projects = Get-PreviewProjects
$match = @($projects | Where-Object { $_.id -eq $state.projectId })
if ($match.Count -ne 1 -or $match[0].name -ne $state.projectName) { throw 'Vercel project inventory does not match the recorded project identity.' }

$settings = Invoke-PreviewApi 'GET' "/v9/projects/$($state.projectId)"
if ($null -eq $settings -or $settings.id -ne $state.projectId -or $settings.name -ne $state.projectName) {
    throw 'Vercel API project identity does not match the ledger.'
}
if ($settings.link) { throw 'Project has a Git integration; refusing to delete it.' }
$deploymentsResponse = Invoke-PreviewApi 'GET' "/v6/deployments?projectId=$($state.projectId)&limit=100"
if ($null -eq $deploymentsResponse -or $null -ne $deploymentsResponse.pagination.next) {
    throw 'Could not verify a complete deployment inventory for the project.'
}
$ownedDeploymentIds = @($state.previousDeployments | ForEach-Object { [string]$_.deploymentId }) + @([string]$state.previewDeploymentId) + @([string]$state.deploymentId)
$ownedDeploymentIds = @($ownedDeploymentIds | Where-Object { $_ } | Sort-Object -Unique)
$unownedDeployments = @($deploymentsResponse.deployments | Where-Object { $ownedDeploymentIds -notcontains [string]$_.uid -and $ownedDeploymentIds -notcontains [string]$_.id })
if ($unownedDeployments.Count -gt 0) { throw 'Project contains deployments absent from the lifecycle ledger; refusing deletion.' }
if ($state.deploymentId) {
    $deployment = Invoke-PreviewApi 'GET' "/v13/deployments/$($state.deploymentId)"
    if ($deployment -and ($deployment.id -ne $state.deploymentId -or $deployment.projectId -ne $state.projectId)) {
        throw 'Recorded deployment is associated with a different project; refusing teardown.'
    }
}

if (-not $state.deploymentId) { throw 'No deployment ID is recorded; refusing project deletion until deployment ownership is reviewed.' }
$state.status = 'tearing-down'
$state.teardownStartedAtUtc = [DateTime]::UtcNow.ToString('o')
Save-PreviewState $state
Invoke-PreviewApi 'DELETE' "/v9/projects/$($state.projectId)" | Out-Null

$absentObservations = 0
for ($attempt = 1; $attempt -le 6 -and $absentObservations -lt 3; $attempt++) {
    $stillListed = @(Get-PreviewProjects | Where-Object { $_.id -eq $state.projectId }).Count -gt 0
    $stillExists = $null -ne (Invoke-PreviewApi 'GET' "/v9/projects/$($state.projectId)")
    $deploymentExists = $null -ne (Invoke-PreviewApi 'GET' "/v13/deployments/$($state.deploymentId)")
    $urlExists = $false
    try {
        $response = Invoke-WebRequest -Uri $state.demoUrl -UseBasicParsing -TimeoutSec 20
        $urlExists = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        $httpStatus = if ($_.Exception.Response.StatusCode) { [int]$_.Exception.Response.StatusCode } else { 0 }
        if ($httpStatus -notin @(404, 410)) { throw "Preview URL absence could not be verified (HTTP $httpStatus)." }
    }
    if (-not $stillListed -and -not $stillExists -and -not $deploymentExists -and -not $urlExists) { $absentObservations++ }
    else { $absentObservations = 0 }
    if ($absentObservations -lt 3) { Start-Sleep -Seconds 2 }
}
if ($absentObservations -lt 3) { throw 'Stable Vercel project, deployment, and URL absence was not verified. Ledger remains in tearing-down state.' }

$state.status = 'teardown-complete'
$state.teardownCompletedAtUtc = [DateTime]::UtcNow.ToString('o')
Save-PreviewState $state
if ((Test-Path -LiteralPath $script:PreviewMarker -PathType Leaf) -and
    [IO.File]::ReadAllText($script:PreviewMarker).Trim() -eq 'reView static preview staging owned by Codex') {
    $expected = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'codex-review-redesign-static-preview'))
    if ([IO.Path]::GetFullPath($script:PreviewStageParent).Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $script:PreviewStageParent -Recurse -Force
    }
}
Write-Host "Vercel static preview removed and absence verified: $($state.projectName) ($($state.projectId))."
