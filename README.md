# Rollback Netcode & Deterministik Lockstep

"İki Tahta, Tek Oyun: Sıfırdan Rollback Netcode ve Deterministik Lockstep"
makalesinin çalışan kodu. Sunucu yok, otorite yok. İki istemci aynı deterministik
simülasyonu koşar, aralarında **sadece girdi** dolaşır; rakibin girdisi geç
geldiğinde tahmin edilir, tahmin tutmazsa zaman geri sarılıp o kareden bugüne
yeniden oynanır.

Simülasyon **tamamen fixed-point tamsayı** (16.16). İçinde `Math.random`,
`Math.sin`, `Math.cos`, `Math.sqrt` ve tek bir kayan nokta bile yok — determinizm
bunun üzerine kurulu. Doğrulama aracı FNV-1a **state hash**'i.

Ağ, sayfa içinde sabit gecikmeli bir kanalla **simüle** edilir
(`SimulatedChannel`, 150 ms). WebRTC, WebSocket, Node süreci **gerekmez**; demo da
testler de tek başına çalışır.

## Kurulum

```bash
npm install
```

## Çalıştırma (demo)

```bash
npm run dev
```

- `http://localhost:5173/` → yan yana iki canvas: **P1 (ok tuşları)** ve
  **P2 (WASD)**. Her panel bir "istemci"nin kendi bakış açısı; ikisinin arasında
  tek yönlü 150 ms gecikmeli kanal var.
- HUD'da her iki oturumun kare numarası, rollback ve stall sayacı; alt satırda
  **onaylı karenin** iki taraftaki hash'i ve `SENKRON` / `DESYNC!` damgası.
- **rollback** checkbox'ını kapatın: tahmin devre dışı kalır, saf lockstep
  davranışı başlar — hareket gözle görülür biçimde ağırlaşır, `stall` sayacı
  fırlar. Açın: tuşa basınca top anında kıpırdar, `rollback` sayacı saniyede
  onlarca artar, ekranda hiçbir sıçrama görünmez.

> Hash neden **onaylı** kareden alınıyor? Çünkü son birkaç kare iki tarafta da
> spekülatiftir (herkes ötekinin girdisini tahmin eder) ve doğal olarak
> farklıdır. Ölçüldü: 900 karelik koşuda spekülatif hash 898 karede farklı,
> onaylı kare hash'i 900/900 aynı. Senkron kontrolü onaylı karede yapılır.

> `file://` ile açarsanız boş ekran gelir; mutlaka `npm run dev` (Vite) ile açın.

## Test

```bash
npm test
```

26 test, hepsi **saf mantık** — canvas, DOM, WebGL, ağ yok:

- `test/fixed.test.ts` (7) — 16.16 aritmetiği: sıfıra doğru simetrik yuvarlama,
  negatif sıfır tuzağı (`fpMul(-1, 1) === 0`), `0.1` birikiminin TAM kalması,
  `isqrt`, `fpLen`, 2^53 bütçesi.
- `test/sim.test.ts` (7) — determinizm (aynı girdi → aynı hash ve `toEqual`),
  tek kare farkının hash'i değiştirmesi, `step`'in saflığı, **float sızıntısı
  bekçisi** (tüm alanlar `Number.isInteger`), arena sınırları, iç içe geçmeme.
- `test/rollback.test.ts` (8) — `reference` (ağsız gerçek) + `runPair` (kare
  tabanlı tel) koşum takımı. Ana iddia: 240 kare, 9 kare gecikme, onlarca geri
  sarma sonrası `a.state` **`toEqual`** hiç yanılmamış referans. Ayrıca desync
  yok, `inputDelay === gecikme` → `rollbackCount === 0`, en eski hatalı kareye
  dönme (`lastRollbackDepth === 3`), stall, ve saf lockstep'in ağır çekimi.
- `test/channel.test.ts` (4) — enjekte saatli kanal + demo döngüsünün DOM'suz
  kopyası: onaylı kare hash'i 900/900 eşit, spekülatif kareler ayrışıyor.

## Bench

```bash
npm run bench
```

Rollback'in gerçek maliyeti: kare başına kaç kare **yeniden** oynanıyor?
Sayaçlar (rollback / replay / stall) tamamen deterministiktir; yalnızca ns
sütunları makineye göre değişir. Gerçek çıktı (Apple Silicon, Node 22):

```
rollback maliyeti · 3000 kare · inputDelay=2 · maxRollback=24
gecikme (kare) | ~ms | rollback | replay kare | replay/kare | step/kare | stall
---------------|-----|----------|-------------|-------------|-----------|------
             0 |   0 |        0 |           0 |        0.00 |      1.00 |     0
             2 |  33 |        0 |           0 |        0.00 |      1.00 |     0
             4 |  67 |      462 |         922 |        0.31 |      1.31 |     0
             6 | 100 |      462 |        1844 |        0.61 |      1.61 |     0
             9 | 150 |      462 |        3227 |        1.08 |      2.08 |     0
            12 | 200 |      461 |        4600 |        1.53 |      2.53 |     0
            18 | 300 |      460 |        7344 |        2.45 |      3.45 |     0

her gecikmede aynı son durum: EVET (hash 427844e5)

saveState (cloneState): 25.6 ns · loadState (cloneState): 25.0 ns · step: 636.6 ns
60 FPS'te kare bütçesi 16.7 ms; en kötü satırın simülasyon maliyeti 0.0022 ms.
```

Okunuşu: geri sarma **sayısını** ağ değil oyuncunun yön değiştirme sıklığı
belirliyor (462 → 460, neredeyse sabit). Gecikmeyle büyüyen şey her yanlışın
**derinliği**: 150 ms'te `step` karede ortalama 2.08 kez, 300 ms'te 3.45 kez
koşuyor. Son satır mimarinin sağlaması: gecikme ne olursa olsun bitiş durumunun
hash'i aynı (`427844e5`) — ağ sonucu değil, sonuca varma yolunu değiştiriyor.

## Build / typecheck

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc && vite build
```

## Dosyalar

```
index.html            iki canvas (320x240), rollback anahtarı, HUD
src/fixed.ts          16.16 sabit noktalı aritmetik (fpMul/fpDiv/isqrt/fpLen)
src/sim.ts            deterministik simülasyon: step/integrate/resolvePair/
                      bounceWalls + cloneState + FNV-1a hashState
src/input-buffer.ts   kare numaralı halka tampon, onaylı/tahmin damgası, predict
src/lockstep.ts       saf lockstep oturumu (eksik girdide bekler)
src/rollback.ts       RollbackSession: tahmin, geri sarma, yeniden oynatma, prune
src/channel.ts        sabit gecikmeli sayfa-içi kanal (enjekte edilebilir saat)
src/main.ts           demo döngüsü: iki oturum, iki canvas, HUD
src/bench-cli.ts      rollback maliyeti / gecikme tablosu + save/load/step ns
test/                 26 test (vitest, DOM'suz)
```

## Lisans

MIT
