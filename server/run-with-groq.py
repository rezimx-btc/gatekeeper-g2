#!/usr/bin/env python3
"""Dev launcher: start the Gatekeeper server with the Groq credential.

Mints an hsurr: surrogate for custom.groq via the authd socket, sets it as
GROQ_API_KEY in this process only, then execs `node src/index.js` from the
server directory. The surrogate is NEVER printed, logged, or written to disk.
"""
import os
import sys

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import dynamic_credential_entry

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    entry = dynamic_credential_entry("custom.groq")
    surrogate = str(entry["surrogate"]).strip()
    if not surrogate.startswith("hsurr:"):
        raise SystemExit("authd returned a non-surrogate value for custom.groq")
    os.environ["GROQ_API_KEY"] = surrogate
    os.chdir(SERVER_DIR)
    os.execvp("node", ["node", "src/index.js"])


if __name__ == "__main__":
    main()
