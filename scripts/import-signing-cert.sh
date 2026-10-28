#!/usr/bin/env bash
# Puts the self-signed "Imagime Self-Signed" certificate (from the MACOS_CERTIFICATE
# secret, a base64 .p12) in a temporary keychain and tells tauri build to sign with it.
set -euo pipefail

name="Imagime Self-Signed"
keychain="$RUNNER_TEMP/imagime.keychain-db"
keychain_password="$(openssl rand -hex 16)"

echo "$MACOS_CERTIFICATE" | base64 --decode > "$RUNNER_TEMP/imagime.p12"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$RUNNER_TEMP/imagime.p12" -k "$keychain" -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" > /dev/null
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
rm "$RUNNER_TEMP/imagime.p12"

# codesign can sign with an untrusted certificate, but trusting it keeps the tools quiet.
security find-certificate -c "$name" -p "$keychain" > "$RUNNER_TEMP/imagime.pem"
sudo security add-trusted-cert -d -r trustRoot -p codeSign -k /Library/Keychains/System.keychain "$RUNNER_TEMP/imagime.pem" \
  || echo "Could not mark the certificate as trusted; signing anyway."
security find-identity -p codesigning "$keychain"

echo "APPLE_SIGNING_IDENTITY=$name" >> "$GITHUB_ENV"
