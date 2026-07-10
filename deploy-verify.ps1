param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [string]$Email = "admin@demo.gattandco.local",
  [string]$Password = "1234567890",

  [switch]$SkipLogin
)

$ErrorActionPreference = "Stop"

function Write-StepResult {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Details
  )

  if ($Passed) {
    Write-Host "[PASS] $Name - $Details" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $Name - $Details" -ForegroundColor Red
  }
}

function Get-StatusCodeFromException {
  param([System.Exception]$Exception)

  if ($null -eq $Exception) {
    return $null
  }

  if ($Exception.Response -and $Exception.Response.StatusCode) {
    return [int]$Exception.Response.StatusCode
  }

  if ($Exception.Exception -and $Exception.Exception.Response -and $Exception.Exception.Response.StatusCode) {
    return [int]$Exception.Exception.Response.StatusCode
  }

  return $null
}

$base = $BaseUrl.TrimEnd('/')
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$allPassed = $true

Write-Host "Target: $base" -ForegroundColor Cyan

# 1) Health check
try {
  $healthResponse = Invoke-WebRequest -Uri "$base/api/health" -Method Get -WebSession $session
  $healthJson = $null
  try { $healthJson = $healthResponse.Content | ConvertFrom-Json } catch { }

  $ok = ($healthResponse.StatusCode -eq 200) -and ($healthJson -ne $null) -and ($healthJson.status -eq "ok")
  Write-StepResult -Name "Health endpoint" -Passed $ok -Details "Status=$($healthResponse.StatusCode), Body=$($healthResponse.Content)"
  if (-not $ok) { $allPassed = $false }
} catch {
  $allPassed = $false
  Write-StepResult -Name "Health endpoint" -Passed $false -Details $_.Exception.Message
}

if (-not $SkipLogin) {
  # 2) Login check
  try {
    $loginBody = @{
      identifier = $Email
      password   = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-WebRequest -Uri "$base/api/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session
    $loginJson = $loginResponse.Content | ConvertFrom-Json

    $ok = ($loginResponse.StatusCode -eq 200) -and ($loginJson.user -ne $null)
    Write-StepResult -Name "Login endpoint" -Passed $ok -Details "Status=$($loginResponse.StatusCode), User=$($loginJson.user.email)"
    if (-not $ok) { $allPassed = $false }
  } catch {
    $allPassed = $false
    Write-StepResult -Name "Login endpoint" -Passed $false -Details $_.Exception.Message
  }

  # 3) Session restore check (cookie-based)
  try {
    $sessionResponse = Invoke-WebRequest -Uri "$base/api/session" -Method Get -WebSession $session
    $sessionJson = $sessionResponse.Content | ConvertFrom-Json

    $ok = ($sessionResponse.StatusCode -eq 200) -and ($sessionJson.user -ne $null)
    Write-StepResult -Name "Session endpoint" -Passed $ok -Details "Status=$($sessionResponse.StatusCode), User=$($sessionJson.user.email)"
    if (-not $ok) { $allPassed = $false }
  } catch {
    $allPassed = $false
    Write-StepResult -Name "Session endpoint" -Passed $false -Details $_.Exception.Message
  }

  # 4) Logout check
  try {
    $logoutResponse = Invoke-WebRequest -Uri "$base/api/logout" -Method Post -WebSession $session
    $ok = ($logoutResponse.StatusCode -eq 200)
    Write-StepResult -Name "Logout endpoint" -Passed $ok -Details "Status=$($logoutResponse.StatusCode)"
    if (-not $ok) { $allPassed = $false }
  } catch {
    $allPassed = $false
    Write-StepResult -Name "Logout endpoint" -Passed $false -Details $_.Exception.Message
  }

  # 5) Session invalid after logout
  try {
    $null = Invoke-WebRequest -Uri "$base/api/session" -Method Get -WebSession $session
    $allPassed = $false
    Write-StepResult -Name "Session cleared after logout" -Passed $false -Details "Expected 401 but got success response."
  } catch {
    $code = Get-StatusCodeFromException -Exception $_
    $ok = ($code -eq 401)
    Write-StepResult -Name "Session cleared after logout" -Passed $ok -Details "Status=$code"
    if (-not $ok) { $allPassed = $false }
  }
}

Write-Host ""
if ($allPassed) {
  Write-Host "Deploy verification passed." -ForegroundColor Green
  exit 0
} else {
  Write-Host "Deploy verification failed. See failed steps above." -ForegroundColor Red
  exit 1
}
