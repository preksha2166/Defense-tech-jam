#!/usr/bin/env python3
"""
Dev server for TRUSTLINE: ABYSS.

Use this instead of `python3 -m http.server` while you are editing.
Python's built-in server sends no Cache-Control header, so browsers apply
heuristic caching and quietly serve you a stale script after you save --
which looks exactly like "my change did nothing".

    python3 serve.py          # http://localhost:8777

For the actual demo you do not need this at all: just open index.html.

Two things this adds over the stock handler, both of which the intro film
made mandatory:

  THREADING.  SimpleHTTPRequestHandler on a plain TCPServer handles one
  request at a time. A 70 MB video is a single request that occupies the
  server for as long as it takes to send, so every script, stylesheet and
  texture request behind it stalls and the page appears to hang. Serving
  from a thread per connection fixes it.

  RANGE REQUESTS.  The stock handler ignores the Range header and always
  replies 200 with the whole file. Browsers use ranges to stream video and
  to seek; without them the <video> element has to buffer the entire clip
  before it will play, and scrubbing does nothing. Chrome in particular
  will often refuse to start playback at all.
"""
import http.server, socketserver, sys, os, re

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

# serve this file's own folder, wherever it was launched from
os.chdir(os.path.dirname(os.path.abspath(__file__)))

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class Handler(http.server.SimpleHTTPRequestHandler):

    # ---- no-cache, so a saved edit is the edit you see ----
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # ---- partial content, so <video> can stream and seek ----
    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()

        m = RANGE_RE.match(rng.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":                       # bytes=-N  -> final N bytes
            length = int(end_s or 0)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        end = min(end, size - 1)

        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.end_headers()
            return None

        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):            # keep the console quiet
        pass


class _Slice:
    """File-like wrapper that stops after n bytes, for 206 responses."""
    def __init__(self, f, n):
        self.f, self.left = f, n

    def read(self, amt=-1):
        if self.left <= 0:
            return b""
        if amt is None or amt < 0:
            amt = self.left
        data = self.f.read(min(amt, self.left))
        self.left -= len(data)
        return data

    def close(self):
        self.f.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True          # do not keep the process alive on ctrl-c


if __name__ == "__main__":
    with Server(("", PORT), Handler) as httpd:
        print(f"TRUSTLINE: ABYSS  ->  http://localhost:{PORT}   (ctrl-c to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
