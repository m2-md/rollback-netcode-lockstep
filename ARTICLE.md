# İki Tahta, Tek Oyun: Sıfırdan Rollback Netcode ve Deterministik Lockstep

*Sunucu yok. İki istemci aynı deterministik simülasyonu koşuyor, birbirinin girdisini tahmin ediyor, yanılınca zamanı geri sarıp yeniden oynuyor. Fixed-point matematik, state hash ve TypeScript ile.*

*Tahmini okuma süresi: 18 dakika*

---

Bir sayfada iki canvas açtım, iki oyuncu koydum, aralarına 150 milisaniyelik bir gecikme serptim. İki taraf da 600 kare boyunca kendi kafasına göre koştu. Aralarında tek bir konum paketi gitmedi; kimse kimseye "ben şurdayım" demedi.

Altı yüz karenin sonunda iki taraftaki topların koordinatları tamsayı tamsayı aynıydı.

Bu, önceki iki yazıda kurduğumuz mimarinin tam tersi. [Client-side prediction ve server reconciliation](../client-prediction-server-reconciliation/article.md) yazısında istemciye tahmin ettirip sunucuya düzelttirmiştik. [Node'da otoriter sunucu](../authoritative-multiplayer-server-node/article.md) yazısında da o sunucuyu gerçekten kurmuştuk: odalar, tick döngüsü, "istemciye asla inanma" disiplini. İkisinde de tek bir cümle vardı: doğru olan sunucudur.

Bu yazıda o cümleyi siliyoruz. Ortada sunucu yok, otorite yok, tek gerçek kaynak yok. Bunun yerine iki tarafın da **matematiksel olarak yanılamayacağı** bir düzen kuruyoruz.

Bunu mektupla satranç gibi düşünün. İki oyuncu, iki ayrı şehirde, iki ayrı tahta. Ortada hakemin tuttuğu üçüncü bir tahta yok. Herkes kendi tahtasında oynar, sadece hamlelerini postalar: "Atı f3'e." Karşı taraf mektubu alınca kendi tahtasında aynı hamleyi yapar. İki tahta, tek oyun. Bu düzenin çalışması tek bir şarta bağlı: kural kitabının iki tarafta da harfi harfine aynı olması. Birinizin kitabında rok atmayla ilgili küçük bir ev kuralı varsa, oyun sessizce ikiye ayrılır ve bunu ancak on hamle sonra fark edersiniz.

Bundan sonraki her başlık bu tahtanın bir köşesinde geçiyor. Kural kitabı deterministik simülasyon olacak, mektup girdi paketi, zarfı beklemek lockstep. Rakibin hamlesini tahmin edip oynamaya devam etmek rollback; tahtanın fotoğrafını çekmek save state; mektubun altına "17. hamleden sonra tahtam şöyle görünüyor" diye not düşmek de state hash.

Bir de ön koşul var. [Sabit adımlı döngü](../fixed-timestep-render-interpolation/article.md) yazısında metronomu kurmamış olsaydık bu yazı yazılamazdı; determinizm, sabit adım olmadan mümkün değil. Kare süresi makineden makineye değişiyorsa iki tahta ilk saniyede ayrışır.

### İki Model: Otorite mi, Determinizm mi

Multiplayer mimarisinde tek bir soruya cevap verirsiniz: dünyanın doğru hali kimde duruyor?

Otoriter modelde cevap nettir. Doğru hal sunucudadır. İstemci ne yapmak istediğini söyler, sunucu ne olduğuna karar verir, sonucu yayınlar. İstemci tahmin edebilir, ama tahmini sadece bir his katmanıdır; her snapshot'ta gerçek gelir ve tahmini yerine oturtur. Hile yapmak isteyen istemci ekranında istediğini gösterir, dünyada hiçbir şeyi değiştiremez.

Deterministik modelde ise doğru hal hiçbir yerde durmaz. Daha doğrusu, her yerde aynı anda durur. İki istemci de aynı simülasyonu koşar; aralarında sadece **girdi** dolaşır. Kimse kimseye konum göndermez, çünkü konum girdiden hesaplanabilir. Bu mimariye deterministic lockstep (deterministik kilit adım) denir ve RTS ile dövüş oyunlarının kırk yıllık standardıdır.

İkisini yan yana koyalım:

| | Otoriter sunucu | Deterministik lockstep + rollback |
|---|---|---|
| Gerçeğin kaynağı | Sunucu | Paylaşılan simülasyon |
| Ağda ne dolaşır | Girdi + snapshot | Sadece girdi |
| Bant genişliği | Oyuncu/nesne sayısıyla büyür | Oyuncu sayısıyla büyür, dünyayla değil |
| Sunucu maliyeti | Var, sürekli | Sıfır (P2P) |
| Hile direnci | Yüksek | Düşük (herkes tüm state'i görür) |
| Determinizm zorunlu mu | Hayır (uzlaştırma için tercih) | Evet, bit düzeyinde |
| Tipik kullanım | MMO, FPS, rekabetçi nişancı | Dövüş oyunu, RTS, 1v1 |

Bant genişliği satırı, bu modelin neden RTS'lerde doğduğunu tek başına açıklıyor. Ekranda 500 birim varsa, otoriter modelde her tick'te 500 birimin konumunu yayınlamanız gerekir. Deterministik modelde iki oyuncunun tuş durumunu yayınlarsınız: kare başına birkaç bayt. 1998'de Age of Empires bu yüzden 28.8k modemden 1500 birimlik savaşları koşturabiliyordu.

Hile direnci satırı ise ters yönde acımasız. Herkeste tüm simülasyon durduğu için, fog of war (savaş sisi) sadece çizim katmanında bir maskeleme olur; kararlı bir saldırgan hafızadan rakibin ne yaptığını okuyabilir. Otoriter modelde bu bilgi istemciye hiç gönderilmez. O yüzden "hangisi daha iyi" sorusu yanlış soru. Rekabetçi bir FPS yazıyorsanız otoriter sunucu tek makul seçenek; iki kişilik bir dövüş oyunu yazıyorsanız rollback netcode neredeyse zorunlu.

Bir şeye dikkat: prediction fikri iki modelde de var, ama hedefi başka. Otoriter modelde *kendi* hareketinizi tahmin edersiniz, çünkü sunucunun onayı geç gelir. Burada rakibin **girdisini** tahmin edersiniz, çünkü onun mektubu geç gelir. Birinde sonucu, ötekinde sebebi tahmin ediyorsunuz. Fark ince ama her şeyi değiştiriyor: sebebi tahmin edip yanılırsanız, o sebepten doğan bütün sonuçları geri almanız gerekir.

### Bit Düzeyinde Determinizm Şartı

Kural kitabı meselesine dönelim. İki tahtanın aynı kalması için `step` fonksiyonunun iki makinede birebir aynı sonucu vermesi lazım. Yaklaşık değil. Birebir.

Floating point (kayan nokta) burada klasik tuzaktır ve nedenini yanlış bilenler çoktur. IEEE-754'ün dört işlemi ve `Math.sqrt`'i standartta tam olarak tanımlıdır; toplama iki makinede farklı sonuç vermez. Tehlike başka yerde: `Math.sin`, `Math.cos`, `Math.tan`, `Math.exp`, `Math.pow` gibi transandantal fonksiyonların doğruluğu standartta bağlanmamıştır. V8, SpiderMonkey ve JavaScriptCore bunlar için farklı yaklaşım algoritmaları kullanabilir. Son bitte bir fark, iki kare sonra piksel farkı, on saniye sonra bambaşka bir oyun demektir.

Sonra bir de şu var: derleyicinin ara sonuçları hangi genişlikte tuttuğu, `x * y + z`'yi tek bir birleşik işleme (FMA) çevirip çevirmediği, `Math.fround` optimizasyonları. Bunların hepsini kontrol altında tutabilir misiniz? Teorik olarak evet. Pratikte kimse denemiyor.

Kestirme yol: simülasyonda kayan noktayı hiç kullanmamak. Bütün konum, hız ve sabitleri tamsayı tutup **fixed-point** (sabit noktalı) aritmetikle çalışıyoruz. 16.16 formatı işimizi görür: bir sayının gerçek değeri, tuttuğumuz tamsayının 65536'ya bölümüdür.

```ts
// src/fixed.ts — 16.16 sabit noktalı aritmetik.
// Tüm değerler TAMSAYIDIR: gerçek sayı x, tamsayı olarak x * 65536 tutulur.
export type Fixed = number;

export const FP_BITS = 16;
export const ONE: Fixed = 1 << FP_BITS; // 65536 = 1.0

export function fromInt(n: number): Fixed {
  return n * ONE;
}

export function toNumber(f: Fixed): number {
  return f / ONE;
}

// Çarpım: (a*b) / ONE. Bölen ikinin kuvveti olduğu için bölme TAM,
// trunc ise yuvarlamayı sıfıra doğru sabitler. Aynı sonuç her motorda.
export function fpMul(a: Fixed, b: Fixed): Fixed {
  // Sondaki "+ 0" şaka değil: Math.trunc(-0.4) === -0 döner ve -0, 0'a EŞİT DEĞİLDİR.
  return Math.trunc((a * b) / ONE) + 0;
}

export function fpDiv(a: Fixed, b: Fixed): Fixed {
  if (b === 0) return 0;
  return Math.trunc((a * ONE) / b) + 0;
}
```

O `+ 0` satırı bana üç saat kaybettirdi. Testlerim durumu `toEqual` ile karşılaştırıyordu ve bir tanesi inatla kırmızı kalıyordu; ekranda "expected 0 to be -0" yazıyordu. `Math.trunc(-0.4)` negatif sıfır döndürüyor, `Object.is(-0, 0)` ise `false`. Hash'i bozmuyor (`(-0) | 0` temiz sıfır verir), ama nesne karşılaştırmasını bozuyor. Determinizmle uğraşırken öğrendiğim şey bu oldu: sorunlar hep bu boyda geliyor.

JavaScript'te tüm sayılar zaten `double` olduğu için "tamsayı tutuyorum" demek bir disiplin sözü. `a * b` çarpımı 2^53'ü aşarsa sessizce kesinlik kaybedersiniz ve determinizm biter. Arenamız 320x240, en büyük koordinat 320 * 65536 ≈ 2.1e7; iki koordinatın karesinin toplamı 2^53'ün epey altında kalıyor. Bu sınırı ilerde bir testle çiviliyoruz.

Karekök de lazım, ama `Math.sqrt` yerine tamsayı Newton kullanıyoruz. Standarda göre `Math.sqrt` güvenli olsa da, kuralı "simülasyon içinde `Math.*` yok" diye tek cümlede tutmak kod incelemesinde çok daha kolay:

```ts
// src/fixed.ts — devamı
// Tamsayı karekök (Newton). Math.sqrt yok — simülasyonda Math.* kullanmıyoruz.
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  if (n < 4) return 1;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

// |(x, y)| — girdiler ONE ölçekli, çıktı da ONE ölçekli.
export function fpLen(x: Fixed, y: Fixed): Fixed {
  return isqrt(x * x + y * y);
}
```

Şimdi simülasyonun kendisi. İki oyuncu, arena duvarları, birbirine çarpınca sekme. Girdi, tuş bitlerinden oluşan tek bir sayı; state ise saf veri:

```ts
// src/sim.ts — deterministik simülasyon. Math.random / sin / cos / sqrt YOK.
// (resolvePair, bounceWalls, createInitialState ve toDraw dosyanın devamında)
import {
  fpMul,
  fpDiv,
  fpLen,
  fromInt,
  toNumber,
  ONE,
  type Fixed,
} from "./fixed";

export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;

export interface Player {
  x: Fixed;
  y: Fixed;
  vx: Fixed;
  vy: Fixed;
}

export interface GameState {
  frame: number;
  players: Player[];
}

export const ARENA_W = fromInt(320);
export const ARENA_H = fromInt(240);
export const RADIUS = fromInt(12);

const ACCEL = 22937; // ~0.35 px/kare²
const FRICTION = 60293; // ~0.92
const MAX_SPEED = 262144; // 4.0 px/kare
const RESTITUTION = 45875; // ~0.7
const SQRT1_2 = 46341; // 0.70710678 * 65536

// Saf fonksiyon: aynı (state, inputs) → her zaman aynı çıktı, bit bit.
export function step(state: GameState, inputs: number[]): GameState {
  const players = state.players.map((p, i) => integrate(p, inputs[i] ?? 0));
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      resolvePair(players[i], players[j]);
    }
  }
  // Duvar en son konuşur: çarpışma itmesi kimseyi arenanın dışına atmasın.
  for (const p of players) bounceWalls(p);
  return { frame: state.frame + 1, players };
}

function integrate(p: Player, input: number): Player {
  let ax = 0;
  let ay = 0;
  if (input & LEFT) ax -= ONE;
  if (input & RIGHT) ax += ONE;
  if (input & UP) ay -= ONE;
  if (input & DOWN) ay += ONE;
  if (ax !== 0 && ay !== 0) {
    // Çapraz harekette hız sabit kalsın. Math.SQRT1_2 değil, tamsayı sabiti.
    ax = fpMul(ax, SQRT1_2);
    ay = fpMul(ay, SQRT1_2);
  }

  let vx = fpMul(p.vx, FRICTION) + fpMul(ax, ACCEL);
  let vy = fpMul(p.vy, FRICTION) + fpMul(ay, ACCEL);

  const speed = fpLen(vx, vy);
  if (speed > MAX_SPEED) {
    vx = fpDiv(fpMul(vx, MAX_SPEED), speed);
    vy = fpDiv(fpMul(vy, MAX_SPEED), speed);
  }

  return { x: p.x + vx, y: p.y + vy, vx, vy };
}
```

`step` saf ve deterministik. Dikkat edin, `dt` parametresi bile yok. Sabit adımlı döngüde kare süresi zaten sabit olduğu için hız birimini doğrudan "piksel bölü kare" seçtik ve `dt` çarpanını tamamen ortadan kaldırdık. Bu bir sadeleştirme değil, bir güvenlik önlemi: ortada `dt` yoksa yanlışlıkla değişken `dt` geçirme ihtimali de yok.

`resolvePair` ve `bounceWalls` aynı disiplinle yazıldı; tam hali repoda. Bir tanesinde küçük bir sıra hatası yapıp yarım gün kaybettim: önce duvar sekmesini, sonra oyuncu çarpışmasını çözüyordum, çarpışma itmesi bazen oyuncuyu duvarın dışına atıyordu. Deterministikti, ama yanlıştı. Determinizm doğruluk garantisi vermiyor, sadece iki tarafın **aynı** yanlışı yapmasını garantiliyor.

### Lockstep: Herkesin Girdisi Gelene Kadar Bekle

Kural kitabı aynı. Şimdi hamleleri postalayalım.

En dürüst tasarım: bir kareyi simüle etmek için o kareye ait TÜM oyuncuların girdisi elinizde olmalı. Yoksa beklersiniz. Mektupla satrançta olduğu gibi, rakibin zarfı gelmeden kendi tahtanızda taş oynatmazsınız.

Girdileri kare numarasına göre saklayan bir ring buffer (halka tampon) yazalım. Aynı yapı birazdan rollback'te de işimize yarayacak:

```ts
// src/input-buffer.ts — kare numarasına göre girdi saklayan halka tampon.
export class InputBuffer {
  private readonly owner: Int32Array; // slot -> hangi kare
  private readonly value: Int32Array; // slot -> girdi bitleri
  private readonly sure: Uint8Array; // slot -> 1: gerçek, 0: tahmin
  lastConfirmed = -1;

  constructor(private readonly size = 256) {
    this.owner = new Int32Array(size).fill(-1);
    this.value = new Int32Array(size);
    this.sure = new Uint8Array(size);
  }

  private slot(frame: number): number {
    return ((frame % this.size) + this.size) % this.size;
  }

  set(frame: number, input: number, confirmed: boolean): void {
    const s = this.slot(frame);
    this.owner[s] = frame;
    this.value[s] = input;
    this.sure[s] = confirmed ? 1 : 0;
    if (confirmed && frame > this.lastConfirmed) this.lastConfirmed = frame;
  }

  has(frame: number): boolean {
    return this.owner[this.slot(frame)] === frame;
  }

  isConfirmed(frame: number): boolean {
    return this.has(frame) && this.sure[this.slot(frame)] === 1;
  }

  get(frame: number): number {
    return this.has(frame) ? this.value[this.slot(frame)] : 0;
  }

  // Tahmin: "oyuncu ne yapıyorsa onu yapmaya devam eder."
  // Bilinen en son ONAYLI girdiyi tekrarla.
  predict(frame: number): number {
    const from = Math.min(frame - 1, this.lastConfirmed);
    const floor = Math.max(0, frame - this.size);
    for (let f = from; f >= floor; f--) {
      if (this.isConfirmed(f)) return this.value[this.slot(f)];
    }
    return 0;
  }
}
```

`owner` dizisine dikkat: halka tamponda 200. kare ile 456. kare aynı slotu paylaşır. Slotun hangi kareye ait olduğunu yazmazsanız, 250 kare önceki bir girdiyi bugünün girdisi sanırsınız. Bu tür bir hatayı ekranda görmezsiniz, sadece bir gün oyun ayrışır.

Saf lockstep oturumu bundan sonra utanç verecek kadar basit:

```ts
// src/lockstep.ts — saf lockstep: herkesin girdisi gelmeden kare ilerlemez.
import { InputBuffer } from "./input-buffer";
import { cloneState, step, type GameState } from "./sim";
import type { InputMessage, SessionOptions } from "./rollback";

export class LockstepSession {
  state: GameState;
  readonly localPlayer: number;
  readonly inputDelay: number;
  stallCount = 0;
  private readonly buffers: InputBuffer[];

  constructor(initial: GameState, opts: SessionOptions) {
    this.state = cloneState(initial);
    this.localPlayer = opts.localPlayer;
    this.inputDelay = opts.inputDelay ?? 0;
    this.buffers = initial.players.map(() => new InputBuffer(256));
  }

  get frame(): number {
    return this.state.frame;
  }

  addLocalInput(input: number): InputMessage {
    const frame = this.state.frame + this.inputDelay;
    this.buffers[this.localPlayer].set(frame, input, true);
    return { player: this.localPlayer, frame, input };
  }

  receive(msg: InputMessage): void {
    this.buffers[msg.player].set(msg.frame, msg.input, true);
  }

  // Tek fark bu satır: eksik girdi varsa bekle. Tahmin yok, geri sarma yok.
  advance(): boolean {
    const f = this.state.frame;
    if (!this.buffers.every((b) => b.isConfirmed(f))) {
      this.stallCount++;
      return false;
    }
    this.state = step(
      this.state,
      this.buffers.map((b) => b.get(f)),
    );
    return true;
  }
}
```

Bu kod doğru. Ve oynanamaz.

Sebebini hesaplayalım. 60 FPS'te bir kare 16.7 ms sürer. Tek yön gecikme 150 ms ise, benim 100. kareye ait girdim size 9 kare sonra ulaşır. Siz 100. kareyi simüle etmek için onu beklersiniz. Ama benim 100. kare girdimi üretmem için de sizin 99. kare girdinizi almış olmam gerekiyordu. İki taraf birbirini kilitler ve oyun, kare hızı 60 olan bir ekranda saniyede 6-7 kare ilerler.

Kare atlamıyorsunuz. Zaman yavaşlıyor. Oyun ağır çekim oynuyor ve tuşa bastığınızda hiçbir şey olmuyor.

### Girdi Gecikmesi (Input Delay): Beklemeyi Gizlemenin Ucuz Yolu

Lockstep'in derdi tek cümleye sığıyor: karşı tarafın girdisine ihtiyacın var ama o girdi henüz doğmamış bile.

Peki girdiyi daha erken doğurabilir miyiz? Hayır. Ama uygulanacağı kareyi ileri itebiliriz.

Fikir şu: tuşa bastığınızda girdi şu anki kareye değil, `N` kare sonrasına yazılır. İki taraf da aynısını yapar. Böylece mektup postaya erken verilmiş olur ve karşı tarafa, o girdiye ihtiyaç duyulmadan önce ulaşır. Kodda tek satır:

```ts
// src/rollback.ts — RollbackSession.addLocalInput
  addLocalInput(input: number): InputMessage {
    // Girdi ŞİMDİ değil, inputDelay kare SONRASI için planlanır.
    const frame = this.state.frame + this.inputDelay;
    this.buffers[this.localPlayer].set(frame, input, true);
    return { player: this.localPlayer, frame, input };
  }
```

Bunun adı **input delay** (girdi gecikmesi) ve dövüş oyunlarında yıllarca tek çözüm buydu. Bedeli de tek cümle: kendi hareketiniz de geç başlar. 150 ms gecikmeyi tamamen kapatmak için 9 karelik input delay gerekir; bu, tuşa bastıktan 150 ms sonra karakterinizin kıpırdaması demektir. Yerel oyunda 2-3 kare olan girdi gecikmesi bir anda 11-12 kareye çıkar. Deneyimli bir oyuncu bunu parmağında hisseder.

Yine de işe yarıyor ve gerçekten bedava. Doğru kullanım, gecikmeyi tek başına kapatmak değil; küçük bir input delay (2-3 kare) ile ağın işini kolaylaştırıp geri kalanını rollback'e bırakmak. Testlerde bunu ölçeceğiz: input delay ağ gecikmesine eşitlenirse rollback sayısı sıfıra iniyor.

### Rollback: Tahmin Et, Yanılırsan Geri Sar

Şimdi asıl fikir. Mektup gelmediyse beklemek yerine, rakibin ne yaptığını tahmin edip devam ediyoruz.

Tahmin algoritması gülünç derecede basit: "az önce ne yapıyorsan onu yapmaya devam ediyorsun." İnsan parmağı 16 milisaniyede nadiren fikir değiştirir; sağa gidiyorsanız bir sonraki karede de büyük ihtimalle sağa gidiyorsunuzdur. Pratikte bu tahmin karelerin yüzde doksanından fazlasında tutuyor.

Peki tutmadığında? İşte rollback netcode'un tamamı burada:

1. Gerçek girdi geldi, tahminimizden farklı.
2. O kareye ait kaydedilmiş durumu geri yükle.
3. Doğru girdiyle o kareden bugüne kadar her şeyi yeniden simüle et.
4. Oyuncuya sadece son halini göster.

Satranç tahtasında taşları birkaç hamle geri alıp, bu sefer rakibin gerçek hamlesiyle aynı yolu tekrar yürümek gibi. Oyuncu bunu bir hata olarak görmez; sadece rakibin karakteri bir anda "başka bir şey yapmış" gibi görünür.

Çekirdek sınıf:

```ts
// src/rollback.ts — tahmin et, yanılırsan geri sar.
// (import'lar ile InputMessage/SessionOptions arayüzleri dosyanın başında;
//  advance/canAdvance/simulateFrame/rollback/prune aşağıda ayrı ayrı)
export class RollbackSession {
  state: GameState;
  readonly localPlayer: number;
  readonly remotePlayer: number;
  readonly inputDelay: number;
  readonly maxRollback: number;

  predictionEnabled = true;
  rollbackCount = 0;
  lastRollbackDepth = 0;
  stallCount = 0;

  private readonly buffers: InputBuffer[];
  private readonly saved = new Map<number, GameState>();
  private pendingRollbackTo: number | null = null;

  constructor(initial: GameState, opts: SessionOptions) {
    this.state = cloneState(initial);
    this.localPlayer = opts.localPlayer;
    this.remotePlayer = 1 - opts.localPlayer;
    this.inputDelay = opts.inputDelay ?? 2;
    this.maxRollback = opts.maxRollback ?? 8;
    this.buffers = initial.players.map(() => new InputBuffer(256));
  }

  addLocalInput(input: number): InputMessage {
    // Girdi ŞİMDİ değil, inputDelay kare SONRASI için planlanır.
    const frame = this.state.frame + this.inputDelay;
    this.buffers[this.localPlayer].set(frame, input, true);
    return { player: this.localPlayer, frame, input };
  }

  // Uzak girdi geldi. Tahminimiz yanlışsa geri sarma borcu yazılır.
  receive(msg: InputMessage): void {
    const buf = this.buffers[msg.player];
    if (buf.isConfirmed(msg.frame)) return; // yinelenen paket
    const guessed = buf.has(msg.frame) ? buf.get(msg.frame) : null;
    buf.set(msg.frame, msg.input, true);
    if (
      guessed !== null &&
      guessed !== msg.input &&
      msg.frame < this.state.frame
    ) {
      this.pendingRollbackTo =
        this.pendingRollbackTo === null
          ? msg.frame
          : Math.min(this.pendingRollbackTo, msg.frame);
    }
  }
}
```

`Math.min` satırı kritik. Aynı karede birden fazla düzeltme gelebilir; 40. ve 43. kare aynı anda yanlış çıkarsa 43'e değil, **40**'a dönmek zorundayız. En eski hatalı kare kazanır, çünkü ondan sonraki her şey zaten o yanlışın üzerine inşa edilmiştir.

Geri sarmanın kendisi ve kare ilerletme:

```ts
// src/rollback.ts — RollbackSession devamı
  advance(): boolean {
    if (this.pendingRollbackTo !== null) this.rollback();
    if (!this.canAdvance()) {
      this.stallCount++;
      return false;
    }
    this.simulateFrame();
    this.prune();
    return true;
  }

  private simulateFrame(): void {
    const f = this.state.frame;
    this.saved.set(f, cloneState(this.state));
    const inputs = this.buffers.map((buf) => {
      if (buf.isConfirmed(f)) return buf.get(f);
      const guess = buf.predict(f);
      buf.set(f, guess, false); // tahmini yaz ki neyi yanlış bildiğimizi bilelim
      return guess;
    });
    this.state = step(this.state, inputs);
  }

  private rollback(): void {
    const target = this.pendingRollbackTo as number;
    this.pendingRollbackTo = null;
    const snapshot = this.saved.get(target);
    if (!snapshot) return; // pencereden düşmüş: kurtarılamaz
    const replayTo = this.state.frame;
    this.state = cloneState(snapshot);
    this.rollbackCount++;
    this.lastRollbackDepth = replayTo - target;
    while (this.state.frame < replayTo) this.simulateFrame();
  }
```

`simulateFrame` içindeki `buf.set(f, guess, false)` satırı sistemin kalbi. Tahmin ettiğimiz girdiyi tampona **yazıyoruz**, ama "onaylı değil" damgasıyla. Böylece gerçek girdi geldiğinde `receive`, neyi tahmin etmiştik sorusunu cevaplayabiliyor. Damgayı unutursanız her gelen paketi doğru tahmin sanarsınız ve hiç geri sarmazsınız; oyun sessizce ayrışır. Bu, yazarken en uzun süre gözümden kaçan satırdı.

Yeniden oynatma sırasında hâlâ onaylanmamış kareler için `predict` yeniden çağrılıyor. Bu bilinçli: yeni bir onay geldiyse tahminimiz de tazelenmeli. GGPO'nun yaptığı da tam olarak bu.

Bir de duraklama var. Tahmin penceresi sonsuz olamaz, çünkü geri sarabileceğimiz kadar durum saklıyoruz:

```ts
// src/rollback.ts — RollbackSession devamı
  // Tahmin penceresi dolduysa duraklar (stall) — yoksa geri saramayız.
  canAdvance(): boolean {
    if (!this.predictionEnabled) {
      return this.buffers.every((b) => b.isConfirmed(this.state.frame));
    }
    const confirmed = this.buffers[this.remotePlayer].lastConfirmed;
    return this.state.frame - confirmed <= this.maxRollback;
  }
```

`predictionEnabled` kapalıyken sınıf birebir lockstep gibi davranıyor. Demodaki anahtar bunu değiştiriyor; farkı avucunuzda hissetmenin en hızlı yolu.

`maxRollback` değeri pratikte gecikme bütçenizdir. 8 kare, 60 FPS'te yaklaşık 133 ms'lik bir tahmin penceresi demek. Bağlantı bundan kötüyse oyun duraklar; duraklamak, ayrışmaktan iyidir.

### Durumu Kaydetmek ve Geri Yüklemek

Rollback'in bütün maliyeti bu iki işlemde toplanır. Her karede bir kez `saveState`, geri sarma başına bir kez `loadState`, artı yeniden simüle edilen kare sayısı kadar `step`.

Kritik cümle şu: her kare bir save. Geri sarma nadir, ama nereye geri saracağınızı bilmediğiniz için her karenin fotoğrafını çekmek zorundasınız. En kötü senaryoda 60 FPS'te saniyede 60 kopya, artı 8 kare derinlikte bir düzeltme geldiğinde 8 ekstra `step`. Demek ki `step` fonksiyonunuz karede bir değil, ortalama iki-üç kez koşabilir.

Bu, simülasyonun ucuz ve küçük olmasını bir tercihten çıkarıp zorunluluğa çevirir. Bizim state'imiz iki oyuncu, oyuncu başına dört tamsayı; kopyalaması bedava:

```ts
// src/sim.ts
export function cloneState(s: GameState): GameState {
  return {
    frame: s.frame,
    players: s.players.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
  };
}
```

"Ortalama iki-üç kez" lafını tahminle bırakmak istemedim, ölçtüm. `npm run bench` 3000 kare boyunca iki oturumu koşturuyor, gecikmeyi kare kare artırıyor ve kare başına kaç karenin **yeniden** oynandığını sayıyor:

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

saveState (cloneState): 24.8 ns · loadState (cloneState): 21.8 ns · step: 611.8 ns
60 FPS'te kare bütçesi 16.7 ms; en kötü satırın simülasyon maliyeti 0.0021 ms.
```

Tablonun okunuşu şu. Geri sarma **sayısı** gecikmeyle neredeyse hiç değişmiyor (462, 462, 461, 460): yanlış tahmin sayısını belirleyen şey ağ değil, oyuncunun kaç kez yön değiştirdiği. Değişen şey her yanlışın **derinliği**. 150 ms'te kare başına 1.08 kare yeniden oynanıyor; yani `step` karede ortalama 2.08 kez koşuyor. 300 ms'te bu 3.45'e çıkıyor. Rollback'in maliyeti gecikmeyle doğrusal büyüyor, ama sıçrama yapmıyor.

Son satır da mimarinin sağlamasıdır: gecikme 0 da olsa 300 ms de olsa bitiş durumunun hash'i aynı — `427844e5`. Ağ, sonucu değil sadece sonuca varma yolunu değiştiriyor.

Rakamların mutlak değeri bizim oyuncak simülasyonumuzda gülünç: `step` 612 ns, `cloneState` 22-25 ns, en kötü satırda kare başına toplam 0.0021 ms. 16.7 ms'lik kare bütçesinin on binde biri. Bu üç ns değeri koşudan koşuya birkaç ns oynar — makine ve JIT ısınması meselesi; tablo satırları ise deterministik, her koşuda aynı. Ama oran kalıcı: state'i kopyalamak bir `step`'in yirmi beşte biri kadar. Simülasyon ağırlaştıkça bu oran tersine döner ve asıl fatura kopyalamaya kesilir.

Gerçek bir oyunda state büyür ve bu fonksiyon profilin tepesine oturur. Üretimde kullanılan üç kestirme yol var. Birincisi, state'i tek bir `ArrayBuffer` içinde düz tutup kopyalamayı `buffer.slice()` ile tek işleme indirmek; [object pool ve sıfır tahsis](../object-pools-zero-allocation/article.md) yazısındaki disiplinin doğal devamı. İkincisi, snapshot'ları bir halka tamponda önceden ayırıp GC'yi tamamen devre dışı bırakmak. Üçüncüsü, her karenin tamamını değil, değişen alanların farkını (delta) saklamak; kazancı büyük ama karmaşıklığı da öyle.

Bir de bariz ama gözden kaçan bir kural var: `saveState` kopyalamalı, referans vermemeli. `this.saved.set(f, this.state)` yazarsanız kod çalışır gibi görünür, testler yeşil kalır, sonra bir gün geri yüklediğiniz "eski" durumun ne zamandır güncellendiğini anlamaya çalışırsınız. Ben yazarken `cloneState`'i baştan koydum, ama itiraf edeyim: sırf daha önce aynı hatayı başka bir projede yaptığım için.

### Senkron Kontrolü: State Hash

Şimdi en sinsi soruya geliyoruz. İki taraf gerçekten aynı simülasyonu mu koşuyor?

Otoriter modelde bu soru yoktur; sunucu ne diyorsa odur. Burada garantiniz yalnızca kural kitabının aynılığı ve bunu ispatlayan hiçbir mekanizma yok. Bir taraf `Math.random` kullansa, bir sabiti 0.35 yerine 0.36 yazsa, bir dizi sıralamasını değiştirse, iki tahta ayrışır ve oyuncular birbirinden bağımsız iki farklı maç oynar. Buna **desync** (senkron kaybı) denir; bu modelin en korkulan arızasıdır.

Çözüm: her tarafın kendi durumunun parmak izini hesaplayıp diğerine yollaması. Parmak izi, hızlı ve deterministik bir hash. FNV-1a tam bu iş için:

```ts
// src/sim.ts
// FNV-1a, 32 bit. Simülasyon durumunun parmak izi.
export function hashState(s: GameState): number {
  let h = 0x811c9dc5;
  h = mixInt(h, s.frame);
  for (const p of s.players) {
    h = mixInt(h, p.x);
    h = mixInt(h, p.y);
    h = mixInt(h, p.vx);
    h = mixInt(h, p.vy);
  }
  return h >>> 0;
}

function mixInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (x & 0xff), 0x01000193);
    x >>= 8;
  }
  return h >>> 0;
}
```

Üç detay önemli. `Math.imul` kullanıyoruz çünkü normal `*` operatörü 32 bit taşmasında kesinlik kaybeder; `imul` tam olarak C'deki 32 bit çarpımı yapar. `x | 0` ile değeri işaretli 32 bit'e sabitliyoruz, böylece negatif sıfır da temizleniyor. Ve `h >>> 0` ile sonucu işaretsiz aralığa çekiyoruz ki ekranda `-1a2b3c4d` gibi bir şey görmeyelim.

Fixed-point kullanmanın gizli ödülü tam burada ortaya çıkıyor: durum sadece tamsayılardan oluştuğu için hash'lenmesi tartışmasız. Float olsaydı, `NaN`'ın bit deseni, `-0`, denormal sayılar derken hash'in kendisi bir güvenilmezlik kaynağına dönüşürdü.

Şimdi bu yazıyı yazarken beni en çok yakan detay. Hash'i **hangi karenin** üzerinden alacağınız, hash'in kendisi kadar önemli. Demoyu ilk bağladığımda ekranda kesintisiz "DESYNC!" yanıyordu, oysa test paketi tamamen yeşildi. Sebep şuydu: iki oturum aynı kare numarasında olsa bile son birkaç kareleri **spekülatif**. P1 kendi girdisini biliyor, P2'ninkini tahmin ediyor; P2 tam tersini yapıyor. Aynı kare, iki farklı tahmin, iki farklı hash. Ölçtüm: 900 karelik bir koşuda spekülatif hash'ler 898 karede farklıydı. Bu bir desync değil, rollback'in tanımı.

Karşılaştırma, iki tarafın da **tüm** girdilerini bildiği en son kareden yapılmalı:

```ts
// src/rollback.ts — RollbackSession devamı
  // Girdilerinin tamamı onaylanmış en son kare. Senkron kontrolü BURADA yapılır:
  // spekülatif kareler iki tarafta farklı olabilir, onaylı kareler asla.
  get confirmedFrame(): number {
    let f = this.state.frame;
    for (const b of this.buffers) f = Math.min(f, b.lastConfirmed + 1);
    return Math.max(0, f);
  }

  snapshotAt(frame: number): GameState | undefined {
    if (frame === this.state.frame) return this.state;
    return this.saved.get(frame);
  }
