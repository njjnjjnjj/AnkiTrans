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
        id                 = "ankitrans@example.com"
        strict_min_version = "109.0"
    }
}

$jsonContent | Add-Member -MemberType NoteProperty -Name "browser_specific_settings" -Value $firefoxSettings

# Save new manifest to dist
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content "$distDir\manifest.json"

Write-Host "Firefox extension package created in '$distDir'"
Write-Host "Manifest.json adapted with browser_specific_settings."
