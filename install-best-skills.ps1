$skills = @(
    # Top by installs (most popular)
    @{ name="alirezarezvani-ui-design-system"; display="ui-design-system (196 installs)" },
    @{ name="alirezarezvani-senior-frontend"; display="senior-frontend (133 installs)" },
    @{ name="scientific-skills-markitdown"; display="markitdown (100 installs)" },
    @{ name="anthropic-frontend-design"; display="frontend-design (97 installs)" },
    @{ name="web-research-agent"; display="web-research-agent (91 installs)" },
    @{ name="alirezarezvani-self-improving-agent"; display="self-improving-agent (74 installs)" },
    @{ name="alirezarezvani-senior-backend"; display="senior-backend (61 installs)" },
    @{ name="security-review"; display="security-review (63 installs)" },
    @{ name="quickstart"; display="quickstart (59 installs)" },
    @{ name="superpowers-using-superpowers"; display="using-superpowers (58 installs)" },
    @{ name="alirezarezvani-social-media-manager"; display="social-media-manager (51 installs)" },
    @{ name="unit-test"; display="unit-test (50 installs)" },
    @{ name="design-to-code"; display="design-to-code (46 installs)" },
    @{ name="anthropic-pptx"; display="pptx (47 installs)" },
    @{ name="alirezarezvani-marketing-strategy-pmm"; display="marketing-strategy-pmm (42 installs)" },
    @{ name="pm-skills-swot-analysis"; display="swot-analysis (28 installs)" },
    @{ name="anthropic-docx"; display="docx (26 installs)" },
    @{ name="humanizer"; display="humanizer (26 installs)" },
    @{ name="skill-creator"; display="skill-creator (24 installs)" },
    @{ name="preflight"; display="preflight (23 installs)" },

    # Top by highest rated / most liked
    @{ name="design-animate"; display="design-animate (21 installs, high rated)" },
    @{ name="design-audit"; display="design-audit (16 installs, high rated)" },
    @{ name="webapp-testing"; display="webapp-testing (16 installs, high rated)" },
    @{ name="perplexity-search"; display="perplexity-search (18 installs, high rated)" },
    @{ name="broken-links"; display="broken-links (11 installs, high rated)" },
    @{ name="code-smell"; display="code-smell (11 installs, high rated)" },
    @{ name="research"; display="research (11 installs, high rated)" },
    @{ name="automated-code-quality-analysis"; display="automated-code-quality-analysis (10 installs, high rated)" },
    @{ name="web-performance-auditor"; display="web-performance-auditor (10 installs, high rated)" },
    @{ name="design-sync"; display="design-sync (10 installs, high rated)" },
    @{ name="ponytail"; display="ponytail (11 installs, high rated)" },
    @{ name="recall"; display="recall (15 installs, high rated)" },

    # Animation & 3D (already installed but ensure)
    @{ name="gsap-skills-gsap-scrolltrigger"; display="gsap-scrolltrigger (4 installs)" },
    @{ name="gsap-skills-gsap-plugins"; display="gsap-plugins (6 installs)" },
    @{ name="openmontage-framer-motion"; display="framer-motion (6 installs)" },
    @{ name="claudekit-threejs"; display="threejs (14 installs)" },
    @{ name="alirezarezvani-epic-design"; display="epic-design (6 installs)" },
    @{ name="alirezarezvani-landing"; display="landing (2 installs)" },

    # Architecture & Senior skills
    @{ name="alirezarezvani-senior-architect"; display="senior-architect (13 installs)" },
    @{ name="arch-review"; display="arch-review (13 installs)" },
    @{ name="alirezarezvani-code-to-prd"; display="code-to-prd (13 installs)" },
    @{ name="api-review"; display="api-review (14 installs)" },
    @{ name="backend-development"; display="backend-development (21 installs)" },
    @{ name="cleanup-sprint"; display="cleanup-sprint (20 installs)" },
    @{ name="seo-audit"; display="seo-audit (20 installs)" },

    # DevOps & Tools
    @{ name="workflow-builder"; display="workflow-builder (9 installs)" },
    @{ name="save-tokens"; display="save-tokens (7 installs)" },
    @{ name="adr"; display="adr (8 installs)" },
    @{ name="agent-browser"; display="agent-browser (7 installs)" },
    @{ name="orca-cli"; display="orca-cli (7 installs)" },

    # Content & Docs
    @{ name="session-memory"; display="session-memory (15 installs)" },
    @{ name="prompt-engineering"; display="prompt-engineering (15 installs)" },
    @{ name="skill-writer"; display="skill-writer (18 installs)" },
    @{ name="ffmpeg-media"; display="ffmpeg-media (18 installs)" },
    @{ name="universal-subtitle-translator"; display="universal-subtitle-translator (12 installs)" },
    @{ name="docx"; display="docx (26 installs)" },
    @{ name="pptx"; display="pptx (47 installs)" },
    @{ name="xlsx"; display="xlsx (9 installs)" },
    @{ name="pdf"; display="pdf (7 installs)" },

    # Marketing & Business
    @{ name="content-marketing"; display="content-marketing (12 installs)" },
    @{ name="sales-enablement"; display="sales-enablement (7 installs)" },
    @{ name="launch-strategy"; display="launch-strategy (7 installs)" },
    @{ name="grill-me"; display="grill-me (7 installs)" },
    @{ name="value-proposition"; display="value-proposition (7 installs)" },

    # Security
    @{ name="pentest"; display="pentest (7 installs)" },
    @{ name="api-docs"; display="api-docs (7 installs)" },

    # Code Quality
    @{ name="responsive"; display="responsive (18 installs)" },
    @{ name="dark-mode"; display="dark-mode (8 installs)" },
    @{ name="design-polish"; display="design-polish (19 installs)" },
    @{ name="design-claude"; display="design-claude (20 installs)" },
    @{ name="design-overhaul"; display="design-overhaul (11 installs)" },
    @{ name="design-system"; display="design-system (9 installs)" },

    # Mobile & Game
    @{ name="android-app"; display="android-app (12 installs)" },
    @{ name="web-game"; display="web-game (15 installs)" },

    # Research
    @{ name="market-research-reports"; display="market-research-reports (14 installs)" },
    @{ name="brainstorming-research-ideas"; display="brainstorming-research-ideas (16 installs)" },

    # Specialized
    @{ name="threejs"; display="threejs (14 installs)" },
    @{ name="api-docs"; display="api-docs (7 installs)" }
)

