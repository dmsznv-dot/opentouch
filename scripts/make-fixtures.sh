#!/usr/bin/env bash
# Generates test video fixtures. Requires ffmpeg with libx264, libx265, libvpx-vp9.
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures"
ffmpeg -y -loglevel error -f lavfi -i testsrc2=size=64x64:rate=30 -t 2 -c:v libvpx-vp9 -b:v 200k bars.webm
ffmpeg -y -loglevel error -f lavfi -i testsrc2=size=1920x1080:rate=30 -t 5 -c:v libx264 -pix_fmt yuv420p bars-h264.mp4
ffmpeg -y -loglevel error -f lavfi -i testsrc2=size=1920x1080:rate=30 -t 5 -c:v libx265 -x265-params log-level=error -tag:v hvc1 -pix_fmt yuv420p bars-hevc.mp4
