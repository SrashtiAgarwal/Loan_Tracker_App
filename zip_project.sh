#!/bin/bash

ZIP_NAME="project.zip"

echo "Creating $ZIP_NAME..."

zip -r $ZIP_NAME . \
  -x "node_modules/*" "*/node_modules/*" \
  -x ".git/*" \
  -x ".turbo/*" "*/.turbo/*" \
  -x "venv/*" "*/venv/*" \
  -x ".venv/*" "*/.venv/*" \
  -x "__pycache__/*" "*/__pycache__/*" \
  -x "*.pyc" \
  -x "*.log" \
  -x "*.DS_Store" \
  -x "*/.expo/*" \
  -x "*/.expo-shared/*" \
  -x "*/.metro-cache/*" \
  -x "*/android/*" \
  -x "*/ios/*" \
  -x "*/dist/*" \
  -x "*/build/*" \
  -x "*/web-build/*" \
  -x "*.tsbuildinfo" \
  -x "$ZIP_NAME"

echo "✅ Done: $ZIP_NAME created successfully!"
