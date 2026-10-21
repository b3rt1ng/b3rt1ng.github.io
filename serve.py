#!/usr/bin/env python3
"""Dev server for the site.

`python -m http.server` sends Last-Modified but no Cache-Control, so browsers
fall back to heuristic freshness and will happily serve a stale copy without
revalidating. Edits then appear to do nothing, which is a miserable way to
lose half an hour. This sends no-store instead.

    python3 serve.py [port]        # default 8080
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler) as httpd:
        print(f"serving {sys.path[0] or '.'} on http://127.0.0.1:{port}  (no-cache)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
