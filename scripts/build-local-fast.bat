@echo off
setlocal enabledelayedexpansion

:: Parse arguments
set "SkipFrontend=0"
set "SkipPython=0"
set "SkipElectron=0"
set "Clean=0"
set "Fast=0"
set "Quick=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="-SkipFrontend" set "SkipFrontend=1"
if /i "%~1"=="-SkipPython" set "SkipPython=1"
if /i "%~1"=="-SkipElectron" set "SkipElectron=1"
if /i "%~1"=="-Clean" set "Clean=1"
if /i "%~1"=="-Fast" set "Fast=1"
if /i "%~1"=="-Quick" set "Quick=1"
if /i "%~1"=="-h" goto :show_help
if /i "%~1"=="-help" goto :show_help
if /i "%~1"=="--help" goto :show_help
shift
goto :parse_args
:args_done

:: Set project root first
set "ProjectRoot=%~dp0.."
pushd "%ProjectRoot%"
set "ProjectRoot=%CD%"
popd

:: Quick mode: skip everything except Electron
if "%Quick%"=="1" (
    set "SkipFrontend=1"
    set "SkipPython=1"
    set "SkipElectron=0"
)

:: Fast mode: skip Python if already built
if "%Fast%"=="1" (
    if exist "%ProjectRoot%\dist-python\Papyrus\Papyrus.exe" (
        echo [FAST MODE] Python already built, skipping...
        set "SkipPython=1"
    )
    if exist "%ProjectRoot%\frontend\dist\index.html" (
        echo [FAST MODE] Frontend already built, skipping...
        set "SkipFrontend=1"
    )
)

echo.
echo ========================================
echo Papyrus Fast Build Script
echo ========================================
echo Project: %ProjectRoot%
echo Options: SkipFrontend=%SkipFrontend%, SkipPython=%SkipPython%, SkipElectron=%SkipElectron%, Clean=%Clean%, Fast=%Fast%, Quick=%Quick%
echo.

set "StartTime=%TIME%"

:: Clean if requested
if "%Clean%"=="1" call :Clean-Build

:: Build steps
if "%SkipFrontend%"=="0" call :Invoke-FrontendBuild
if errorlevel 1 goto :build_failed

if "%SkipPython%"=="0" call :Invoke-PythonBuild
if errorlevel 1 goto :build_failed

if "%SkipElectron%"=="0" call :Invoke-ElectronBuild
if errorlevel 1 goto :build_failed

:: Summary
call :Write-Step "Build Summary"
call :Write-Success "Build completed successfully!"
echo.
echo Output directories:
echo   - Frontend:    %ProjectRoot%\frontend\dist
echo   - Python:      %ProjectRoot%\dist-python\Papyrus
echo   - Electron:    %ProjectRoot%\dist-electron\win-unpacked
echo.
echo Run: %ProjectRoot%\dist-electron\win-unpacked\Papyrus.exe

:: Calculate elapsed time
set "EndTime=%TIME%"
call :Calculate-Duration "%StartTime%" "%EndTime%"

goto :eof

:show_help
echo Usage: build-local-fast.bat [options]
echo.
echo Options:
echo   -SkipFrontend    Skip frontend build
echo   -SkipPython      Skip Python backend build
echo   -SkipElectron    Skip Electron build
echo   -Clean           Clean all build directories first
echo   -Fast            Skip if already built (incremental)
echo   -Quick           Only build Electron (assumes others exist)
echo   -h, -help        Show this help message
echo.
echo Examples:
echo   build-local-fast.bat              Full build
echo   build-local-fast.bat -Fast        Fast build (skip if exists)
echo   build-local-fast.bat -Quick       Quick rebuild (Electron only)
echo   build-local-fast.bat -Clean       Clean build
echo   build-local-fast.bat -SkipPython  Skip Python (frontend + Electron only)
echo.
goto :eof

:build_failed
echo.
echo ========================================
echo [ERROR] BUILD FAILED
echo ========================================
exit /b 1

:Clean-Build
call :Write-Step "Cleaning Build Directories"

:: Only clean output directories, keep caches
if exist "%ProjectRoot%\frontend\dist" (
    call :Write-Info "Removing frontend\dist..."
    rmdir /s /q "%ProjectRoot%\frontend\dist" 2>nul
)

if exist "%ProjectRoot%\dist-electron" (
    call :Write-Info "Removing dist-electron..."
    rmdir /s /q "%ProjectRoot%\dist-electron" 2>nul
)

:: For Python, only remove the final executable, keep PyInstaller cache
if exist "%ProjectRoot%\dist-python\Papyrus" (
    call :Write-Info "Removing dist-python\Papyrus..."
    rmdir /s /q "%ProjectRoot%\dist-python\Papyrus" 2>nul
)