```

Aynı 900 karelik koşuda onaylı kare hash'leri 900 kontrolün 900'ünde eşit çıktı. Bu ayrım testte de duruyor: bir test spekülatif karelerin ayrıştığını, öteki onaylı karelerin asla ayrışmadığını iddia ediyor.

Pratikte hash'i her kare göndermezsiniz; her 30 karede bir, onaylanmış bir kare için yollarsınız. Karşı taraf kendi hash'iyle karşılaştırır, tutmuyorsa maçı durdurup rapor eder. Sessizce ayrışmış bir oyun, düzgünce çöken bir oyundan çok daha kötüdür. Bizim demoda ise onaylı karenin iki hash'i ekranda yan yana yazıyor. İkisi eşitse "SENKRON", değilse büyük harflerle "DESYNC!".

Demo tarafını bağlayalım. Kanal, dördüncü yazıdaki simüle ağın aynısı; tek yönlü ve sabit gecikmeli:

```ts
// src/channel.ts — tek yönlü, sabit gecikmeli sayfa-içi kanal.
export class SimulatedChannel<T> {
  private queue: { deliverAt: number; payload: T }[] = [];

  constructor(
    public latencyMs = 150,
    private readonly now: () => number = () => performance.now(),
  ) {}

  send(payload: T): void {
    this.queue.push({ deliverAt: this.now() + this.latencyMs, payload });
  }

