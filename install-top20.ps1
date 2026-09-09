$skills = @(
    @{ name="alirezarezvani-ui-design-system"; display="ui-design-system (193)" },
    @{ name="alirezarezvani-senior-frontend"; display="senior-frontend (127)" },
    @{ name="scientific-skills-markitdown"; display="markitdown (99)" },
    @{ name="anthropic-frontend-design"; display="frontend-design (96)" },
    @{ name="web-research-agent"; display="web-research-agent (89)" },
    @{ name="alirezarezvani-self-improving-agent"; display="self-improving-agent (72)" },
    @{ name="alirezarezvani-senior-backend"; display="senior-backend (60)" },
    @{ name="security-review"; display="security-review (59)" },
    @{ name="quickstart"; display="quickstart (58)" },
    @{ name="superpowers-using-superpowers"; display="using-superpowers (56)" },
    @{ name="alirezarezvani-social-media-manager"; display="social-media-manager (50)" },
    @{ name="unit-test"; display="unit-test (49)" },
    @{ name="design-to-code"; display="design-to-code (45)" },
    @{ name="anthropic-pptx"; display="pptx (45)" },
    @{ name="alirezarezvani-marketing-strategy-pmm"; display="marketing-strategy-pmm (41)" },
    @{ name="pm-skills-swot-analysis"; display="swot-analysis (27)" },
    @{ name="anthropic-docx"; display="docx (25)" },
    @{ name="humanizer"; display="humanizer (25)" },
    @{ name="skill-creator"; display="skill-creator (23)" },
    @{ name="preflight"; display="preflight (22)" }
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

if ($failed.Count -gt 0) {
    Write-Host "Failed skills:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" }
}

$success | Out-File -FilePath "C:\Temp\top20-installed.txt" -Encoding utf8
$failed | Out-File -FilePath "C:\Temp\top20-failed.txt" -Encoding utf8
Write-Host "Results saved to C:\Temp\" -ForegroundColor Cyan