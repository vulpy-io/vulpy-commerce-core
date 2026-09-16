# TLS close_notify: curl 8.x / OpenSSL 3.x + Python http.server

## Symptom
curl exits **56** (`CURLE_RECV_ERROR`) even though the HTTP response body was fully received.

```
* OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126:SSL routines::unexpected eof while reading, errno 0
* closing connection #0
curl: (56) OpenSSL SSL_read: OpenSSL/3.5.6: error:0A000126:SSL routines::unexpected eof while reading, errno 0
```

Confirmed environment: **curl 8.14.1 / OpenSSL 3.5.6 / Debian** against a `http.server.HTTPServer` wrapped in `ssl.SSLContext` (TLS 1.3, Python 3.11.15).

## Root cause
OpenSSL 3.x enforces RFC 8446 §6.1 — the peer **must** send a `close_notify` TLS alert before closing the connection. Python's `http.server` closes the raw socket without sending the alert. OpenSSL 3.x treats the abrupt EOF as an error; curl 8.x surfaces it as exit 56.

## No curl-only workaround
No curl flag suppresses unexpected-EOF errors in curl 8.14.1. Tested:
- `--http1.1` — still 56
- `--tlsv1.2 --tls-max 1.2` — still 56
- `--ssl-no-revoke` — Schannel only, Linux no-op

## Fix (server side, Python 3.11+)
Set `ssl.OP_IGNORE_UNEXPECTED_EOF` on the server's `SSLContext` **before** wrapping the socket:

```python
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF   # <-- add this
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
```

This tells OpenSSL to treat a missing close_notify as a clean EOF rather than an error, matching the behaviour of Python `urllib`/`http.client` and curl < 8.x.

## In a test fixture you cannot modify
File a PR adding `ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF` to the `_Server` fixture.
Optionally add a `@pytest.mark.skipif(not hasattr(ssl, 'OP_IGNORE_UNEXPECTED_EOF'), reason="Python < 3.11")`.

## Distinguishing exit 56 causes
- Exit 56 **with body in `res.stdout`**: missing close_notify (this issue)
- Exit 56 **with empty `res.stdout`**: genuine network drop or timeout
Check `res.stdout` before debugging further.

## Reproduction recipe (minimal)
```python
import http.server, ssl, socket, threading, subprocess, time

port = socket.socket(); port.bind(('127.0.0.1',0)); p = port.getsockname()[1]; port.close()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass

srv = http.server.HTTPServer(('127.0.0.1', p), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('/tmp/cert.pem', '/tmp/key.pem')
# ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF  # uncomment to fix
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.1)

r = subprocess.run(['curl','-fsSk','--max-time','3',f'https://127.0.0.1:{p}/'],
    capture_output=True, text=True)
print('exit:', r.returncode, '  body:', repr(r.stdout))
srv.shutdown()
```