  receive(): T[] {
    const t = this.now();
    const ready = this.queue.filter((p) => p.deliverAt <= t);
    this.queue = this.queue.filter((p) => p.deliverAt > t);
    return ready.map((p) => p.payload);
  }
}
```

Ve döngü. İki oturum, iki canvas, aralarında iki yönlü tel:

```ts
// src/main.ts — iki "istemci" aynı sayfada, aralarında 150ms'lik simüle kanal.
// (import'lar, tuş haritaları, canvas/HUD referansları ve draw() dosyada;
//  aşağısı kurulum + döngünün kendisi)
const init = createInitialState();
const p1 = new RollbackSession(init, {
  localPlayer: 0,
  inputDelay: 2,
  maxRollback: 12,
});
const p2 = new RollbackSession(init, {
  localPlayer: 1,
  inputDelay: 2,
  maxRollback: 12,
});

const toP2 = new SimulatedChannel<InputMessage>(150);
const toP1 = new SimulatedChannel<InputMessage>(150);

function frame(now: number): void {
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // sekme arkaplandan dönünce ölüm sarmalı olmasın

  while (acc >= FRAME_MS) {
    acc -= FRAME_MS;
    for (const m of toP1.receive()) p1.receive(m);
    for (const m of toP2.receive()) p2.receive(m);
    toP2.send(p1.addLocalInput(readKeys(ARROWS)));
    p1.advance();
    toP1.send(p2.addLocalInput(readKeys(WASD)));
    p2.advance();
  }

  draw(canvas1, p1);
  draw(canvas2, p2);

  // Hash'i SPEKÜLATİF durumdan değil, iki tarafın da tüm girdilerini bildiği
  // en son ONAYLI kareden alıyoruz. Tahmin edilmiş kareler farklı olabilir.
  const cf = Math.min(p1.confirmedFrame, p2.confirmedFrame);
  const s1 = p1.snapshotAt(cf);
  const s2 = p2.snapshotAt(cf);
  const hex = (h: number) => h.toString(16).padStart(8, "0");
  hud.textContent =
    `P1 kare ${p1.frame} · rollback ${p1.rollbackCount} · stall ${p1.stallCount}\n` +
    `P2 kare ${p2.frame} · rollback ${p2.rollbackCount} · stall ${p2.stallCount}\n` +
    `onaylı kare ${cf} · hash ${s1 ? hex(hashState(s1)) : "--------"} / ${s2 ? hex(hashState(s2)) : "--------"}\n` +
    (s1 && s2
      ? hashState(s1) === hashState(s2)
        ? "SENKRON"
        : "DESYNC!"
      : "onaylı kare bekleniyor…");

  requestAnimationFrame(frame);
}
```

Ok tuşlarıyla soldaki, WASD ile sağdaki oyuncuyu sürüyorsunuz. İki panelde de iki top var, ama her panel kendi bakış açısından. Rollback anahtarını kapatın: hareket ağır çekime düşer, `stallCount` fırlar, oyun oynanmaz olur. Açın: tuşa basınca top anında kıpırdar, rollback sayacı hızla artar, hash'ler eşit kalır.

En çok hoşuma giden ayrıntı şu: rollback sayacı saniyede onlarca artarken ekranda hiçbir tuhaflık görmüyorsunuz. Sistem sürekli yanılıyor ve sürekli kendini düzeltiyor, siz sadece akıcı bir oyun görüyorsunuz.

### Deterministik Testler

Netcode hatalarının doğası şudur: "arada bir, yüksek ping'de, iki oyuncu çarpışınca". Elle yakalanmaz. Ama simülasyon saf, kanal enjekte edilebilir, oturum sınıfları ağdan habersiz. Yani hepsini headless vitest'te, DOM'suz, milisaniyeler içinde koşturabiliyoruz.

Önce temel taş: aynı girdi dizisi iki koşuda aynı hash'i veriyor mu?

```ts
// test/sim.test.ts — dosyadaki yedi testten üçü (import'lar ve run() yardımcısı dosyada)
const zigzag = (f: number): [number, number] => [
  f % 20 < 10 ? RIGHT : LEFT | UP,
  f % 13 < 7 ? LEFT | DOWN : RIGHT,
];

