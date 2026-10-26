param(
  [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [Parameter(Mandatory=$true)][string]$Notes
)
$ErrorActionPreference = 'Stop'
$frontendRoot = Split-Path $PSScriptRoot
$projectRoot = Split-Path $frontendRoot
$keyPath = Join-Path $projectRoot '.build-tools/signing/pati.key'
if (!(Test-Path $keyPath)) { throw 'Missing updater signing key. Restore the original key before building releases.' }
$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
if (Test-Path (Join-Path $projectRoot '.build-tools/cargo/bin/cargo.exe')) {
  $env:RUSTUP_HOME = Join-Path $projectRoot '.build-tools/rustup'
  $env:CARGO_HOME = Join-Path $projectRoot '.build-tools/cargo'
  $env:PATH = "$env:CARGO_HOME/bin;$env:PATH"
}
Push-Location $frontendRoot
try {
  $configPath = Join-Path $frontendRoot 'src-tauri/tauri.conf.json'
  $config = Get-Content -Raw $configPath | ConvertFrom-Json
  $config.version = $Version
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20))
  $cargoPath = Join-Path $frontendRoot 'src-tauri/Cargo.toml'
  $cargo = [IO.File]::ReadAllText($cargoPath)
  $cargo = [regex]::Replace($cargo, '(?m)^version = "[^"]+"', "version = `"$Version`"")
  [IO.File]::WriteAllText($cargoPath, $cargo)
  npm.cmd version $Version --no-git-tag-version --allow-same-version
  if ($LASTEXITCODE -ne 0) { throw 'Package version update failed' }
  npm.cmd run tauri -- build
  if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
  $bundle = Join-Path $frontendRoot "src-tauri/target/release/bundle/nsis/pati_${Version}_x64-setup.exe"
  $signature = (Get-Content -Raw "$bundle.sig").Trim()
  $release = Join-Path $projectRoot "artifacts/releases/$Version"
  New-Item -ItemType Directory -Force $release | Out-Null
  $name = "pati_${Version}_x64-setup.exe"
  Copy-Item -LiteralPath $bundle -Destination (Join-Path $release $name)
  Copy-Item -LiteralPath "$bundle.sig" -Destination (Join-Path $release "$name.sig")
  $manifest = @{ version=$Version; notes=$Notes; pub_date=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); platforms=@{
    'windows-x86_64'=@{ url="https://31-172-67-27.sslip.io/updates/$Version/$name"; signature=$signature }
  }}
  [IO.File]::WriteAllText((Join-Path $release 'latest.json'), ($manifest | ConvertTo-Json -Depth 8))
  Write-Output "Signed release ready: $release"
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  Pop-Location
}
