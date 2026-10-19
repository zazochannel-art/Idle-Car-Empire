# Idle Car Empire - creeaza cheia de semnare pentru Google Play (upload key) PE ACEST
# CALCULATOR si o pune in GitHub. Cheia si parola nu pleaca nicaieri altundeva.
#
# Rulare: click dreapta pe fisier -> "Run with PowerShell"
#   (sau, intr-o fereastra PowerShell: powershell -ExecutionPolicy Bypass -File .\make-upload-key.ps1)
#
# Ce face:
#   1. gaseste keytool (vine cu Android Studio sau cu orice Java JDK);
#   2. alege o parola lunga, aleatoare;
#   3. creeaza Documents\IdleCarEmpire-upload-key\idle-car-empire-upload.jks si, langa ea,
#      CITESTE-MA.txt cu parola (pastreaza-le pe amandoua in siguranta!);
#   4. pune cele 4 secrete in GitHub: singur, daca ai GitHub CLI (gh) conectat, altfel te
#      ghideaza pas cu pas (copiaza fiecare valoare in clipboard si deschide pagina).
# Nu suprascrie niciodata o cheie existenta.

$ErrorActionPreference = "Stop"
$Repo = "zazochannel-art/Idle-Car-Empire"
$Alias = "upload"
$Dir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "IdleCarEmpire-upload-key"
$Jks = Join-Path $Dir "idle-car-empire-upload.jks"
$Notes = Join-Path $Dir "CITESTE-MA.txt"

function Stop-WithMessage($text) {
  Write-Host ""
  Write-Host $text -ForegroundColor Red
  Read-Host "Apasa Enter ca sa inchizi"
  exit 1
}

# 1. keytool
$keytool = $null
$candidates = @(
  (Join-Path $env:ProgramFiles "Android\Android Studio\jbr\bin\keytool.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr\bin\keytool.exe")
)
if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME "bin\keytool.exe") }
foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { $keytool = $c; break } }
if (-not $keytool) {
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if ($cmd) { $keytool = $cmd.Source }
}
if (-not $keytool) {
  Stop-WithMessage "Nu gasesc keytool. Instaleaza Android Studio (https://developer.android.com/studio) sau Java (https://adoptium.net), apoi ruleaza scriptul din nou."
}
Write-Host "keytool: $keytool"

if (Test-Path $Jks) {
  Stop-WithMessage "Exista deja o cheie: $Jks`nNu o suprascriu (o cheie noua ar insemna alta semnatura). Daca vrei totusi una noua, muta intai folderul in alta parte."
}
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# 2. o parola aleatoare de 32 de caractere (litere si cifre)
$alphabet = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$Password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })

# 3. cheia
& $keytool -genkeypair -keystore $Jks -storetype PKCS12 -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass $Password -keypass $Password -dname "CN=Idle Car Empire, O=zazochannel-art"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Jks)) { Stop-WithMessage "keytool nu a reusit sa creeze cheia." }

@"
Idle Car Empire - cheia de semnare pentru Google Play (upload key)

Fisier:  idle-car-empire-upload.jks
Alias:   $Alias
Parola:  $Password   (aceeasi pentru keystore si pentru cheie)
Creata:  $(Get-Date -Format "yyyy-MM-dd HH:mm")

PASTREAZA acest folder in doua locuri sigure (de ex. un manager de parole si un stick USB).
NU il trimite nimanui, nu-l pune in chat, pe email sau in repository.
Daca se pierde, Google Play poate reseta cheia de upload (Play Console -> App signing),
dar dureaza cateva zile.
"@ | Set-Content -Path $Notes -Encoding UTF8

Write-Host ""
Write-Host "Cheia e gata: $Jks" -ForegroundColor Green
Write-Host "Parola e in: $Notes" -ForegroundColor Green

# 4. secretele din GitHub
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Jks))
$secrets = [ordered]@{
  "ANDROID_KEYSTORE_BASE64"   = $b64
  "ANDROID_KEYSTORE_PASSWORD" = $Password
  "ANDROID_KEY_ALIAS"         = $Alias
  "ANDROID_KEY_PASSWORD"      = $Password
}

$done = $false
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
  # Windows PowerShell opreste scriptul la textul pe care gh il scrie pe stderr, cu "Stop"
  $ErrorActionPreference = "Continue"
  & gh auth status 2>&1 | Out-Null
  $ghReady = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = "Stop"
  if ($ghReady) {
    Write-Host ""
    Write-Host "Pun secretele in GitHub cu GitHub CLI..."
    $ok = $true
    foreach ($name in $secrets.Keys) {
      $value = $secrets[$name]
      & gh secret set $name --repo $Repo --body $value
      if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Host "Nu a mers pentru $name" -ForegroundColor Yellow }
    }
    $done = $ok
  }
}

if (-not $done) {
  Write-Host ""
  Write-Host "Acum le pui in GitHub de mana (4 secrete). Se deschide pagina in browser." -ForegroundColor Cyan
  Write-Host "Pentru fiecare: 'New repository secret', Name = numele afisat aici, Secret = Ctrl+V (valoarea e deja copiata), apoi 'Add secret'."
  Start-Process "https://github.com/$Repo/settings/secrets/actions/new"
  foreach ($name in $secrets.Keys) {
    $value = $secrets[$name]
    Set-Clipboard -Value $value
    Write-Host ""
    Write-Host "Name:  $name" -ForegroundColor Yellow
    Write-Host "(valoarea e in clipboard)"
    Read-Host "Dupa ce ai apasat 'Add secret', apasa Enter aici pentru urmatorul"
  }
  Set-Clipboard -Value " "
}

Write-Host ""
Write-Host "Gata. Urmatorul build Android de pe main va fi semnat (in log: 'release bundle: SIGNED')." -ForegroundColor Green
Write-Host "Nu uita sa faci copii de siguranta ale folderului: $Dir" -ForegroundColor Green
Read-Host "Apasa Enter ca sa inchizi"