:: Clean build directory but keep PyInstaller cache for faster rebuilds
if exist "%ProjectRoot%\build" (
    call :Write-Info "Cleaning build directory..."
    :: Keep PyInstaller cache (build folder contains analysis cache)
    for /d %%D in ("%ProjectRoot%\build\*") do (
        if /i not "%%~nxD"=="Papyrus" (
            rmdir /s /q "%%D" 2>nul
        )
    )
    del /q "%ProjectRoot%\build\*.*" 2>nul
)

call :Write-Success "Clean completed (caches preserved)"
goto :eof

:Write-Step
echo.
echo ========================================
echo %~1
echo ========================================
goto :eof

:Write-Info
echo   [INFO] %~1
goto :eof

:Write-Success
echo   [OK] %~1
goto :eof

:Write-Error
echo   [ERROR] %~1
goto :eof

:Calculate-Duration
set "Start=%~1"
set "End=%~2"
for /f "tokens=1-4 delims=:.," %%a in ("%Start%") do set /a "StartSec=(((%%a*60)+1%%b%%100)*60+1%%c%%100)*100+1%%d%%100"
for /f "tokens=1-4 delims=:.," %%a in ("%End%") do set /a "EndSec=(((%%a*60)+1%%b%%100)*60+1%%c%%100)*100+1%%d%%100"
set /a "Duration=(EndSec-StartSec)/100"
if %Duration% lss 0 set /a "Duration+=86400"
set /a "Minutes=Duration/60"
set /a "Seconds=Duration%%60"
echo.
echo Build time: %Minutes%m %Seconds%s
goto :eof

:Invoke-FrontendBuild
call :Write-Step "Building Frontend"
set "frontendPath=%ProjectRoot%\frontend"

if not exist "%frontendPath%" (
    call :Write-Error "Frontend directory not found: %frontendPath%"
    exit /b 1
)

:: Check if node_modules exists
if not exist "%frontendPath%\node_modules" (
    call :Write-Info "Installing frontend dependencies..."
    pushd "%frontendPath%"
    call npm install
    if errorlevel 1 (
        popd
        call :Write-Error "npm install failed"
        exit /b 1
    )
    popd
)

pushd "%frontendPath%"
call :Write-Info "Running: npm run build"
call npm run build
if errorlevel 1 (
    popd
    call :Write-Error "Frontend build failed"
    exit /b 1
)
popd

set "distPath=%frontendPath%\dist"
set "indexPath=%distPath%\index.html"
if exist "%indexPath%" (
    call :Write-Success "Frontend build completed"
) else (
    call :Write-Error "Frontend build output not found: %indexPath%"
    exit /b 1
)
goto :eof

:Invoke-PythonBuild
call :Write-Step "Building Python Backend"

set "specFile=%ProjectRoot%\PapyrusAPI.spec"
if not exist "%specFile%" (
    call :Write-Error "PyInstaller spec file not found: %specFile%"
    exit /b 1
)

set "distPath=%ProjectRoot%\dist-python\Papyrus"

:: Check if already built and not forced
if exist "%distPath%\Papyrus.exe" (
    if "%Clean%"=="0" (
        call :Write-Info "Python backend already built, skipping (use -Clean to force rebuild)"
        goto :eof
    )
)

pushd "%ProjectRoot%"

:: Use --noconfirm to skip prompts and reuse cache
call :Write-Info "Running: pyinstaller PapyrusAPI.spec --noconfirm --distpath dist-python"
call pyinstaller PapyrusAPI.spec --noconfirm --distpath dist-python
if errorlevel 1 (
    popd
    call :Write-Error "Python build failed"
    exit /b 1
)
popd

set "exePath=%distPath%\Papyrus.exe"
if exist "%exePath%" (
    for %%A in ("%exePath%") do set "sizeMB=%%~zA"
    set /a "sizeMB=!sizeMB! / 1048576"
    call :Write-Success "Python backend built: !sizeMB! MB"
) else (
    call :Write-Error "Python executable not found: %exePath%"
    exit /b 1
)
goto :eof

:Invoke-ElectronBuild
call :Write-Step "Building Electron App"

set "packageJson=%ProjectRoot%\package.json"
if not exist "%packageJson%" (
    call :Write-Error "package.json not found: %packageJson%"
    exit /b 1
)

set "distPath=%ProjectRoot%\dist-electron\win-unpacked"

pushd "%ProjectRoot%"

:: Check if dependencies are installed
if not exist "%ProjectRoot%\node_modules" (
    call :Write-Info "Installing Electron dependencies..."
    call npm install
    if errorlevel 1 (
        popd
        call :Write-Error "npm install failed"
        exit /b 1
    )
)

call :Write-Info "Running: npx electron-builder --windows --dir"
call npx electron-builder --windows --dir
if errorlevel 1 (
    popd
    call :Write-Error "Electron build failed"
    exit /b 1
)
popd

set "exePath=%distPath%\Papyrus.exe"
if exist "%exePath%" (
    call :Write-Success "Electron app built successfully"
) else (
    call :Write-Error "Electron executable not found: %exePath%"
    exit /b 1
)
goto :eof
