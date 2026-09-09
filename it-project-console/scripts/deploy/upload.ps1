function Send-ReleasePackage {
  param([string]$Archive, [string]$Remote, [string]$RemoteDir, [int]$Port, [string]$IdentityFile)
  $name = [IO.Path]::GetFileName($Archive)
  if ($name -notmatch '^itpc-([a-z0-9][a-z0-9._-]{0,79})\.tar\.gz$') { throw 'Invalid package filename.' }
  $release = $Matches[1]
  Assert-Release $release
  $expected = ([IO.File]::ReadAllText("$Archive.sha256")).Split(' ')[0]
  if ($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Package checksum mismatch.' }
  $sshOptions = @(Get-SshArguments $Port $IdentityFile)
  $scpOptions = @(Get-SshArguments $Port $IdentityFile -Scp)
  Invoke-Checked ssh ($sshOptions + @($Remote, "set -eu; umask 077; test ! -L '$RemoteDir'; test ! -L '$RemoteDir/incoming'; test ! -L '$RemoteDir/releases'; mkdir -p '$RemoteDir/incoming' '$RemoteDir/releases'; test `"`$(readlink -f '$RemoteDir')`" = '$RemoteDir'"))
  # SCP avoids PowerShell's binary pipeline conversion; remote checksum is independent.
  Invoke-Checked scp ($scpOptions + @($Archive, "${Remote}:$RemoteDir/incoming/$name"))
  $command = @"
set -eu
umask 077
cd '$RemoteDir/incoming'
printf '%s  %s\n' '$expected' '$name' | sha256sum -c -
test ! -L '$RemoteDir/releases/$release'
if test -e '$RemoteDir/releases/$release'; then
  test -f '$RemoteDir/releases/$release/.archive-sha256'
  test "`$(cat '$RemoteDir/releases/$release/.archive-sha256')" = '$expected'
  exit 0
fi
# Reject archive traversal and links before extraction, even for a local supplied package.
tar -tzf '$name' | awk '/(^\/|(^|\/)\.\.($|\/))/ {bad=1} END {exit bad}'
test -z "`$(tar -tvzf '$name' | awk 'substr(`$0,1,1)!="-" && substr(`$0,1,1)!="d" {print}')"
stage=`$(mktemp -d '$RemoteDir/incoming/.extract.XXXXXX')
trap 'rm -rf -- "`$stage"' EXIT
tar --no-same-owner -xzf '$name' -C "`$stage"
cd "`$stage"
sha256sum -c SHA256SUMS >/dev/null
printf '%s\n' '$expected' > .archive-sha256
mv -T "`$stage" '$RemoteDir/releases/$release'
trap - EXIT
"@
  Invoke-Checked ssh ($sshOptions + @($Remote, ($command -replace "`r`n", "`n")))
  return $release
}
