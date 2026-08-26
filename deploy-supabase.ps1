# GymOS - Supabase Edge Function deploy (API method, no CLI needed)
# Usage (agent): .\deploy-supabase.ps1 -Token "sbp_xxx" [-ProjectRef "xxxx"] [-OrgId "yyyy"]
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

# 2. schema
$sql = [System.IO.File]::ReadAllText((Resolve-Path "supabase/migrations/0001_init.sql").Path)
$esc = $sql.Replace("\","\\").Replace('"','\"').Replace("`r","").Replace("`n","\n")
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/database/query" -Method Post -Headers $h -Body "{`"query`":`"$esc`"}" | Out-Null

# 3. keys + secrets (NOTE: secret names must NOT start with SUPABASE_)
$keys = Invoke-RestMethod -Uri "$api/projects/$ProjectRef/api-keys" -Headers $h
$sr = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $sr) { $sr = ($keys | Where-Object { $_.name -eq "service_role key" }).api_key }
$secrets = @(
  @{ name="SB_URL"; value="https://$ProjectRef.supabase.co" },
  @{ name="SB_SERVICE_ROLE"; value=$sr },
  @{ name="JWT_SECRET"; value=$JwtSecret },
  @{ name="ADMIN_EMAIL"; value=$AdminEmail },
  @{ name="ADMIN_PASSWORD"; value=$AdminPassword },
  @{ name="ALLOWED_ORIGIN"; value=$AllowedOrigin }
) | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/secrets" -Method Post -Headers $h -Body $secrets | Out-Null

# 4. deploy function (source sent as `body`)
$src = [System.IO.File]::ReadAllText((Resolve-Path "supabase/functions/gymos-api/index.ts").Path)
try { Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions/gymos-api" -Method Delete -Headers $h | Out-Null } catch {}
$fbody = @{ slug="gymos-api"; name="gymos-api"; verify_jwt=$false; entrypoint_path="/index.ts"; body=$src } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$api/projects/$ProjectRef/functions" -Method Post -Headers $h -Body $fbody | Out-Null

$fnUrl = "https://$ProjectRef.functions.supabase.co/gymos-api"
Write-Host "DONE. Set js/config.js apiUrl = $fnUrl"
Write-Host "Project: https://supabase.com/dashboard/project/$ProjectRef"
