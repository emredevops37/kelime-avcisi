"""Kelime Avcısı yerel sunucusu.

Uygulamayı ve videos klasörünü aynı Wi-Fi'daki cihazlara (telefon, tablet) sunar.
Python'un hazır sunucusundan farkı: video sarmak için gereken Range isteklerini destekler.
"""
import http.server
import os
import re
import socket
import sys
import threading
import webbrowser

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8765)
ROOT = os.path.dirname(os.path.abspath(__file__))
CLIENT_GONE = (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self._range_left = None
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        m = re.match(r"bytes=(\d*)-(\d*)$", (self.headers.get("Range") or "").strip())
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, last = m.groups()
        if first == "":
            if last == "":
                return super().send_head()
            start, end = max(0, size - int(last)), size - 1
        else:
            start, end = int(first), int(last) if last else size - 1
        end = min(end, size - 1)
        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range_left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        try:
            if self._range_left is None:
                return super().copyfile(source, outputfile)
            left = self._range_left
            while left > 0:
                buf = source.read(min(256 * 1024, left))
                if not buf:
                    break
                outputfile.write(buf)
                left -= len(buf)
        except CLIENT_GONE:
            pass  # Tarayıcılar video isteklerini sık sık yarıda keser; bu normal.
        finally:
            self._range_left = None

    def log_message(self, format, *args):
        pass


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # paket gönderilmez, sadece çıkış arayüzü seçilir
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith(("127.", "169.254.")))


def main():
    try:
        server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as e:
        print(f"Sunucu başlatılamadı: {e}")
        print(f"{PORT} portu kullanımda olabilir. Başka bir port deneyin: python serve.py 8766")
        return 1
    server.daemon_threads = True

    print()
    print("  Kelime Avcısı çalışıyor")
    print("  -----------------------")
    print(f"  Bu bilgisayarda:  http://localhost:{PORT}/")
    ips = lan_ips()
    if ips:
        print("  Telefonda (aynı Wi-Fi'da) şu adreslerden birini aç:")
        for ip in ips:
            print(f"      http://{ip}:{PORT}/")
    else:
        print("  Ağ adresi bulunamadı; bilgisayar bir Wi-Fi/ağa bağlı mı?")
    print()
    print("  Telefonda 'Bilgisayardaki videolar' düğmesi bu klasördeki videos/ içeriğini oynatır.")
    print("  Not: Sunucu açıkken bu klasör aynı ağdaki herkes tarafından okunabilir.")
    print("  Kapatmak için bu pencereyi kapat ya da Ctrl+C'ye bas.")
    print()

    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://localhost:{PORT}/")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
