"""Redaction helpers for local Harness feedback state."""

from __future__ import annotations

import re


SECRET_PATTERNS = (
    (re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b"), "[REDACTED_API_KEY]"),
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"), "Bearer [REDACTED]"),
    (re.compile(r"\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bAKIA[A-Z0-9]{16}\b"), "[REDACTED_AWS_ACCESS_KEY]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "[REDACTED_SLACK_TOKEN]"),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{30,}\b"), "[REDACTED_GOOGLE_API_KEY]"),
    (
        re.compile(
            r"-----BEGIN [^-\r\n]*PRIVATE KEY-----.*?"
            r"-----END [^-\r\n]*PRIVATE KEY-----",
            re.DOTALL,
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (
        re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://[^/\s:@]+:)([^@\s/]+)(@)"),
        r"\1[REDACTED]\3",
    ),
    (
        re.compile(
            r"(?i)\b(api[_-]?key|secret|token|password)\b(\s*[:=]\s*)"
            r"([^\s,;]+)"
        ),
        r"\1\2[REDACTED]",
    ),
)


def redact_prompt(prompt: str) -> str:
    redacted = prompt
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    if len(redacted) > 4000:
        redacted = redacted[:4000] + "…[TRUNCATED]"
    return redacted
