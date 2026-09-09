# Adapted from itpd-main/scripts/deploy/publish-to-host.ps1.
# Secrets stay on the server. SSH prompts normally unless a key is supplied.
[CmdletBinding()]
param(
  [ValidateSet('Package','Upload','Initialize','Deploy','Status','Rollback')]
  [string]$Action = 'Package',
  [string]$Release = '',
  [string]$BundlePath = '',
  [string]$TargetHost = '192.168.1.245',
  [string]$TargetUser = 'root',
  [ValidateRange(1,65535)][int]$SshPort = 22,
  [string]$RemoteDir = '/opt/it-project-console',
  [string]$IdentityFile = '',
  [string]$BootstrapAdminDingUserId = ''
)
. "$PSScriptRoot/common.ps1"
. "$PSScriptRoot/package.ps1"
. "$PSScriptRoot/upload.ps1"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
if ($TargetHost -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$' -or $TargetUser -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid SSH destination.' }
if ($RemoteDir -ne '/opt/it-project-console') { throw 'The supported production root is /opt/it-project-console.' }
if ($BootstrapAdminDingUserId -and $BootstrapAdminDingUserId -notmatch '^[a-zA-Z0-9_.-]{1,128}$') { throw 'Invalid administrator DingTalk user ID.' }
$sshOptions = @(Get-SshArguments $SshPort $IdentityFile)
$remote = "${TargetUser}@${TargetHost}"

Push-Location $projectRoot
try {
  if ($Action -in @('Status','Rollback')) {
    # Fixed validated paths; no passwords or environment values enter command strings.
    $mode = $Action.ToLowerInvariant()
    $command = "if test -L '$RemoteDir/pending'; then bash '$RemoteDir/pending/scripts/server/deploy-bundle.sh' '$mode' '$RemoteDir'; elif test -L '$RemoteDir/current'; then bash '$RemoteDir/current/scripts/server/deploy-bundle.sh' '$mode' '$RemoteDir'; else echo 'No deployed release yet.'; exit 1; fi"
    Invoke-Checked ssh ($sshOptions + @($remote, $command))
    return
  }
  if (-not $BundlePath) {
    if (-not $Release) {
      $revision = (& git rev-parse --short=8 HEAD).Trim()
      if ($LASTEXITCODE -ne 0) { throw 'Unable to determine Git revision.' }
      $Release = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$revision"
    }
    Assert-Release $Release
    $BundlePath = New-ReleasePackage $projectRoot $Release
  }
  $archive = (Resolve-Path -LiteralPath $BundlePath).Path
  if ($Action -eq 'Package') { Write-Host "Release package: $archive"; return }
  $uploadedRelease = Send-ReleasePackage $archive $remote $RemoteDir $SshPort $IdentityFile
  if ($Action -eq 'Upload') { Write-Host "Uploaded release: $uploadedRelease"; return }
  $mode = if ($Action -eq 'Initialize') { 'init-config' } else { 'deploy' }
  $command = "bash '$RemoteDir/releases/$uploadedRelease/scripts/server/deploy-bundle.sh' '$mode' '$RemoteDir' '$uploadedRelease'"
  if ($Action -eq 'Initialize') { $command += " '$BootstrapAdminDingUserId'" }
  Invoke-Checked ssh ($sshOptions + @($remote, $command))
} finally { Pop-Location }
