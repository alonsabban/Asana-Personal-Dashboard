@echo off
setlocal enabledelayedexpansion

rem Deploy the Voice Task Broker to AWS
rem Usage: deploy.bat [stack-name] [region]
rem Requires: AWS CLI and SAM CLI installed and in PATH

set "STACK=%~1"
set "REGION=%~2"
if "%STACK%"=="" set "STACK=asana-voice-broker"
if "%REGION%"=="" set "REGION=us-east-1"

echo.
echo   Deploying voice task broker...
echo   Stack:  %STACK%
echo   Region: %REGION%
echo.

rem Check dependencies
where sam >nul 2>&1
if errorlevel 1 (
    echo   [X] SAM CLI not found.
    echo       Install it from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
    pause & exit /b 1
)
where aws >nul 2>&1
if errorlevel 1 (
    echo   [X] AWS CLI not found.
    echo       Install it from: https://aws.amazon.com/cli/
    pause & exit /b 1
)

rem Move into the voice-broker folder (in case run from repo root)
cd /d "%~dp0"

rem Build + deploy
sam build --template template.yaml
if errorlevel 1 ( echo   [X] sam build failed. & pause & exit /b 1 )

sam deploy --stack-name "%STACK%" --region "%REGION%" --capabilities CAPABILITY_IAM --resolve-s3 --no-confirm-changeset
if errorlevel 1 ( echo   [X] sam deploy failed. & pause & exit /b 1 )

rem Get outputs
for /f "tokens=*" %%o in ('aws cloudformation describe-stacks --stack-name "%STACK%" --region "%REGION%" --query "Stacks[0].Outputs[?OutputKey==''ApiUrl''].OutputValue" --output text') do set "API_URL=%%o"
for /f "tokens=*" %%o in ('aws cloudformation describe-stacks --stack-name "%STACK%" --region "%REGION%" --query "Stacks[0].Outputs[?OutputKey==''MobileBucketName''].OutputValue" --output text') do set "BUCKET=%%o"
for /f "tokens=*" %%o in ('aws cloudformation describe-stacks --stack-name "%STACK%" --region "%REGION%" --query "Stacks[0].Outputs[?OutputKey==''MobileUrl''].OutputValue" --output text') do set "CF_URL=%%o"

rem Inject the API URL into the mobile page and upload to S3
powershell -Command "(Get-Content mobile\index.html) -replace '__API_URL__', '%API_URL%' | Set-Content '%TEMP%\voice-index.html'"
aws s3 cp "%TEMP%\voice-index.html" "s3://%BUCKET%/index.html" --content-type "text/html" --cache-control "no-cache"
if errorlevel 1 ( echo   [X] Failed to upload mobile page to S3. & pause & exit /b 1 )

echo.
echo   ====================================================
echo     Voice task broker deployed successfully!
echo   ====================================================
echo.
echo   API URL:    %API_URL%
echo   Mobile URL: %CF_URL%
echo.
echo   In the dashboard, open the Voice Setup modal (topbar)
echo   and enter these two URLs.
echo.
echo   Your personal voice page will be:
echo     %CF_URL%?token=YOUR_TOKEN
echo   (Your token is shown in the Voice Setup modal.)
echo.
pause
