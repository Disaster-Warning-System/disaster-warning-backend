$ErrorActionPreference = "Stop"

# Repositories are siblings inside the shared GitHub folder.
$githubRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$repositories = @(
  [pscustomobject]@{
    Name = "Backend"
    Path = Join-Path $githubRoot "disaster-warning-backend"
    IsBackend = $true
  },
  [pscustomobject]@{
    Name = "Admin"
    Path = Join-Path $githubRoot "disaster-warning-admin"
    IsBackend = $false
  },
  [pscustomobject]@{
    Name = "Mobile"
    Path = Join-Path $githubRoot "disaster-warning-mobile"
    IsBackend = $false
  }
)

$missingRepositories = @($repositories | Where-Object { -not (Test-Path -LiteralPath $_.Path -PathType Container) })
if ($missingRepositories.Count -gt 0) {
  $missingNames = $missingRepositories.Name -join ", "
  Write-Error "Cannot find these repositories beside the backend repo: $missingNames"
  $global:LASTEXITCODE = 1
  return
}

$failedRepositories = [System.Collections.Generic.List[string]]::new()

foreach ($repository in $repositories) {
  Write-Host "`n=== $($repository.Name) shelter tests ===" -ForegroundColor Cyan
  Push-Location -LiteralPath $repository.Path
  try {
    if ($repository.IsBackend) {
      # Restrict backend Jest to this feature's API and validator suites.
      & npm.cmd test -- --runTestsByPath tests/shelterApi.test.js tests/shelterValidator.test.js tests/shelterModel.test.js tests/shelterImageAccess.test.js tests/userRegistrationRoles.test.js
    } else {
      # Admin and mobile npm test scripts currently contain only shelter feature tests.
      & npm.cmd test
    }
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
      $failedRepositories.Add($repository.Name)
    }
  } catch {
    Write-Error "$($repository.Name) test command could not run: $($_.Exception.Message)"
    $failedRepositories.Add($repository.Name)
  } finally {
    Pop-Location
  }
}

if ($failedRepositories.Count -gt 0) {
  $failedNames = $failedRepositories -join ", "
  Write-Error "Shelter tests failed in: $failedNames"
  $global:LASTEXITCODE = 1
  return
}

Write-Host "`nAll shelter tests passed in the backend, admin, and mobile repos." -ForegroundColor Green
$global:LASTEXITCODE = 0
