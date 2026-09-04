#!/bin/sh
exec python3 -X utf8 "$(dirname "$0")/harness_hook.py" mark-review-needed
