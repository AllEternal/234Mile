$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appRoot
$jdkPath = Join-Path $appRoot '.toolchain\jdk21'
$sdkPath = Join-Path $appRoot '.toolchain\android-sdk'
$gradleHome = Join-Path $appRoot '.gradle-user'
$socketTemp = 'C:\tmp'
if (Test-Path -LiteralPath (Join-Path $jdkPath 'bin\java.exe')) { $env:JAVA_HOME = $jdkPath }
if (Test-Path -LiteralPath (Join-Path $sdkPath 'platforms\android-36')) { $env:ANDROID_HOME = $sdkPath }
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'JDK 21 and Android SDK API 36 are required. See README.md.' }
$env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"
$env:GRADLE_USER_HOME = $gradleHome
$null = New-Item -ItemType Directory -Path $socketTemp -Force
$env:TEMP = $socketTemp
$env:TMP = $socketTemp
$env:JAVA_OPTS = "-Djdk.net.unixdomain.tmpdir=$socketTemp -Djava.io.tmpdir=$socketTemp"
$env:GRADLE_OPTS = "-Djdk.net.unixdomain.tmpdir=$socketTemp -Djava.io.tmpdir=$socketTemp"
npm run build:deploy
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
& (Join-Path $appRoot 'android\gradlew.bat') -p (Join-Path $appRoot 'android') --no-daemon assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
Write-Host (Join-Path $appRoot 'android\app\build\outputs\apk\debug\app-debug.apk')
