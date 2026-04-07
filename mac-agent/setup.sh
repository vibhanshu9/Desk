#!/bin/bash
# ============================================================
# RemoteDesk macOS Agent – Setup Script
# ============================================================
set -e

echo "════════════════════════════════════════════════════════"
echo "  RemoteDesk macOS Agent Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Check macOS ───────────────────────────────────────────────
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ This script is macOS-only."
  exit 1
fi

# ── Check Python ──────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌ python3 not found. Install via: brew install python"
  exit 1
fi

echo "✓ Python3 found: $(python3 --version)"

# ── Install pip deps ──────────────────────────────────────────
echo ""
echo "Installing Python dependencies..."
pip3 install --upgrade websockets Pillow pyobjc-framework-Quartz pyobjc-framework-Cocoa 2>&1 | tail -5
echo "✓ Dependencies installed"

# ── Permissions guidance ──────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  REQUIRED: macOS Permissions"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. SCREEN RECORDING"
echo "   System Settings → Privacy & Security → Screen Recording"
echo "   → Enable for Terminal (or your Python launcher)"
echo ""
echo "2. ACCESSIBILITY (for mouse/keyboard injection)"
echo "   System Settings → Privacy & Security → Accessibility"
echo "   → Enable for Terminal (or your Python launcher)"
echo ""
echo "After granting permissions, you may need to restart Terminal."
echo ""

# ── Open system prefs ─────────────────────────────────────────
read -p "Open Privacy & Security settings now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  sleep 1
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo "  Run: python3 agent.py [SESSION-ID]"
echo "  Example: python3 agent.py ABCD-1234"
echo "════════════════════════════════════════════════════════"
