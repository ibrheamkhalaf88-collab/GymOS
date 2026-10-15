#!/usr/bin/env python3
"""
Generate social media calendar from CONTENT-CALENDAR.json
Uses the social_calendar_generator.py from social-media-manager skill
"""
import json
import subprocess
import sys
from pathlib import Path

def main():
    calendar_path = Path(__file__).parent.parent / "docs" / "CONTENT-CALENDAR.json"
    skill_script = Path.home() / ".claude" / "skills" / "social-media-manager" / "scripts" / "social_calendar_generator.py"
    
    if not calendar_path.exists():
        print(f"❌ Calendar not found: {calendar_path}")
        sys.exit(1)
    
    if not skill_script.exists():
        print(f"❌ Skill script not found: {skill_script}")
        print("Run: npx skills add -g social-media-manager")
        sys.exit(1)
    
    # Generate markdown calendar for 4 weeks
    cmd = [
        sys.executable, str(skill_script),
        "--config", str(calendar_path),
        "--start", "2026-10-06",
        "--weeks", "4",
        "--markdown"
    ]
    
    print(f"📅 Generating calendar from {calendar_path}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ Error: {result.stderr}")
        sys.exit(1)
    
    # Save to file
    output_path = Path(__file__).parent.parent / "docs" / "SOCIAL-CALENDAR-GENERATED.md"
    output_path.write_text(result.stdout, encoding="utf-8")
    print(f"✅ Calendar saved to {output_path}")
    print(result.stdout[:2000] + "..." if len(result.stdout) > 2000 else result.stdout)

if __name__ == "__main__":
    main()