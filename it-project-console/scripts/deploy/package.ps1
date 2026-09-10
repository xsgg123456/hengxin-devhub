function New-ReleasePackage {
  param([string]$ProjectRoot, [string]$Release)
  Assert-Release $Release
  foreach ($tool in @('docker','pnpm','git','tar','node')) { Get-Command $tool -ErrorAction Stop | Out-Null }
  $output = Join-Path $ProjectRoot "output/releases/$Release"
  if (Test-Path -LiteralPath $output) { throw "Release already exists: $Release" }
  $bundle = Join-Path $output 'bundle'
  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  Write-Host 'Running source checks and dependency audit...'
  Invoke-Checked pnpm @('typecheck')
  Invoke-Checked pnpm @('test')
  Invoke-Checked pnpm @('test:release')
  Invoke-Checked pnpm @('--filter','@it-project-console/api','test:integration')
  $audit = (& pnpm audit --prod --json) -join "`n"
  $auditExit = $LASTEXITCODE
  Write-Utf8 (Join-Path $output 'dependency-audit.json') $audit
  $report = $audit | ConvertFrom-Json
  if ($auditExit -notin @(0,1) -or -not $report.metadata -or $null -eq $report.metadata.vulnerabilities.critical) { throw 'Dependency audit unavailable.' }
  if ($report.metadata.vulnerabilities.critical -gt 0) { throw 'Critical dependencies must be fixed before packaging.' }
  Write-Host "Dependency audit: $($report.metadata.vulnerabilities.critical) critical, $($report.metadata.vulnerabilities.high) high (report retained)."
  $apiImage = "itpc-api:$Release"
  $webImage = "itpc-web:$Release"
  Invoke-Checked docker @('build','--platform','linux/amd64','-f','api/Dockerfile','-t',$apiImage,'.')
  Invoke-Checked docker @('build','--platform','linux/amd64','-f','web/Dockerfile','-t',$webImage,'.')
  $bases = @(
    @{ Source='postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94'; Tag='itpc-postgres:16-f1c3376c26f2'; Key='POSTGRES_IMAGE' },
    @{ Source='minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e'; Tag='itpc-minio:14cea493d9a3'; Key='MINIO_IMAGE' },
    @{ Source='minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727'; Tag='itpc-mc:a7fe349ef4bd'; Key='MC_IMAGE' }
  )
  foreach ($base in $bases) {
    & docker image inspect $base.Source *> $null
    if ($LASTEXITCODE -ne 0) { Invoke-Checked docker @('pull','--platform','linux/amd64',$base.Source) }
    Invoke-Checked docker @('tag',$base.Source,$base.Tag)
  }
  # Audit only our runtime payload; third-party packages are covered by dependency audit.
  $auditRoot = Join-Path $output 'payload-audit'
  New-Item -ItemType Directory -Path $auditRoot | Out-Null
  foreach ($kind in @('api','web')) {
    $imageName = if ($kind -eq 'api') { $apiImage } else { $webImage }
    $container = (& docker create $imageName).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create image audit container.' }
    try {
      $source = if ($kind -eq 'api') { '/app/dist' } else { '/usr/share/nginx/html' }
      Invoke-Checked docker @('cp',"${container}:$source",(Join-Path $auditRoot $kind))
      if ($kind -eq 'api') { Invoke-Checked docker @('cp',"${container}:/app/prisma",(Join-Path $auditRoot 'prisma')) }
    } finally { Invoke-Checked docker @('rm',$container) }
  }
  Invoke-Checked node @('scripts/deploy/audit-payload.mjs',$auditRoot)
  New-Item -ItemType Directory -Path (Join-Path $bundle 'scripts/server') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $ProjectRoot 'compose.production.yaml') -Destination $bundle
  New-Item -ItemType Directory -Path (Join-Path $bundle 'deploy') -Force | Out-Null
  Write-Utf8 (Join-Path $bundle 'deploy/public.nginx.conf') ([IO.File]::ReadAllText((Join-Path $ProjectRoot 'deploy/public.nginx.conf')))
  Write-Utf8 (Join-Path $bundle 'dependency-audit.json') $audit
  foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'scripts/server') -File)) {
    if ($file.Extension -notin @('.sh','.mjs','.sql')) { continue }
    Write-Utf8 (Join-Path $bundle "scripts/server/$($file.Name)") ([IO.File]::ReadAllText($file.FullName))
  }
  $migrationHash = Get-MigrationHash $ProjectRoot
  $releaseEnv = @("RELEASE=$Release", "API_IMAGE=$apiImage", "WEB_IMAGE=$webImage", "MIGRATION_HASH=$migrationHash",
    "DEPENDENCY_AUDIT_HIGH=$($report.metadata.vulnerabilities.high)", "DEPENDENCY_AUDIT_CRITICAL=$($report.metadata.vulnerabilities.critical)")
  $releaseEnv += $bases | ForEach-Object { "$($_.Key)=$($_.Tag)" }
  Write-Utf8 (Join-Path $bundle 'release.env') (($releaseEnv -join "`n") + "`n")
  $images = @($apiImage,$webImage) + @($bases | ForEach-Object { $_.Tag })
  $imageRecords = foreach ($name in $images) {
    $details = ((& docker image inspect $name) -join "`n" | ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0 -or $details.Architecture -ne 'amd64') { throw "Wrong image architecture: $name" }
    @{ name=$name; id=$details.Id; architecture=$details.Architecture }
  }
  $revision = (& git rev-parse HEAD).Trim()
  $dirty = [bool]((& git status --porcelain -- .) -join '')
  $manifest = @{ release=$Release; gitRevision=$revision; dirty=$dirty; migrationHash=$migrationHash;
    createdAt=[DateTime]::UtcNow.ToString('o'); images=@($imageRecords); formatVersion=1 }
  Write-Utf8 (Join-Path $bundle 'manifest.json') ($manifest | ConvertTo-Json -Depth 6)
  Invoke-Checked docker (@('save','-o',(Join-Path $bundle 'images.tar')) + $images)
  $checksums = foreach ($file in (Get-ChildItem -LiteralPath $bundle -File -Recurse | Sort-Object FullName)) {
    $relative = [IO.Path]::GetRelativePath($bundle,$file.FullName).Replace('\','/')
    "$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
  }
  Write-Utf8 (Join-Path $bundle 'SHA256SUMS') (($checksums -join "`n") + "`n")
  $archive = Join-Path $output "itpc-$Release.tar.gz"
  Invoke-Checked tar @('-czf',$archive,'-C',$bundle,'.')
  Write-Utf8 "$archive.sha256" "$((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($archive))`n"
  Write-Host 'Package completed; no server changes were made.'
  if ($report.metadata.vulnerabilities.high -gt 0) { Write-Warning 'This verification package is blocked from production Deploy until high-severity dependency findings are resolved.' }
  return $archive
}
