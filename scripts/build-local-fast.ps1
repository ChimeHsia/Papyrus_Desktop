# Papyrus Fast Build Script (PowerShell)
param(
    [switch]$SkipFrontend,
    [switch]$SkipPython,
    [switch]$SkipElectron,
    [switch]$Clean,
    [switch]$Fast,
    [switch]$Quick,
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\build-local-fast.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipFrontend    Skip frontend build"
    Write-Host "  -SkipPython      Skip Python backend build"
    Write-Host "  -SkipElectron    Skip Electron build"
    Write-Host "  -Clean           Clean all build directories first"
    Write-Host "  -Fast            Skip if already built (incremental)"
    Write-Host "  -Quick           Only build Electron (assumes others exist)"
    Write-Host "  -Help            Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\build-local-fast.ps1              Full build"
    Write-Host "  .\build-local-fast.ps1 -Fast        Fast build (skip if exists)"
    Write-Host "  .\build-local-fast.ps1 -Quick       Quick rebuild (Electron only)"
    Write-Host "  .\build-local-fast.ps1 -Clean       Clean build"
    Write-Host "  .\build-local-fast.ps1 -SkipPython  Skip Python (frontend + Electron only)"
    exit 0
}

# Set project root
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Quick mode: skip everything except Electron
if ($Quick) {
    $SkipFrontend = $true
    $SkipPython = $true
    $SkipElectron = $false
}

# Fast mode: skip if already built
if ($Fast) {
    if (Test-Path "$ProjectRoot\dist-python\Papyrus\Papyrus.exe") {
        Write-Host "[FAST MODE] Python already built, skipping..." -ForegroundColor Cyan
        $SkipPython = $true
    }
    if (Test-Path "$ProjectRoot\frontend\dist\index.html") {
        Write-Host "[FAST MODE] Frontend already built, skipping..." -ForegroundColor Cyan
        $SkipFrontend = $true
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Papyrus Fast Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Options: SkipFrontend=$SkipFrontend, SkipPython=$SkipPython, SkipElectron=$SkipElectron, Clean=$Clean, Fast=$Fast, Quick=$Quick"
Write-Host ""

$StartTime = Get-Date

# Helper functions
function Write-Step($message) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info($message) {
    Write-Host "  [INFO] $message" -ForegroundColor Gray
}

function Write-Success($message) {
    Write-Host "  [OK] $message" -ForegroundColor Green
}

function Write-Error($message) {
    Write-Host "  [ERROR] $message" -ForegroundColor Red
}

# Clean build directories
if ($Clean) {
    Write-Step "Cleaning Build Directories"
    
    if (Test-Path "$ProjectRoot\frontend\dist") {
        Write-Info "Removing frontend\dist..."
        Remove-Item -Recurse -Force "$ProjectRoot\frontend\dist" -ErrorAction SilentlyContinue
    }
    
    if (Test-Path "$ProjectRoot\dist-electron") {
        Write-Info "Removing dist-electron..."
        Remove-Item -Recurse -Force "$ProjectRoot\dist-electron" -ErrorAction SilentlyContinue
    }
    
    if (Test-Path "$ProjectRoot\dist-python\Papyrus") {
        Write-Info "Removing dist-python\Papyrus..."
        Remove-Item -Recurse -Force "$ProjectRoot\dist-python\Papyrus" -ErrorAction SilentlyContinue
    }
    
    Write-Success "Clean completed"
}

# Build Frontend
if (-not $SkipFrontend) {
    Write-Step "Building Frontend"
    $frontendPath = "$ProjectRoot\frontend"
    
    if (-not (Test-Path $frontendPath)) {
        Write-Error "Frontend directory not found: $frontendPath"
        exit 1
    }
    
    # Check if node_modules exists
    if (-not (Test-Path "$frontendPath\node_modules")) {
        Write-Info "Installing frontend dependencies..."
        Set-Location $frontendPath
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed"
            exit 1
        }
        Set-Location $ProjectRoot
    }
    
    Set-Location $frontendPath
    Write-Info "Running: npm run build"
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Set-Location $ProjectRoot
        Write-Error "Frontend build failed"
        exit 1
    }
    Set-Location $ProjectRoot
    
    $distPath = "$frontendPath\dist"
    $indexPath = "$distPath\index.html"
    if (Test-Path $indexPath) {
        Write-Success "Frontend build completed"
    } else {
        Write-Error "Frontend build output not found: $indexPath"
        exit 1
    }
}

# Build Python Backend
if (-not $SkipPython) {
    Write-Step "Building Python Backend"
    
    $specFile = "$ProjectRoot\PapyrusAPI.spec"
    if (-not (Test-Path $specFile)) {
        Write-Error "PyInstaller spec file not found: $specFile"
        exit 1
    }
    
    $distPath = "$ProjectRoot\dist-python\Papyrus"
    
    # Check if already built and not forced
    if ((Test-Path "$distPath\Papyrus.exe") -and -not $Clean) {
        Write-Info "Python backend already built, skipping (use -Clean to force rebuild)"
    } else {
        Write-Info "Running: pyinstaller PapyrusAPI.spec --noconfirm --distpath dist-python"
        pyinstaller PapyrusAPI.spec --noconfirm --distpath dist-python
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Python build failed"
            exit 1
        }
    }
    
    $exePath = "$distPath\Papyrus.exe"
    if (Test-Path $exePath) {
        $sizeMB = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
        Write-Success "Python backend built: $sizeMB MB"
    } else {
        Write-Error "Python executable not found: $exePath"
        exit 1
    }
}

# Build Electron App
if (-not $SkipElectron) {
    Write-Step "Building Electron App"
    
    $packageJson = "$ProjectRoot\package.json"
    if (-not (Test-Path $packageJson)) {
        Write-Error "package.json not found: $packageJson"
        exit 1
    }
    
    $distPath = "$ProjectRoot\dist-electron\win-unpacked"
    
    # Check if dependencies are installed
    if (-not (Test-Path "$ProjectRoot\node_modules")) {
        Write-Info "Installing Electron dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed"
            exit 1
        }
    }
    
    Write-Info "Running: npx electron-builder --windows --dir"
    npx electron-builder --windows --dir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Electron build failed"
        exit 1
    }
    
    $exePath = "$distPath\Papyrus.exe"
    if (Test-Path $exePath) {
        Write-Success "Electron app built successfully"
    } else {
        Write-Error "Electron executable not found: $exePath"
        exit 1
    }
}

# Summary
Write-Step "Build Summary"
Write-Success "Build completed successfully!"
Write-Host ""
Write-Host "Output directories:"
Write-Host "  - Frontend:    $ProjectRoot\frontend\dist"
Write-Host "  - Python:      $ProjectRoot\dist-python\Papyrus"
Write-Host "  - Electron:    $ProjectRoot\dist-electron\win-unpacked"
Write-Host ""
Write-Host "Run: $ProjectRoot\dist-electron\win-unpacked\Papyrus.exe"

# Calculate elapsed time
$EndTime = Get-Date
$Duration = $EndTime - $StartTime
Write-Host ""
Write-Host "Build time: $($Duration.Minutes)m $($Duration.Seconds)s"
