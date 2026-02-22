#!/bin/bash
# We-ne Mobile セットアップスクリプト
# 新しいworktree / クリーンビルド用

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "🚀 We-ne Mobile Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm ci --legacy-peer-deps

# 2. Run doctor to check/fix issues
echo ""
echo "🏥 Running doctor..."
node scripts/doctor.js --fix || true

# 3. Clean and prebuild
echo ""
echo "🧹 Cleaning native directories..."
rm -rf android ios

echo ""
echo "🔨 Running Expo prebuild..."
npx expo prebuild --clean

# 4. Setup Android local.properties
echo ""
echo "📱 Setting up Android..."
ANDROID_DIR="$ROOT_DIR/android"
LOCAL_PROPS="$ANDROID_DIR/local.properties"

if [ ! -f "$LOCAL_PROPS" ]; then
  # Find Android SDK
  SDK_PATH=""
  if [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME" ]; then
    SDK_PATH="$ANDROID_HOME"
  elif [ -n "$ANDROID_SDK_ROOT" ] && [ -d "$ANDROID_SDK_ROOT" ]; then
    SDK_PATH="$ANDROID_SDK_ROOT"
  elif [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    SDK_PATH="/opt/homebrew/share/android-commandlinetools"
  elif [ -d "$HOME/Library/Android/sdk" ]; then
    SDK_PATH="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    SDK_PATH="$HOME/Android/Sdk"
  fi
  
  if [ -n "$SDK_PATH" ]; then
    echo "sdk.dir=$SDK_PATH" > "$LOCAL_PROPS"
    echo "   ✓ Created local.properties with sdk.dir=$SDK_PATH"
  else
    echo "   ⚠ Could not find Android SDK path"
    echo "   Please create android/local.properties manually:"
    echo "   sdk.dir=/path/to/your/android/sdk"
  fi
else
  echo "   ✓ local.properties already exists"
fi

# エミュレータ用スクリプトに実行権限付与
chmod +x "$ROOT_DIR/scripts/emulator-adb.sh" 2>/dev/null || true
chmod +x "$ROOT_DIR/scripts/emulator-check.sh" 2>/dev/null || true
chmod +x "$ROOT_DIR/scripts/emulator-start.sh" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Build: cd android && ./gradlew assembleRelease"
echo "  2. Or run: npm run build:android"
echo ""
