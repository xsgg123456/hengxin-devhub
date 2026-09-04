#!/bin/sh
exec python3 -X utf8 "$(dirname "$0")/harness_runtime.py" mark-review-needed
