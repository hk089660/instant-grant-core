#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?usage: install-solana-cli.sh <version> [install_dir] }"
INSTALL_DIR="${2:-$HOME/.local/share/solana/install/releases/$VERSION}"
ARCHIVE_NAME="solana-release-x86_64-unknown-linux-gnu.tar.bz2"

retrying_curl() {
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 5 \
    --retry-delay 2 \
    --retry-all-errors \
    "$@"
}

if [[ "${VERSION}" == 1* ]]; then
  if [[ -x "${INSTALL_DIR}/bin/solana" ]]; then
    echo "${INSTALL_DIR}/bin"
    exit 0
  fi

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${TMP_DIR}"' EXIT
  ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"
  DOWNLOAD_URL="https://github.com/solana-labs/solana/releases/download/v${VERSION}/${ARCHIVE_NAME}"

  retrying_curl --output "${ARCHIVE_PATH}" "${DOWNLOAD_URL}"
  tar -xjf "${ARCHIVE_PATH}" -C "${TMP_DIR}"
  rm -rf "${INSTALL_DIR}"
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  mv "${TMP_DIR}/solana-release" "${INSTALL_DIR}"
  echo "${INSTALL_DIR}/bin"
  exit 0
fi

retrying_curl "https://release.anza.xyz/v${VERSION}/install" | sh
echo "${HOME}/.local/share/solana/install/active_release/bin"
