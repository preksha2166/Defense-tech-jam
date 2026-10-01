<#
    Stage the runtime files into .\public and publish to Cloudflare.

    PowerShell twin of deploy.sh, because Git for Windows installs bash but
    does not put it on PATH, so `bash deploy.sh` fails from a normal
    PowerShell prompt.

    Run `wrangler login` once first.

        .\deploy.ps1            stage and publish
        .\deploy.ps1 -StageOnly just build .\public, do not upload

    -StageOnly is what Cloudflare Pages should run as its build command if
    you wire the GitHub repo to Pages instead of deploying from here.
#>
param([switch]$StageOnly)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$pub = Join-Path $PSScriptRoot 'public'
if (Test-Path $pub) { Remove-Item $pub -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pub, "$pub\vendor" | Out-Null

# --- code ---
Copy-Item index.html, style.css -Destination $pub
Copy-Item *.js -Destination $pub
Copy-Item vendor\three.min.js -Destination "$pub\vendor"

<# Binary assets. The game is otherwise fully procedural, but the title key
   art, the score and the intro film live on disk. Without these the title
   screen falls back to its typed heading and the intro falls back to the
   typed briefing — both still work, but neither is what you want in front
   of judges. #>
foreach ($d in 'art', 'audio') {
    if (Test-Path $d) {
        New-Item -ItemType Directory -Force -Path "$pub\$d" | Out-Null
        Copy-Item "$d\*" -Destination "$pub\$d" -Recurse
    }
}

# Only the served cut of the film, never the pre-faststart original.
if (Test-Path 'video\atlas-intro.mp4') {
    New-Item -ItemType Directory -Force -Path "$pub\video" | Out-Null
    Copy-Item 'video\atlas-intro.mp4' -Destination "$pub\video"
}

$files = Get-ChildItem $pub -Recurse -File
$mb    = [math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 1)
"staged $($files.Count) files into .\public  ($mb MB)"

# Cloudflare Pages rejects any single file over 25 MiB, so say so here
# rather than letting the upload fail halfway.
$big = $files | Where-Object { $_.Length -gt 25MB }
if ($big) {
    "WARNING - over Cloudflare's 25 MB per-file limit:"
    $big | ForEach-Object { "  {0:N1} MB  {1}" -f ($_.Length/1MB), $_.Name }
}

if ($StageOnly) { "stage only - not publishing"; exit 0 }

$wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
if (-not $wrangler) {
    "wrangler not found. Install it with:  npm install -g wrangler"
    exit 1
}
& wrangler deploy
