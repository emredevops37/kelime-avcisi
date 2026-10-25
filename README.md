# Kelime Avcısı

WordHunter'ın yerelde çalışan bir benzeri: altyazılı videoları kısa klipler hâlinde kaydır,
altyazıdaki bilmediğin kelimeye dokun, o cümledeki anlamını gör, yakala ve aralıklı tekrarla öğren.

## Çalıştırma

`index.html` dosyasına çift tıkla (Chrome ya da Edge önerilir). Kurulum gerekmez.

### Telefonda uygulama olarak (PWA)

Uygulama GitHub Pages gibi bir HTTPS adresinde yayınlandığında:

1. Telefonda adresi aç.
2. Android/Chrome: Ayarlar > **Ana ekrana yükle** (ya da tarayıcı menüsünden "Uygulamayı yükle").
   iPhone/Safari: **Paylaş** > **Ana Ekrana Ekle**.
3. Video ve `.srt` dosyalarını telefona kopyala (USB, Drive…), uygulamada **Dosya seç** ile ikisini birlikte seç.

Uygulama ikonuyla tam ekran açılır, internet yokken de açılır (anlam aramak için internet gerekir).
Videolar internete yüklenmez, telefonda kalır. `videos/` klasörü `.gitignore` ile yayından hariç tutulur.

### Telefonda (aynı Wi-Fi)

1. Videoları ve altyazıları bu klasördeki `videos\` içine koy.
2. `baslat.bat`'a çift tıkla (Python gerekir). Açılan pencerede `http://192.168.x.x:8765/` gibi bir adres yazar.
3. Telefonda bu adresi aç ve **Bilgisayardaki videolar**'a dokun. Videolar telefona kopyalanmadan bilgisayardan oynatılır.

- Pencere açık kaldığı sürece çalışır. Açıkken bu klasör aynı ağdaki herkes tarafından okunabilir.
- Windows güvenlik duvarı ilk seferde Python için izin sorabilir; "Özel ağlar"a izin vermen gerekir.
  Kurumsal bilgisayarlarda bu engellenmiş olabilir.
- İstersen telefonda **Dosya seç** ile telefondaki video ve `.srt` dosyalarını birlikte seçebilirsin.

Not: Her adresin (dosya, localhost, telefon) kelime kaydı ayrı tutulur. Birinden diğerine geçersen
Ayarlar > Dışa/İçe aktar ile kelimelerini taşı.

## Video ve altyazı

- Video ile İngilizce altyazı aynı klasörde ve aynı adda olmalı:
  `Bolum1.mp4` + `Bolum1.srt` ya da `Bolum1.en.srt`
- Videolar: `.mp4 .webm .mkv .mov .m4v` (en sorunsuzu MP4 / H.264 + AAC; HEVC ya da AC3 sesli dosyalar oynamayabilir)
- Altyazılar: `.srt .vtt`. Türkçe ve diğer dillerdeki altyazılar atlanır.
- Videoya gömülü altyazılar okunamaz, ayrı bir dosya olarak gerekir.
- Videosu olmayan bir altyazı dosyası da açılabilir; cümleler zamanında ekrana gelir ve tarayıcının sesiyle okunur.
- Görüntü gelip ses gelmiyorsa videonun ses biçimi (AC3, E-AC3, DTS) Chrome'da desteklenmiyordur; uygulama bunu
  uyarı olarak gösterir. Edge'de açmayı dene ya da sesi AAC'ye dönüştür
  (ör. `ffmpeg -i girdi.mkv -c:v copy -c:a aac cikti.mp4`).
- "Klasör seç" Chrome/Edge'de klasörü hatırlar; sonraki açılışta "Son klasörü aç" yeterli.

## Neler var

- **Akış:** Uzun videolar ~60 sn'lik kliplere bölünür (ayarlanabilir). Klipleri dikey kaydırırsın,
  konuşma hızı (kelime/dk) her klipte görünür.
- **Kelimeye dokun:** Türkçe karşılıklar ve cümlenin çevirisi gelir. Cümlenin çevirisinde geçen karşılık
  "bu cümlede" olarak işaretlenir. Ayrıca İngilizce tanımlar, örnekler, kök kelime ve IPA telaffuz görünür;
  kelimeyi sesli dinleyebilirsin.
- **Yakala:** Kelime, duyduğun cümle ve sahnesiyle birlikte hazinene eklenir. Yakaladığın kelimeler
  altyazıda altın renginde görünür.
- **Tekrar:** İki dokunuşla çalışır ("Anlamını göster" ve "Hatırladım / Unuttum"). Aralıklar 1, 3, 7, 14,
  30, 60… gündür. Unutulan kelime 10 dk sonra yeniden gelir. Video yüklüyse sahneyi yeniden oynatabilirsin.
- **Hazine:** Kelimeler tekrar edildikçe ham madenden altına, altından mücevhere dönüşür.

## Servisler

İnternet yalnızca anlam aramak için kullanılır, hepsi ücretsizdir ve anahtar istemez:

| Ne | Servis |
|---|---|
| Türkçe çeviri | MyMemory (anonim: günde ~5.000 karakter; Ayarlar'a e-posta yazarsan ~50.000) |
| İngilizce tanım ve örnekler | Wiktionary |
| IPA telaffuz | Datamuse |
| Sesli okuma | Tarayıcının kendi sesi (Web Speech) |

Sonuçlar tarayıcıda önbelleğe alınır, aynı kelime için tekrar istek gitmez.
Kelimelerin bu tarayıcının yerel depolamasında saklanır.

## Klavye

`Boşluk` oynat/duraklat · `↑ ↓` klip · `← →` cümle · `R` cümleyi tekrarla · `T` cümleyi çevir ·
Tekrar'da `Boşluk` göster, `1` unuttum, `2` hatırladım
