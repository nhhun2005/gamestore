$ErrorActionPreference = 'Stop'
$settings = @{
    SPRING_DATASOURCE_URL = 'jdbc:postgresql://127.0.0.1:55439/commerce_live_test'
    SPRING_DATASOURCE_USERNAME = 'commerce_test'
    SPRING_DATASOURCE_PASSWORD = ''
    APP_JWT_SECRET = 'LiveCommerceIntegrationSigningSecretLongerThan64CharactersOnlyForLocalTests'
    APP_JWT_EXPIRATION_MS = '3600000'
    APP_COMMERCE_DEMO_TOPUPS_ENABLED = 'true'
    APP_CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:5180'
    SERVER_PORT = '18080'
}
$previous = @{}
foreach ($key in $settings.Keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
Push-Location (Join-Path $PSScriptRoot '..')
try {
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process') }
    & './mvnw.cmd' spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw 'Live test server failed' }
} finally {
    Pop-Location
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
