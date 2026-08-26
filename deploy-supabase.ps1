# ============================================================
# GymOS — one-command Supabase deploy
# كنشر الخادم كـ Supabase Edge Function (بدون فيزا).
#
# Usage (agent runs this once the user supplies the token):
#   .\deploy-supabase.ps1 -Token "sbp_xxx" [-ProjectRef "xxxx"] [-OrgId "yyyy"]
#
# If -ProjectRef is omitted a NEW separate project "gymos" is created.
# ============================================================
param(
  [Parameter(Mandatory=$true)] [string]$Token,
  [string]$ProjectRef = "",
  [string]$OrgId = "",
  [string]$ProjectName = "gymos",
  [string]$Region = "eu-central-1",
  [string]$AdminEmail = "admin@example.com",
  [string]$AdminPassword = "ibrheam2040",
  [string]$AllowedOrigin = "https://ibrheamkhalaf88-collab.github.io",
  [string]$DbPassword = "",
  [string]$JwtSecret = ""
)

$ErrorActionPreference = "Stop"
$api = "https://api.supabase.com/v1"
$headers = @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/json" }

function Rand($n){ -join ((65..90)+(97..122)+(48..57) | Get-Random -Count $n | ForEach-Object {[char]$_}) }

# ---- 1. ensure project ----
if (-not $ProjectRef) {
  if (-not $OrgId) {
    $orgs = Invoke-RestMethod -Uri "$api/organizations" -Headers $headers
    $OrgId = $orgs[0].id
    Write-Host "Using org: $OrgId"
  }
  if (-not $DbPassword) { $DbPassword = Rand 24 }
  if (-not $JwtSecret)  { $JwtSecret  = Rand 48 }
  $body = @{ name=$ProjectName; organization_id=$OrgId; region=$Region; db_pass=$DbPassword } | ConvertTo-Json
  Write-Host "Creating project '$ProjectName'..."
  $proj = Invoke-RestMethod -Uri "$api/projects" -Method Post -Headers $headers -Body $body
  $ProjectRef = $proj.ref
  Write-Host "Project ref: $ProjectRef — waiting for it to become healthy..."
  do {
    Start-Sleep -Seconds 10
    $st = Invoke-RestMethod -Uri "$api/projects/$ProjectRef" -Headers $headers
    Write-Host "  status: $($st.status)"
  } while ($st.status -notmatch "ACTIVE|READY|HEALTHY")
}

# ---- 2. schema ----
$sql = Get-Content -Raw -LiteralPath "$PSScriptRoot\supabase\migrations\0001_init.sql"
Write-Host "Applying schema..."
try {
  Invoke-RestMethod -Uri "$api/projects/$ProjectRef/database/query" -Method Post -Headers $headers -Body (@{ query=$sql } | ConvertTo-Json)
} catch {
  Write-Warning "Schema apply via API failed ($($_.Exception.Message)). Apply supabase/migrations/0001_init.sql manually in the SQL editor."
}

# ---- 3. secrets ----
$supaUrl = "https://$ProjectRef.supabase.co"
# fetch service_role + anon from API
$keys = Invoke-RestMethod -Uri "$api/projects/$ProjectRef/api-keys" -Headers $headers
$serviceRole = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $serviceRole) { $serviceRole = ($keys | Where-Object { $_.name -eq "service_role key" }).api_key }
$anon = ($keys | Where-Object { $_.name -eq "anon" }).api_key

$secretBody = @(
  @{ name="SUPABASE_URL"; value=$supaUrl },
  @{ name="SUPABASE_SERVICE_ROLE"; value=$serviceRole },
  @{ name="JWT_SECRET"; value=$JwtSecret },
  @{ name="ADMIN_EMAIL"; value=$AdminEmail },
  @{ name="ADMIN_PASSWORD"; value=$AdminPassword },
  @{ name="ALLOWED_ORIGIN"; value=$AllowedOrigin }
) | ConvertTo-Json
Write-Host "Setting function secrets..."
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/secrets" -Method Post -Headers $headers -Body $secretBody

# ---- 4. install + login CLI ----
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Supabase CLI..."
  npm i -g supabase 2>&1 | Out-Null
}
supabase login --token $Token | Out-Null
$env:SUPABASE_ACCESS_TOKEN = $Token

# ---- 5. deploy function ----
Write-Host "Deploying Edge Function 'gymos-api'..."
Push-Location "$PSScriptRoot\supabase"
supabase functions deploy gymos-api --project-ref $ProjectRef --no-verify-jwt
Pop-Location

$fnUrl = "https://$ProjectRef.functions.supabase.co/gymos-api"
Write-Host "==================================================="
Write-Host "DONE. Function URL: $fnUrl"
Write-Host "Set js/config.js -> apiUrl = `"$fnUrl`""
Write-Host "Project: https://supabase.com/dashboard/project/$ProjectRef"
Write-Host "==================================================="
