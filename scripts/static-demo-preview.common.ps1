$ErrorActionPreference = 'Stop'
$script:PreviewRoot = Split-Path -Parent $PSScriptRoot
$script:PreviewLedger = Join-Path $script:PreviewRoot '.codex\task-ledgers\preview-redesign.md'
$script:PreviewScope = 'nathanpannells-projects'
$script:PreviewAccount = 'nathanpannell'
$script:PreviewBaseName = 'review-redesign-demo'
$script:PreviewStageParent = Join-Path ([IO.Path]::GetTempPath()) 'codex-review-redesign-static-preview'
$script:PreviewStage = Join-Path $script:PreviewStageParent 'payload'
$script:PreviewMarker = Join-Path $script:PreviewStageParent '.codex-static-preview-owner'
$script:PreviewStateStart = '<!-- lifecycle-state:begin -->'
$script:PreviewStateEnd = '<!-- lifecycle-state:end -->'

function Invoke-PreviewVercel([string[]]$Arguments, [string]$Cwd) {
    $argsForCli = @('--no-color', '--scope', $script:PreviewScope)
    if ($Cwd) { $argsForCli += @('--cwd', $Cwd) }
    $argsForCli += $Arguments
    $lines = @(& vercel @argsForCli 2>&1 | ForEach-Object { [string]$_ })
    if ($LASTEXITCODE -ne 0) { throw "Vercel CLI failed (exit $LASTEXITCODE). $(($lines -join "`n") -replace [regex]::Escape($env:VERCEL_TOKEN), '[redacted]')" }
    return ($lines -join "`n")
}

function ConvertFrom-PreviewCliJson([string]$Text) {
    $start = $Text.IndexOf('{')
    $end = $Text.LastIndexOf('}')
    if ($start -lt 0 -or $end -lt $start) { throw 'Vercel CLI did not return JSON.' }
    return $Text.Substring($start, $end - $start + 1) | ConvertFrom-Json
}

function Assert-PreviewIdentity {
    if (-not $env:VERCEL_TOKEN) { throw 'VERCEL_TOKEN is not available to this PowerShell process.' }
    $identityText = Invoke-PreviewVercel @('whoami') $null
    if (-not $identityText.Trim().EndsWith($script:PreviewAccount, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Authenticated Vercel account does not match '$($script:PreviewAccount)'."
    }
}

function Get-PreviewProjects {
    $data = ConvertFrom-PreviewCliJson (Invoke-PreviewVercel @('project', 'list', '--json') $null)
    if ($null -ne $data.pagination.next) { throw 'Vercel project inventory is paginated; refusing to act on a partial list.' }
    return @($data.projects)
}

function Read-PreviewState {
    $content = [IO.File]::ReadAllText($script:PreviewLedger)
    $start = $content.IndexOf($script:PreviewStateStart)
    $end = $content.IndexOf($script:PreviewStateEnd)
    if ($start -lt 0 -or $end -le $start) { throw 'Lifecycle state markers are missing from the preview ledger.' }
    $jsonStart = $start + $script:PreviewStateStart.Length
    return $content.Substring($jsonStart, $end - $jsonStart).Trim() | ConvertFrom-Json
}

function Save-PreviewState($State) {
    $content = [IO.File]::ReadAllText($script:PreviewLedger)
    $start = $content.IndexOf($script:PreviewStateStart)
    $end = $content.IndexOf($script:PreviewStateEnd)
    if ($start -lt 0 -or $end -le $start) { throw 'Lifecycle state markers are missing from the preview ledger.' }
    $before = $content.Substring(0, $start + $script:PreviewStateStart.Length)
    $after = $content.Substring($end)
    $json = $State | ConvertTo-Json -Depth 8
    $updated = $before + "`r`n" + $json + "`r`n" + $after
    $temp = "$($script:PreviewLedger).tmp"
    [IO.File]::WriteAllText($temp, $updated, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $script:PreviewLedger -Force
}

function Invoke-PreviewApi([string]$Method, [string]$Path) {
    $separator = if ($Path.Contains('?')) { '&' } else { '?' }
    $uri = 'https://api.vercel.com' + $Path + $separator + 'slug=' + [uri]::EscapeDataString($script:PreviewScope)
    $headers = @{ Authorization = "Bearer $($env:VERCEL_TOKEN)" }
    try { return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' }
    catch {
        $status = if ($_.Exception.Response.StatusCode) { [int]$_.Exception.Response.StatusCode } else { 0 }
        if ($status -eq 404) { return $null }
        throw "Vercel API request failed with status $status. Response details were suppressed."
    }
    finally { $headers.Clear() }
}