it("aynı girdi dizisi iki koşuda aynı hash'i verir", () => {
  const a = run(zigzag, 600);
  const b = run(zigzag, 600);
  expect(hashState(a)).toBe(hashState(b));
  expect(a).toEqual(b);
});

it("tek bir kare farklı girdi alırsa hash değişir", () => {
  const a = run(zigzag, 300);
  const b = run((f) => (f === 150 ? [UP, DOWN] : zigzag(f)), 300);
  expect(hashState(a)).not.toBe(hashState(b));
});

it("tüm alanlar tamsayı kalır (float sızıntısı yok)", () => {
  const s = run(zigzag, 400);
  for (const p of s.players) {
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.vx)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
    expect(Number.isInteger(p.vy)).toBe(true);
  }
});
```

Üçüncü test bir bekçi köpeği. Simülasyona bir gün biri `p.x * 0.5` yazarsa kod çalışmaya devam eder, ekranda hiçbir şey değişmez, ama bu test kırmızıya döner. Determinizmi koruyan şey bir yorum satırı değil, bu test.

Fixed-point kenar vakaları da ayrı bir dosyada:

```ts
// test/fixed.test.ts — dosyadaki yedi testten üçü
it("yuvarlama sıfıra doğru, işaretten bağımsız simetrik", () => {
  expect(fpMul(1, 1)).toBe(0); // 1/65536 * 1/65536 → sıfıra iner
  expect(fpMul(-1, 1)).toBe(0);
  expect(fpMul(3, ONE - 1)).toBe(2); // 2.99995 → 2
  expect(fpMul(-3, ONE - 1)).toBe(-2); // -2.99995 → -2
});