$success = @()
$failed = @()
$already = @()

foreach ($skill in $skills) {
    Write-Host "Installing: $($skill.display)" -ForegroundColor Cyan
    $result = npx @skills-hub-ai/cli install $skill.name 2>&1
    if ($LASTEXITCODE -eq 0) {
        if ($result -match "already installed|Already installed") {
            $already += $skill.display
            Write-Host "  Already installed" -ForegroundColor Yellow
        } else {
            $success += $skill.display
            Write-Host "  Success" -ForegroundColor Green
        }
    } else {
        $failed += $skill.display
        Write-Host "  Failed" -ForegroundColor Red
    }
    Start-Sleep -Seconds 2
}

Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host "Newly installed: $($success.Count)" -ForegroundColor Green
Write-Host "Already installed: $($already.Count)" -ForegroundColor Yellow
Write-Host "Failed: $($failed.Count)" -ForegroundColor Red

if ($failed.Count -gt 0) {
    Write-Host "`nFailed skills:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" }
}

$success | Out-File -FilePath "C:\Temp\bulk-installed.txt" -Encoding utf8
$already | Out-File -FilePath "C:\Temp\bulk-already.txt" -Encoding utf8
$failed | Out-File -FilePath "C:\Temp\bulk-failed.txt" -Encoding utf8
Write-Host "`nResults saved to C:\Temp\" -ForegroundColor Cyan