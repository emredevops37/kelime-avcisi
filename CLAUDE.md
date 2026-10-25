# Kelime Avcısı

Altyazılı videolardan İngilizce kelime öğrenme PWA'sı (WordHunter benzeri). Derleme adımı yok: düz HTML/CSS/JS.
Yayın: https://emredevops37.github.io/kelime-avcisi/ (GitHub Pages, `main` dalının kökünden).

## Dosyalar
- `app.js`: uygulamanın tamamı; bölümler `/* ---------------- ad ---------------- */` başlıklarıyla ayrılır
- `index.html`, `style.css`: arayüz; renkler `:root` değişkenlerinde, koyu tema dahil
- `sw.js`: service worker (önce ağ, sonra önbellek). Yeni dosyayı `SHELL`'e ekle; değişiklikte `CACHE` sürümünü artır
- `manifest.webmanifest`: PWA + Android paylaş menüsü (`share_target`)
- `serve.py` / `baslat.bat`: Range destekli yerel sunucu (aynı Wi-Fi'daki telefona da açar)
- `videos/`: kişisel test videoları; `.gitignore`'da, asla commit'lenmez

## Çalıştırma ve test
- `python serve.py 8765 --no-browser` → `http://127.0.0.1:8765/` (`localhost` değil: IPv6'da başka sunucuya düşebiliyor)
- `node --check app.js`; test çerçevesi yok, tarayıcıda dene
- Claude'un tarayıcı paneli yerel http'de service worker kaydetmez; SW'yi yayındaki sitede doğrula
- Testten sonra oynayan video ya da açık sekme bırakma: gizli panelden ses gelir

## Kurallar
- Arayüz metinleri ve kod yorumları Türkçe
- Commit, merge ve push yalnız açık onayla. Yayın: özellik dalı → `main`'e ileri sarmalı merge → push
- YouTube altyazısını otomatik çekme (bot korumasını aşmak gerekir); kullanıcı .srt ya da transkript verir
- Harici servisler: Wiktionary (tanım), Datamuse (IPA), MyMemory (çeviri), YouTube IFrame API

## Notlar
Ayrıntılı notlar depo dışında, sahibinin Obsidian kasasında: `~/Desktop/Emre/Obsidian-Kasa/Kelime Avcısı/`
- `Durum.md`: her oturumun başında oku
- `Kararlar.md`, `Mimari.md`, `Yapılacaklar.md`: gerektiğinde oku
- Oturum sonunda istenirse `Durum.md`'yi, `Yapılacaklar.md`'yi ve `Oturumlar/` altına o günün özetini güncelle
