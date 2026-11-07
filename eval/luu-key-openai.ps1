# Luu OpenAI API key vao .env.local cua web (file nay da nam trong .gitignore, khong len GitHub).
# Key khong hien tren man hinh. Chay lai script nay de thay key moi.
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repo ".env.local"
$sec = Read-Host "Dan OpenAI API key (TAT Unikey truoc), roi Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$key = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($key -notmatch '^sk-[A-Za-z0-9_\-]{20,}$') { Write-Host "Key khong dung dinh dang sk-... Chua luu gi."; exit 1 }

# Kiem tra key bang 1 request mien phi (liet ke model), khong tinh token.
try {
  $r = Invoke-RestMethod -Uri "https://api.openai.com/v1/models" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 30
  $ids = $r.data.id
  Write-Host ("Key hop le. Co gpt-4o-mini-2024-07-18: " + ($ids -contains "gpt-4o-mini-2024-07-18") + ", gpt-4o-2024-08-06: " + ($ids -contains "gpt-4o-2024-08-06"))
} catch { Write-Host "OpenAI tu choi key: $($_.Exception.Message). Chua luu gi."; exit 1 }

$lines = @()
if (Test-Path $envFile) { $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*OPENAI_API_KEY\s*=' }) }
$lines += "OPENAI_API_KEY=$key"
[IO.File]::WriteAllLines($envFile, $lines)
$key = $null
Write-Host "Da luu vao .env.local. Bao lai cho Claude."
