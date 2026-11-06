# Chay PoC danh gia Agent bang OpenAI that. Key chi nam trong bien moi truong cua cua so nay,
# khong ghi ra file, khong in ra man hinh. Dong cua so la key mat.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$sec = Read-Host "Dan OpenAI API key (ky tu se bi an), roi Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$env:OPENAI_API_KEY = $env:OPENAI_API_KEY.Trim()
if (-not $env:OPENAI_API_KEY) { Write-Host "Chua nhap key."; exit 1 }
if ($env:OPENAI_API_KEY -notmatch '^sk-[A-Za-z0-9_\-]{20,}$') {
  $k = $env:OPENAI_API_KEY
  $bad = ($k.ToCharArray() | Where-Object { [int]$_ -gt 127 }).Count
  $odd = ($k.ToCharArray() | Where-Object { [int]$_ -le 127 -and $_ -notmatch '[A-Za-z0-9_\-]' } | ForEach-Object { if ($_ -eq ' ') { 'khoang-trang' } elseif ([int]$_ -lt 32) { 'ky-tu-dieu-khien' } else { [string]$_ } } | Sort-Object -Unique) -join ' '
  Write-Host "Key khong dung dinh dang sk-... (do dai $($k.Length), bat dau bang '$($k.Substring(0,[Math]::Min(3,$k.Length)))', $bad ky tu co dau, ky tu la: $odd)."
  Write-Host "Neu dang bat Unikey/EVKey: tat bo go tieng Viet (chuyen sang E) roi dan lai."
  Remove-Item Env:OPENAI_API_KEY; exit 1
}

$mini = "gpt-4o-mini-2024-07-18"
$big  = "gpt-4o-2024-08-06"

Write-Host "`n[1/4] Chay thu 2 ca (Q01, O04) voi $mini de kiem tra key va uoc tinh chi phi..."
node eval/run-session.mjs llm $mini 1 "Q01,O04"
if ($LASTEXITCODE -ne 0) { Write-Host "Chay thu loi. Xem thong bao phia tren (401 = key sai, 404 = model khong co, 429 = het quota)."; exit 1 }

$ok = Read-Host "`nTiep tuc chay day du 45 ca cho ca 2 model? (y/n)"
if ($ok -ne "y") { exit 0 }

Write-Host "`n[2/4] $mini, 45 ca + kiem tra kiem soat..."
node eval/run-session.mjs llm $mini 1
Write-Host "`n[3/4] $big, 45 ca + kiem tra kiem soat..."
node eval/run-session.mjs llm $big 1

$rep = Read-Host "`n[4/4] Chay lap them 2 luot voi $mini de do do on dinh (re, khoang vai cent)? (y/n)"
if ($rep -eq "y") {
  node eval/run-session.mjs llm $mini 2
  node eval/run-session.mjs llm $mini 3
}
Remove-Item Env:OPENAI_API_KEY
Write-Host "`nXONG. Bao lai cho Claude de tong hop ket qua."
