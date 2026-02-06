# AnkiTrans Packaging Script
$version = (Get-Content "manifest.json" | ConvertFrom-Json).version
$zipName = "AnkiTrans_v$version.zip"
$exclude = @(
    "*.git*",
    "*.vscode*",
    "pack_extension.ps1",
    "test_*.js",
    "bing_fetch.html",
    "*.zip",
    ".DS_Store"
)

Write-Host "Packaging AnkiTrans v$version..."

# Get all files excluding the patterns
$files = Get-ChildItem -Path . -Recurse | Where-Object {
    $path = $_.FullName
    $relPath = $path.Substring((Get-Location).Path.Length + 1)
    
    # Check if file matches any exclude pattern
    $shouldExclude = $false
    foreach ($pattern in $exclude) {
        if ($relPath -like $pattern -or $relPath -match "\\.git") {
            $shouldExclude = $true
            break
        }
    }
    
    -not $shouldExclude -and -not $_.PSIsContainer
}

# Create temp directory
$tempDir = Join-Path $env:TEMP ("AnkiTrans_Deepmind_Build_" + (Get-Random))
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# Copy files
foreach ($file in $files) {
    try {
        $relPath = $file.FullName.Substring((Get-Location).Path.Length + 1)
        $destPath = Join-Path $tempDir $relPath
        $parent = Split-Path $destPath
        if (!(Test-Path $parent)) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        Copy-Item $file.FullName -Destination $destPath
    } catch {
        Write-Warning "Failed to copy $($file.FullName)"
    }
}

# Zip
$destZip = Join-Path (Get-Location) $zipName
if (Test-Path $destZip) { Remove-Item $destZip }

Compress-Archive -Path "$tempDir\*" -DestinationPath $destZip

# Cleanup
Remove-Item -Recurse -Force $tempDir

Write-Host "Successfully created $zipName" -ForegroundColor Green
