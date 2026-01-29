#!/usr/bin/env bash
# リポジトリ全体のビルド・テスト（第三者ビルド用）
# Usage: ./scripts/build-all.sh [build|test|all]

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-all}"

run_contract_build() {
  echo "━━━ grant_program: build ━━━"
  (cd grant_program && anchor build)
}

run_contract_test() {
  echo "━━━ grant_program: test ━━━"
  (cd grant_program && anchor test)
}

run_mobile_build() {
  echo "━━━ wene-mobile: install & typecheck ━━━"
  (cd wene-mobile && npm install && npx tsc --noEmit)
}

case "$MODE" in
  build)
    run_contract_build
    run_mobile_build
    ;;
  test)
    run_contract_test
    ;;
  all)
    run_contract_build
    run_contract_test
    run_mobile_build
    ;;
  *)
    echo "Usage: $0 {build|test|all}"
    echo "  build  - anchor build + mobile typecheck"
    echo "  test   - anchor test only"
    echo "  all    - build + test + mobile (default)"
    exit 1
    ;;
esac

echo ""
echo "✅ Done."
