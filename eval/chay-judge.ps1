# Cham doc lap dau ra Agent bang gpt-4o (khoang 1 USD). Key chi nam trong cua so nay.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$sec = Read-Host "Dan OpenAI API key (tat Unikey truoc), roi Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$env:OPENAI_API_KEY = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($env:OPENAI_API_KEY -notmatch '^sk-[A-Za-z0-9_\-]{20,}$') { Write-Host "Key khong dung dinh dang sk-..."; Remove-Item Env:OPENAI_API_KEY; exit 1 }
$runs = "D:\N$([char]0x103)m 3\System Architecture\sms-web\bai-lam\poc-ai\runs"
foreach ($s in @("mock-r1", "gpt-4o-mini-2024-07-18-r1", "gpt-4o-2024-08-06-r1")) {
  if (Test-Path "$runs\$s\result.json") { Write-Host "`n== Cham $s"; node eval/judge.mjs "$runs\$s" gpt-4o-2024-08-06 }
}
Remove-Item Env:OPENAI_API_KEY
Write-Host "`nXONG. Bao lai cho Claude."
