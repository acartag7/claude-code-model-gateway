# Security

Never commit gateway keys, provider credentials, OAuth files, session
transcripts, or populated environment files.

The example CLIProxy configuration binds to loopback and disables remote
management. Review those boundaries before changing either setting. Put a
remotely exposed gateway behind TLS and require a strong bearer key on every
API request.

Report vulnerabilities through GitHub private vulnerability reporting. Do not
open a public issue containing credentials, request bodies, or exploit detail.