it("float'ın 0.1 + 0.2 kaybı fixed-point'te yok", () => {
  const tenth = Math.trunc(ONE / 10);
  let acc = 0;
  for (let i = 0; i < 10; i++) acc += tenth;
  expect(acc).toBe(tenth * 10); // birikim TAM
});

it("büyük çarpımlar 2^53 sınırının altında kalır", () => {
  const maxPos = fromInt(640);
  expect(maxPos * maxPos * 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
});
```

Asıl test ise şu. Rollback'in bütün iddiası tek cümlede: geri sarıp yeniden oynattıktan sonra elde ettiğin durum, hiç yanılmamış bir simülasyonunkiyle **birebir aynı** olmalı. Bunu kanıtlamak için ağsız bir referans koşusu yazıyoruz, sonra 9 kare gecikmeli bir çift oturum kurup sonuçları karşılaştırıyoruz.

```ts
// test/rollback.test.ts
// Ağsız referans: her girdi zamanında bilinseydi ne olurdu?
function reference(
  scripts: [Script, Script],
  frames: number,
  inputDelay: number,
) {
  let s = createInitialState();
  for (let f = 0; f < frames; f++) {
    const at = (i: 0 | 1) =>
      f - inputDelay >= 0 ? scripts[i](f - inputDelay) : 0;
    s = step(s, [at(0), at(1)]);
  }
  return s;
}

// İki oturum, aralarında delayFrames kare gecikmeli tel.
function runPair(opts: {
  frames: number;
  delayFrames: number;
  inputDelay: number;
  scripts: [Script, Script];
  maxRollback?: number;
}) {
  const init = createInitialState();
  const common = {
    inputDelay: opts.inputDelay,
    maxRollback: opts.maxRollback ?? 12,
  };
  const a = new RollbackSession(init, { localPlayer: 0, ...common });
  const b = new RollbackSession(init, { localPlayer: 1, ...common });
  const wire: { at: number; to: RollbackSession; msg: InputMessage }[] = [];

  for (let t = 0; t < opts.frames; t++) {
    for (const p of wire) if (p.at === t) p.to.receive(p.msg);
    wire.push({
      at: t + opts.delayFrames,
      to: b,
      msg: a.addLocalInput(opts.scripts[0](t)),
    });
    wire.push({
      at: t + opts.delayFrames,
      to: a,
      msg: b.addLocalInput(opts.scripts[1](t)),
    });
    a.advance();
    b.advance();
  }

  // Telde kalanları boşalt ve son geri sarmanın oturmasını bekle.
  for (const p of wire) if (p.at >= opts.frames) p.to.receive(p.msg);
  a.advance();
  b.advance();
  return { a, b };
}
```

Bu koşum takımı bir ağ değil, bir zaman makinesi: mesajlar milisaniyeyle değil kare numarasıyla teslim ediliyor, dolayısıyla test tamamen deterministik. Ve şimdi asıl iddialar:

```ts
// test/rollback.test.ts — devamı
const FRAMES = 240;
const DELAY = 9; // ~150ms @ 60fps

it("rollback+replay sonucu, hiç yanılmamış referansla BİREBİR aynı", () => {
  const { a } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts,
  });
  const ref = reference(scripts, a.frame, 2);
  expect(a.state).toEqual(ref);
  expect(hashState(a.state)).toBe(hashState(ref));
  expect(a.rollbackCount).toBeGreaterThan(0); // gerçekten geri sarmış
});

