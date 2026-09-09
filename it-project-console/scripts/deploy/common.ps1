Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  param([string]$Executable, [string[]]$Arguments)
  & $Executable @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE)." }
}

function Write-Utf8 {
  param([string]$Path, [string]$Text)
  [IO.File]::WriteAllText($Path, ($Text -replace "`r`n", "`n"), [Text.UTF8Encoding]::new($false))
}

function Assert-Release {
  param([string]$Release)
  if ($Release -notmatch '^[a-z0-9][a-z0-9._-]{0,79}$' -or $Release.Contains('..')) {
    throw 'Invalid release ID.'
  }
}

function Get-MigrationHash {
  param([string]$ProjectRoot)
  $migrationRoot = Join-Path $ProjectRoot 'api/prisma/migrations'
  $parts = foreach ($file in (Get-ChildItem -LiteralPath $migrationRoot -File -Recurse | Sort-Object FullName)) {
    $relative = [IO.Path]::GetRelativePath($migrationRoot, $file.FullName).Replace('\', '/')
    "$relative`n$(([IO.File]::ReadAllText($file.FullName) -replace "`r`n", "`n"))"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Get-SshArguments {
  param([int]$Port, [string]$IdentityFile, [switch]$Scp)
  $options = @('-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15')
  if ($Scp) { $options += @('-P', "$Port") } else { $options += @('-p', "$Port") }
  if ($IdentityFile) { $options += @('-i', (Resolve-Path -LiteralPath $IdentityFile).Path, '-o', 'IdentitiesOnly=yes') }
  return $options
}
