#!/usr/bin/env bash
# Fetches Real-ESRGAN (BSD-3-Clause, github.com/xinntao/Real-ESRGAN) for the macOS build:
# the program goes in as a sidecar, the realesrgan-x4plus model as a resource.
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"

URL="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip"
SHA256="e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -sSfL -o "$tmp/realesrgan.zip" "$URL"
echo "$SHA256  $tmp/realesrgan.zip" | shasum -a 256 -c -
unzip -q "$tmp/realesrgan.zip" -d "$tmp/x"

mkdir -p binaries upscale-models
# One universal program serves both Apple Silicon and Intel.
for target in universal-apple-darwin aarch64-apple-darwin x86_64-apple-darwin; do
  cp "$tmp/x/realesrgan-ncnn-vulkan" "binaries/realesrgan-ncnn-vulkan-$target"
  chmod +x "binaries/realesrgan-ncnn-vulkan-$target"
done
cp "$tmp/x/models/realesrgan-x4plus.bin" "$tmp/x/models/realesrgan-x4plus.param" upscale-models/
echo "Real-ESRGAN ready in src-tauri/binaries and src-tauri/upscale-models"