it("iki taraf aynı kareye ve aynı hash'e varır (desync yok)", () => {
  const { a, b } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts,
  });
  expect(a.frame).toBe(b.frame);
  expect(hashState(a.state)).toBe(hashState(b.state));
});

it("input delay ağ gecikmesini karşılarsa hiç geri sarma olmaz", () => {
  const { a, b } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: DELAY, // beklemeyi girdi gecikmesiyle ödedik
    scripts,
  });
  expect(a.rollbackCount).toBe(0);
  expect(b.rollbackCount).toBe(0);
  expect(hashState(a.state)).toBe(
    hashState(reference(scripts, a.frame, DELAY)),
  );
});
```

Birinci testteki `toEqual` bu yazının tek cümlelik özeti. 240 kare boyunca onlarca kez yanlış tahmin ettik, onlarca kez geri sarıp yeniden oynadık, ve sonuç hiç yanılmamış bir simülasyonla tamsayı tamsayı aynı çıktı. `rollbackCount > 0` iddiası da testin kendini kandırmasını engelliyor; tahmin hiç yanılmasaydı test yeşil olurdu ama hiçbir şey ispatlamazdı.

Üçüncü test, input delay ile rollback arasındaki takası sayıya döküyor. Girdi gecikmesini ağ gecikmesine eşitlerseniz mektup her zaman zamanında varır ve geri sarma diye bir şey kalmaz. Bedava değil: karşılığında 150 ms'lik girdi gecikmesini parmağınızda taşırsınız.

Bir de geri sarmanın hedefini doğrudan sınayan bir test var. Elle kurulmuş bir senaryo: 5 ve 6. kareler doğru tahmin edilmiş, 7. kareden itibaren rakip yön değiştirmiş.

```ts
// test/rollback.test.ts
it("yanlış tahmin EN ESKİ hatalı kareye geri sarar", () => {
  const s = new RollbackSession(createInitialState(), {
    localPlayer: 0,
    inputDelay: 0,
    maxRollback: 16,
  });
  for (let f = 0; f < 5; f++)
    s.receive({ player: 1, frame: f, input: RIGHT });
  for (let f = 0; f < 10; f++) {
    s.addLocalInput(0);
    s.advance();
  }
  expect(s.frame).toBe(10);
  expect(s.rollbackCount).toBe(0); // 5..9 arası "RIGHT devam" diye tahmin edildi

  s.receive({ player: 1, frame: 5, input: RIGHT }); // tahmin tuttu
  s.receive({ player: 1, frame: 6, input: RIGHT }); // tahmin tuttu
  s.receive({ player: 1, frame: 7, input: LEFT }); // TAHMİN TUTMADI
  s.receive({ player: 1, frame: 8, input: LEFT });
  s.addLocalInput(0);
  s.advance();

  expect(s.rollbackCount).toBe(1);
  expect(s.lastRollbackDepth).toBe(3); // 10 - 7
  expect(s.frame).toBe(11);
});
```

`lastRollbackDepth` üçe eşit. Sekize değil, ona değil. Sistem tam olarak yanıldığı yere döndü, bir kare fazlasına değil. Bir de duraklama testi var: uzak taraftan hiç girdi gelmezse oturum `maxRollback` kadar ilerleyip duruyor ve `stallCount` artıyor. Bir de demo döngüsünün DOM'suz kopyası var: enjekte saatli `SimulatedChannel`, iki gerçek oturum, 900 kare. Onaylı kare hash'i 900 kontrolün 900'ünde eşit; spekülatif hash 900 karenin 898'inde farklı. Toplamda 26 test, hepsi saf mantık, hiçbiri canvas veya DOM görmüyor.

### Peki Üretimde? WebRTC ve Gerçek Dünya

Demomuzda iki oturum aynı sayfada; kanal `SimulatedChannel`. Gerçek bir üründe bu kanalın yerini **WebRTC DataChannel** alır: tarayıcıdan tarayıcıya doğrudan bağlantı, sunucu üzerinden geçmeyen veri, düşük gecikme. Unreliable ve unordered modda açarsanız (`{ ordered: false, maxRetransmits: 0 }`) UDP benzeri davranır ki rollback netcode'un istediği tam olarak budur; kaybolan bir girdi paketini beklemektense tahmin etmek daha ucuz.

Tek pürüz, WebRTC'nin bir signaling sunucusu istemesi: iki tarayıcı birbirini bulana kadar SDP tekliflerini bir yerden geçirmek gerekir. Bağlantı kurulduktan sonra o sunucu devre dışı kalır. Yani "sunucusuz" derken kastettiğimiz, oyun sırasında sunucu olmaması. Bu yazının demosunu bilerek bu adımdan uzak tuttum; amaç netcode'u öğretmekti, WebRTC el sıkışmasını değil.

Bu alanda yürünmüş yollar da var. GGPO, rollback netcode'u modern dövüş oyunlarına sokan kütüphanedir ve fikirlerinin çoğu buradaki koddan tanıdık gelecektir. Tarayıcı tarafında NetplayJS ve Telegraph, WebRTC üstünde GGPO tarzı bir oturum kurar. Kendi oyununuzu yazacaksanız, önce buradaki gibi bir çekirdeği kendiniz yazıp sonra bir kütüphaneye geçmenizi öneririm; determinizmin ne kadar kırılgan olduğunu ancak kendi elinizle bozunca anlıyorsunuz.

### Özetle:

1. **İki model var, ikisi de doğru.** Otoriter sunucu: gerçek sunucudadır, hile zordur, bant genişliği dünyayla büyür. Deterministik lockstep: gerçek herkeste aynı anda hesaplanır, sunucu maliyeti sıfırdır, sadece girdi dolaşır.
2. **Bit düzeyinde determinizm pazarlık konusu değil.** Simülasyondan `Math.random`, `Math.sin`, `Math.cos` ve arkadaşlarını tamamen çıkarın; konum ve hızı fixed-point tamsayıda tutun.
3. **Sabit adım ön koşuldur.** `dt` parametresini tamamen ortadan kaldırmak, yanlışlıkla değişken `dt` geçirme ihtimalini de ortadan kaldırır.
4. **Saf lockstep doğru ama oynanamaz.** 150 ms gecikmede kare hızı saniyede 6-7'ye düşer; oyun yavaşlar, kare atlamaz.
5. **Input delay ucuz ve kısmi bir çözümdür.** Girdiyi N kare sonrasına planlarsınız, bedelini kendi tepki sürenizden ödersiniz. 2-3 kare iyi, 9 kare acı verici.
6. **Rollback tahmin eder ve yanılınca geri sarar.** Tahmin "son girdiyi tekrarla" kadar basittir ve karelerin çoğunda tutar. Yanılınca en eski hatalı kareye dön, oradan bugüne yeniden oyna.
7. **Her kare save, nadiren load.** Save/load maliyeti `step`'in maliyetiyle çarpılır; state'i küçük ve düz tutun, `maxRollback` ile pencereyi sınırlayın.
8. **State hash olmadan desync'i göremezsiniz.** FNV-1a ile durumun parmak izini alıp periyodik olarak karşılaştırın. Sessizce ayrışan oyun, düzgünce çöken oyundan kötüdür.
9. **Testler saf mantıkla kurulur.** Rollback'li koşu ile hiç yanılmamış referans koşusu `toEqual` ile eşit çıkmalı. Bu tek assertion, sistemin tamamını doğrular.

Repoda `npm test` deyin, determinizm iddiası yirmi altı maddede yeşile dönsün. `npm run dev` deyin, iki panel açılsın ve rollback sayacı ok tuşlarına basar basmaz dönmeye başlasın. `npm run bench` deyin, geri sarmanın kare başına maliyetini gecikmeye karşı tabloda görün.

Son bir not, merkez meselesi üzerine. Otoriter sunucu yazarken aslında bir kule inşa ediyorsunuz: hakem orada oturuyor, tek gerçek orada tutuluyor, güvenlik oradan geliyor. Faturası da orada kesiliyor. Burada kule yok. İki taraf aynı kurallara uyduğu için aynı yere varıyor; güven, birinin diğerine bakmasından değil, ikisinin de aynı matematiği yapmasından doğuyor. Bunun bedeli de yeri de belli: bütün sistem, kural kitabının tek bir satırı kadar sağlam.

Mektupla satrancın hiç sevmediğim yanı da buymuş. İki oyuncu birbirine güvenmek zorunda değil, doğru; ama biri tahtaya yanlış hamleyi kaydederse oyun aksamadan devam eder. Kimse bir şey fark etmez. Ta ki biri zarfın altına "sende tahta nasıl görünüyor?" diye yazana kadar. State hash o sorunun kendisi. ⚙️♟️
