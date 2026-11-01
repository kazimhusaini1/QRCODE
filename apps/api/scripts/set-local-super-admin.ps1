$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) {
  $nodeExe = $nodeCommand.Source
} else {
  $nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js was not found. Install Node.js 20.18 or newer, then retry.' }

if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'mysql://mahalla:local_mahalla_password@localhost:3306/mahalla' }
$env:LOCAL_SUPER_ADMIN_EMAIL = 'kazim@gmail.com'
$env:LOCAL_SUPER_ADMIN_NAME = 'Kazim'
$securePassword = Read-Host 'Enter a NEW super-admin password (at least 14 characters)' -AsSecureString
if ($securePassword.Length -lt 14) { throw 'Password must contain at least 14 characters. No database changes were made.' }

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:LOCAL_SUPER_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $tsxCli = Join-Path $PSScriptRoot '..\node_modules\tsx\dist\cli.mjs'
  & $nodeExe $tsxCli (Join-Path $PSScriptRoot 'set-local-super-admin.ts')
  if ($LASTEXITCODE -ne 0) { throw 'Super-admin setup failed; see the error above.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Item Env:LOCAL_SUPER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_SUPER_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:LOCAL_SUPER_ADMIN_NAME -ErrorAction SilentlyContinue
}
