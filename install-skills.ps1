$skills = @(
    "backend-development",
    "cleanup-sprint",
    "seo-audit",
    "design-animate",
    "design-claude",
    "design-polish",
    "ffmpeg-media",
    "skill-writer",
    "responsive",
    "webapp-testing",
    "brainstorming-research-ideas",
    "perplexity-search",
    "design-audit",
    "recall",
    "prompt-engineering",
    "ui-design",
    "threejs",
    "web-game",
    "market-research-reports",
    "session-memory",
    "lua",
    "senior-architect",
    "code-to-prd",
    "api-review",
    "page-metadata",
    "finance-skills",
    "content-marketing",
    "arch-review",
    "sprites-and-images",
    "reverse-engineering-malware-with-ghidra",
    "android-app",
    "v4-new-features",
    "design-overhaul",
    "universal-subtitle-translator",
    "ponytail",
    "research-proposal",
    "broken-links",
    "code-smell",
    "research",
    "tilemaps",
    "vedic-astrology",
    "internal-comms",
    "marketing-skills",
    "web-performance-auditor",
    "design-sync",
    "image",
    "brand-guidelines",
    "github",
    "xlsx",
    "automated-code-quality-analysis",
    "loading-assets",
    "workflow-builder",
    "design-system",
    "animations",
    "skillify",
    "prompt-engineer-toolkit",
    "graphics-and-shapes",
    "getting-started",
    "seo-schema",
    "grammar-check",
    "dark-mode",
    "blog-writer",
    "adr",
    "cameras",
    "v3-to-v4-migration",
    "agent-browser",
    "pdf",
    "pentest",
    "api-docs",
    "value-proposition",
    "grill-me",
    "seo",
    "launch-strategy",
    "orca-cli",
    "sales-enablement",
    "draft-nda",
    "render-textures",
    "save-tokens",
    "reverse-engineering-ios-app-with-frida"
)

$success = @()
$failed = @()

foreach ($skill in $skills) {
    Write-Host "Installing: $skill" -ForegroundColor Cyan
    $result = npx @skills-hub-ai/cli install $skill 2>&1
    if ($LASTEXITCODE -eq 0) {
        $success += $skill
        Write-Host "  Success" -ForegroundColor Green
    } else {
        $failed += $skill
        Write-Host "  Failed" -ForegroundColor Red
    }
    Start-Sleep -Seconds 2
}

Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

if ($failed.Count -gt 0) {
    Write-Host "Failed skills:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" }
}

$success | Out-File -FilePath "C:\Temp\installed-skills.txt" -Encoding utf8
$failed | Out-File -FilePath "C:\Temp\failed-skills.txt" -Encoding utf8
Write-Host "Results saved to C:\Temp\" -ForegroundColor Cyan