#!/usr/bin/env bash
# アイコン差し替え → prebuild → APKビルド → ADB経由で実機にインストール
#
# 前提: 実機をUSB接続し、USBデバッグを有効にすること
#
# 使い方:
#   cd wene-mobile && ./scripts/deploy-via-adb.sh

set -e
cd "$(dirname "$0")/.."

echo "=== 1. アイコン生成 ==="
npm run generate-icons

echo ""
echo "=== 2. Prebuild（アイコンをAndroidリソースに反映） ==="
npm run build:prebuild

echo ""
echo "=== 3. APKビルド ==="
npm run build:apk

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK_PATH" ]]; then
  echo "エラー: APKが見つかりません: $APK_PATH"
  exit 1
fi

# ADB のパス解決（PATH になければ Android SDK の platform-tools を使用）
ADB_CMD="adb"
if ! command -v adb &>/dev/null; then
  ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
  if [[ -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
    ADB_CMD="${ANDROID_HOME}/platform-tools/adb"
    echo "ADB: $ADB_CMD"
  else
    echo "エラー: adb が見つかりません。PATH に追加するか ANDROID_HOME を設定してください。"
    exit 1
  fi
fi

echo ""
echo "=== 4. デバイス確認 ==="
if ! "$ADB_CMD" devices | grep -qE 'device$'; then
  echo "エラー: ADBで認識されているデバイスがありません。"
  echo "  - 実機をUSB接続し、USBデバッグを有効にしてください。"
  echo "  - エミュレータの場合は起動してください。"
  "$ADB_CMD" devices -l
  exit 1
fi
"$ADB_CMD" devices -l

echo ""
echo "=== 5. ADB経由でインストール（既存アプリは上書き） ==="
# -r: 上書き, -d: バージョンダウングレード時も許可（アイコン差し替え等で有用）
"$ADB_CMD" install -r -d "$APK_PATH"

echo ""
echo "=== 完了 ==="
echo "アイコン付きアプリを実機にインストールしました。"
echo "ランチャーから「wene-mobile」を起動してください。"
