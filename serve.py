#!/usr/bin/env python3
"""
Dev server for TRUSTLINE: ABYSS.

Use this instead of `python3 -m http.server` while you are editing.
Python's built-in server sends no Cache-Control header, so browsers apply
heuristic caching and quietly serve you a stale script after you save --
which looks exactly like "my change did nothing".

    python3 serve.py          # http://localhost:8777

For the actual demo you do not need this at all: just open index.html.
"""
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

# serve this file's own folder, wherever it was launched from
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):            # keep the console quiet
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as httpd:
    print(f"TRUSTLINE: ABYSS  ->  http://localhost:{PORT}   (ctrl-c to stop)")
    httpd.serve_forever()
