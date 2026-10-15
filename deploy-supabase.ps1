# GymOS - Supabase Edge Function deploy (API method, no CLI needed)
# Usage (agent): .\deploy-supabase.ps1 -Token "sbp_xxx" [-ProjectRef "xxxx"] [-OrgId "yyyy"] [-ApplyMigrations]
param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [string]$ProjectRef = "",
  [string]$OrgId = "",
  [string]$ProjectName = "gymos",
  [string]$Region = "eu-central-1",
  [string]$AdminEmail = "",
  [string]$AdminPassword = "",
  [string]$AllowedOrigin = "https://ibrheamkhalaf88-collab.github.io",
  [string]$DbPassword = "",
  [string]$JwtSecret = "",
  [string]$GoogleClientId = "",
  [string]$GoogleClientSecret = "",
  [string]$CronSecret = "",
  [switch]$ApplyMigrations = $false
)

$ErrorActionPreference = "Stop"
$api = "https://api.supabase.com/v1"
$h = @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/json" }
function Rand($n){ -join ((65..90)+(97..122)+(48..57) | Get-Random -Count $n | ForEach-Object {[char]$_}) }

# 1. ensure project
if (-not $ProjectRef) {
  if (-not $OrgId) { $OrgId = (Invoke-RestMethod -Uri "$api/organizations" -Headers $h)[0].id }
  if (-not $DbPassword) { $DbPassword = Rand 24 }
  if (-not $JwtSecret)  { $JwtSecret  = Rand 48 }
  $body = @{ name=$ProjectName; organization_id=$OrgId; region=$Region; db_pass=$DbPassword } | ConvertTo-Json
  $proj = Invoke-RestMethod -Uri "$api/projects" -Method Post -Headers $h -Body $body
  $ProjectRef = $proj.ref
  do { Start-Sleep -Seconds 10; $st = Invoke-RestMethod -Uri "$api/projects/$ProjectRef" -Headers $h } while ($st.status -notmatch "ACTIVE|READY|HEALTHY")
}

# 2. schema - apply migrations ONLY if -ApplyMigrations flag is set
if ($ApplyMigrations) {
  Write-Host "Applying migrations (explicit -ApplyMigrations flag provided)..."
  $migrationFiles = @(
    "supabase/migrations/0001_init.sql",
    "supabase/migrations/0002_admin_controls.sql",
    "supabase/migrations/0003_perf_indexes.sql",
    "supabase/migrations/0004_lockdown_rls_complete.sql",
    "supabase/migrations/0005_coupons.sql",
    "supabase/migrations/0006_contact_messages.sql",
    "supabase/migrations/0007_drive_tokens.sql",
    "supabase/migrations/0008_admin_audit_error_log.sql"
  )
  foreach ($migration in $migrationFiles) {
    if (Test-Path $migration) {
      Write-Host "Applying migration: $migration"
      $sql = [System.IO.File]::ReadAllText((Resolve-Path $migration).Path)
      $esc = $sql.Replace("\","\\").Replace('"','\"').Replace("`r","").Replace("`n","\n")
      Invoke-RestMethod -Uri "$api/projects/$ProjectRef/database/query" -Method Post -Headers $h -Body "{`"query`":`"$esc`"}" | Out-Null
    } else {
      Write-Warning "Migration not found: $migration"
    }
  }
} else {
  Write-Host "Skipping migrations (use -ApplyMigrations to apply them)."
  Write-Host "Run migrations manually in Supabase SQL Editor in this order:"
  @(
    "supabase/migrations/0004_lockdown_rls_complete.sql",
    "supabase/migrations/0007_drive_tokens.sql",
    "supabase/migrations/0008_admin_audit_error_log.sql"
  ) | ForEach-Object { Write-Host "  $_" }
}

# 3. keys + secrets (NOTE: secret names must NOT start with SUPABASE_)
$keys = Invoke-RestMethod -Uri "$api/projects/$ProjectRef/api-keys" -Headers $h
$sr = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $sr) { $sr = ($keys | Where-Object { $_.name -eq "service_role key" }).api_key }
$secrets = @(
  @{ name="SB_URL"; value="https://$ProjectRef.supabase.co" },
  @{ name="SB_SERVICE_ROLE"; value=$sr },
  @{ name="JWT_SECRET"; value=$JwtSecret },
  @{ name="ALLOWED_ORIGIN"; value=$AllowedOrigin }
)

