function Remove-LocalRelease {
  param([string]$ProjectRoot, [string]$Release)
  Assert-Release $Release
  $root = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'output/releases'))
  $target = [IO.Path]::GetFullPath((Join-Path $root $Release))
  if (-not (Test-Path -LiteralPath $target)) { return }
  # Resolve and reject every reparse point, including ancestors, before recursive deletion.
  $ancestor = Get-Item -LiteralPath $target -Force
  while ($null -ne $ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unsafe release path: $target" }
    $ancestor = $ancestor.Parent
  }
  if ([IO.Path]::GetDirectoryName($target) -ne $root -or
      (Resolve-Path -LiteralPath $target).Path -ne $target -or
      -not (Test-Path -LiteralPath $target -PathType Container)) { throw 'Release escapes output/releases.' }
  if (Test-Path -LiteralPath (Join-Path $target 'PIN')) { Write-Host "Local PIN: $Release"; return }
  foreach ($item in (Get-ChildItem -LiteralPath $target -Force -Recurse)) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Release contains a link: $($item.FullName)" }
  }
  Remove-Item -LiteralPath $target -Recurse -Force
  Write-Host "Removed local release: $Release"
}

function Invoke-ReleaseRetention {
  param([string]$ProjectRoot, [string]$Remote, [string[]]$SshOptions, [string]$RemoteDir, [string]$Release)
  Assert-Release $Release
  $command = "bash '$RemoteDir/releases/$Release/scripts/server/prune-releases.sh' apply '$RemoteDir' '$Release'"
  $result = @(& ssh @SshOptions $Remote $command)
  $status = $LASTEXITCODE
  $result | Out-Host
  # Even a partial cleanup can report fully removed versions before an I/O failure.
  foreach ($line in $result) {
    if ($line -cmatch '^REMOVED=([a-z0-9][a-z0-9._-]{0,79})$') {
      Remove-LocalRelease $ProjectRoot $Matches[1]
    }
  }
  if ($status -ne 0) { throw "Server cleanup failed (exit $status); deployment remains healthy." }
}

function Invoke-DeployAndRetain {
  [CmdletBinding()]
  param([string]$ProjectRoot, [string]$Remote, [string[]]$SshOptions, [string]$RemoteDir, [string]$Release, [string]$Command)
  Invoke-Checked ssh ($SshOptions + @($Remote, $Command))
  try { Invoke-ReleaseRetention $ProjectRoot $Remote $SshOptions $RemoteDir $Release }
  catch { Write-Warning "Deployment succeeded, but package cleanup needs attention: $_" }
}
