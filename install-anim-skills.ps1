$skills = @(
    @{ name="design-animate"; display="design-animate (21 installs)" },
    @{ name="gsap-skills-gsap-scrolltrigger"; display="gsap-scrolltrigger (4 installs)" },
    @{ name="gsap-skills-gsap-plugins"; display="gsap-plugins (6 installs)" },
    @{ name="openmontage-framer-motion"; display="framer-motion (6 installs)" }
)

$success = @()
$failed = @()

foreach ($skill in $skills) {
    Write-Host "Installing: $($skill.display)" -ForegroundColor Cyan
    $result = npx @skills-hub-ai/cli install $skill.name 2>&1
    if ($LASTEXITCODE -eq 0) {
        $success += $skill.display
        Write-Host "  Success" -ForegroundColor Green
    } else {
        $failed += $skill.display
        Write-Host "  Failed" -ForegroundColor Red
    }
    Start-Sleep -Seconds 3
}

Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host "Success: $($success.Count)" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red