# ADMIN_EMAIL / ADMIN_PASSWORD are only pushed when explicitly supplied.
if ($AdminEmail -or $AdminPassword) {
  if (-not $AdminEmail -or -not $AdminPassword) {
    throw "Supply BOTH -AdminEmail and -AdminPassword, or neither. Partial input is refused so the live credentials are never left half-updated."
  }
  if ($AdminPassword.Length -lt 12) {
    throw "Refusing to set an admin password under 12 characters. Generate a long random one."
  }
  if ($AdminEmail -notmatch '@') {
    throw "Refusing to set ADMIN_EMAIL='$AdminEmail' -- that is not an email address."
  }
  $secrets += @{ name="ADMIN_EMAIL"; value=$AdminEmail }
  $secrets += @{ name="ADMIN_PASSWORD"; value=$AdminPassword }
} else {
  Write-Warning "No -AdminEmail/-AdminPassword given: leaving the existing admin credentials untouched."
}

# Drive Backup secrets (optional but recommended for production)
if ($GoogleClientId) { $secrets += @{ name="GOOGLE_CLIENT_ID"; value=$GoogleClientId } }
if ($GoogleClientSecret) { $secrets += @{ name="GOOGLE_CLIENT_SECRET"; value=$GoogleClientSecret } }
if ($CronSecret) { $secrets += @{ name="CRON_SECRET"; value=$CronSecret } }

$secrets = $secrets | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/secrets" -Method Post -Headers $h -Body $secrets | Out-Null

# 4. deploy gymos-api function
Write-Host "Deploying gymos-api..."
$srcApi = [System.IO.File]::ReadAllText((Resolve-Path "supabase/functions/gymos-api/index.ts").Path)
try { Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions/gymos-api" -Method Delete -Headers $h | Out-Null } catch {}
$fbodyApi = @{ slug="gymos-api"; name="gymos-api"; verify_jwt=$false; entrypoint_path="/index.ts"; body=$srcApi } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions" -Method Post -Headers $h -Body $fbodyApi | Out-Null

# 5. deploy gymos-drive-backup function
Write-Host "Deploying gymos-drive-backup..."
$srcDrive = [System.IO.File]::ReadAllText((Resolve-Path "supabase/functions/gymos-drive-backup/index.ts").Path)
try { Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions/gymos-drive-backup" -Method Delete -Headers $h | Out-Null } catch {}
$fbodyDrive = @{ slug="gymos-drive-backup"; name="gymos-drive-backup"; verify_jwt=$false; entrypoint_path="/index.ts"; body=$srcDrive } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions" -Method Post -Headers $h -Body $fbodyDrive | Out-Null

$apiUrl = "https://$ProjectRef.functions.supabase.co/gymos-api"
$driveUrl = "https://$ProjectRef.functions.supabase.co/gymos-drive-backup"
Write-Host "DONE. Set js/config.js apiUrl = $apiUrl"
Write-Host "Drive Backup URL: $driveUrl"
Write-Host "Project: https://supabase.com/dashboard/project/$ProjectRef"
Write-Host ""
Write-Host "REQUIRED MANUAL STEPS AFTER DEPLOY:"
Write-Host "1. Apply migrations 0004, 0007, 0008 in Supabase SQL Editor if not applied by script"
Write-Host "2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase Dashboard -> Edge Functions -> gymos-drive-backup -> Secrets"
Write-Host "3. Set CRON_SECRET in Supabase Dashboard -> Edge Functions -> gymos-drive-backup -> Secrets"
Write-Host "4. Configure Google Cloud OAuth: redirect URI = https://<your-domain>/auth/drive-callback.html"
Write-Host "5. Rotate Supabase Anon Key in Dashboard -> Settings -> API -> Regenerate"
Write-Host "6. Set ADMIN_PASSWORD in Dashboard -> Edge Functions -> gymos-api -> Secrets"
Write-Host "Project: https://supabase.com/dashboard/project/$ProjectRef"