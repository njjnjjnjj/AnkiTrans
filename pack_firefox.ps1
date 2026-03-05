$ErrorActionPreference = "Stop"

$distDir = "dist-firefox"
$chromeManifest = "manifest.json"

# Clean up previous build
if (Test-Path $distDir) {
    Remove-Item $distDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Files and folders to copy
$itemsToCopy = @(
    "background",
    "content",
    "icons",
    "lib",
    "options",
    "popup",
    "README.md",
    "LICENSE"
)

# Copy common files
foreach ($item in $itemsToCopy) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $distDir -Recurse
    }
    else {
        Write-Warning "Item not found: $item"
    }
}

# --- Dynamic Manifest Generation ---
Write-Host "Reading manifest.json..."
$jsonContent = Get-Content $chromeManifest -Raw | ConvertFrom-Json

# inject Firefox specific settings
# Note: Firefox MV3 supports service_worker, so we can keep background definition
# We just need to add the gecko ID for signing/installation stability
$firefoxSettings = @{
    gecko = @{
        id                          = "ankitrans@example.com"
        strict_min_version          = "109.0"
        data_collection_permissions = @{
            required = @("none")
        }
    }
}

$jsonContent | Add-Member -MemberType NoteProperty -Name "browser_specific_settings" -Value $firefoxSettings

# 添加 Firefox 所需的 background.scripts 兼容支持
if ($jsonContent.background -and $jsonContent.background.service_worker) {
    $jsonContent.background | Add-Member -MemberType NoteProperty -Name "scripts" -Value @($jsonContent.background.service_worker)
}

# Save new manifest to dist
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content "$distDir\manifest.json"

Write-Host "Firefox extension files copied to '$distDir'"
Write-Host "Manifest.json adapted with browser_specific_settings."

# 创建 zip 压缩包
$zipName = "AnkiTrans.zip"
$destZip = Join-Path (Get-Location) $zipName

if (Test-Path $destZip) {
    Remove-Item $destZip -Force
}

Write-Host "Compressing to $zipName..."

Write-Host "Compressing to $zipName..."
# Use NodeJS wrapper to enforce POSIX slashes in ZIP as required by Mozilla AMO
node scripts\pack_firefox.js

Write-Host "Firefox extension package successfully created: $zipName" -ForegroundColor Green
