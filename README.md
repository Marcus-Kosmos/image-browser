# Imagime

En lätt bildbläddrare för Mac. Välj en mapp så visas bilderna som förhandsvisningar
i en pussel-layout där bilder i olika format fyller raderna jämnt.

Byggd med [Tauri 2](https://tauri.app), React, Tailwind och shadcn/ui med Lucide-ikoner.

## Funktioner (steg 1)

- Öppna en mapp (⌘O), gå till överordnad mapp (⌘↑) och undermappar, läs in igen (⌘R)
- Pussel-layout med reglage för storlek på förhandsvisningar
- Snabba miniatyrer som cachas; på macOS skapas de med `sips`, så HEIC och RAW fungerar
- Klicka på en bild för att visa den stort, bläddra med ← och → (mjuk övertoning), stäng med Esc
- Flytta bilder till papperskorgen (⌫ eller papperskorgsikonen), med bekräftelse. Kryssa i "Fråga inte igen"
  för att slänga med ett klick; frågan slås på igen under Utseende (paletten)
- I en serie tar mappen med minustecken bort bilden ur serien utan att röra filen, på bilden i kartan, i
  helskärm och för flera markerade bilder på en gång

## Funktioner (steg 2)

- Två visningslägen: **Flöde** (kontinuerlig scroll) och **Sidor**, där varje sida fyller fönstret
  utan att man scrollar, med valfria sidnummer och bläddring sida för sida
- Storlek per bild: **Stor** tar två rader med andra bilder bredvid, två **Små** i följd staplas
  på varandra (tangenterna 1, 2, 3 på markerad bild)
- Effekter när bilder visas: tona fram, glid in från vänster, höger eller växelvis, glid upp,
  kaskad (bilderna i en rad faller in en i taget) och parallax (bilden rör sig långsammare än sidan),
  för hela mappen eller per bild. "Växla automatiskt" byter effekt för varje rad medan du scrollar; var tredje rad och enstaka bilder står stilla
- Öppna flera mappar på en gång (⌘-klick i dialogen) och se alla bilderna tillsammans
- Bilder i undermappar visas också (kan slås av med mappträd-knappen)
- Inställningarna sparas per mapp, eller per kombination av mappar

## Funktioner (steg 3)

- Favoriter: klicka på hjärtat på en bild, eller tryck F, i kartan eller i helskärm (där sitter hjärtat
  i bildens nedre högra hörn)
- Markera flera bilder: ⌘-klick, Skift-klick, eller dra en ruta (i tomrummet mellan bilderna, eller med Skift
  nedtryckt). Raden längst ner lägger de markerade i Favoriter eller i en serie, eller tar bort dem från
  Favoriter; de kan också dras till sidopanelen tillsammans. ⌘A markerar alla, Esc avmarkerar
- I en serie visar den tomma ytan efter sista bilden ett plus när musen är där. Klicka för att välja bilder
  i Finder och lägga dem sist i serien. En tom serie har knappen Lägg till bilder
- ⋯-menyn på Favoriter eller en serie har "Lägg alla i serie…" för att lägga alla bilderna i en annan serie
- (i)-knappen längst till höger i verktygsraden, eller ?, visar alla kortkommandon
- I helskärm lägger mappknappen bredvid hjärtat (eller S) bilden i en serie, eller i en ny serie.
  Siffertangenterna 1–9 lägger till i serie nummer 1–9 direkt
- Bilder i Favoriter och serierna som flyttats eller tagits bort i Finder visas som en grå ruta,
  "Bilden är borta", och kan tas ur listan som vanligt. Bilder som ändrats sedan de lades dit får märket
  "Ändrad". Mappar i sidopanelen som inte finns kvar blir grå med en överkryssad mapp. Appen kollar
  igen när den kommer fram efter att du varit i ett annat program.
- I helskärm samlas knapparna för bilden i en stor, halvgenomskinlig rad nere vid bilden: papperskorgen
  längst till vänster, sedan förstora med AI, visa i Finder och serie, AI-märkningen (en ikonknapp, av/på: när
  den är på syns ett märke uppe till höger på bilder som är AI-förstorade eller AI-gjorda) och längst till höger nålen och hjärtat. Raden är gömd tills
  musen kommer nära den; knappen längst till höger i raden fäster den så att den syns hela tiden. Visning och kortkommandon sitter uppe till höger.
- I helskärm väljer knappen Visning (reglagen uppe till höger) hur nästa bild kommer in: tona fram,
  glid in från vänster eller höger, glid upp, kaskad, parallax eller växla automatiskt. Där kan du också
  visa mappens ram, skugga och bakgrundsfärg i helskärm. Valet gäller i alla mappar.
- Zooma i helskärm: pekaren blir ett förstoringsglas. Klicka där du vill förstora, tre klick zoomar
  in helt och nästa klick visar hela bilden igen. Dra eller scrolla för att flytta runt, Alt-klick zoomar
  ut ett steg, + och − zoomar, 0 eller Esc visar hela bilden. Zoomad fyller bilden hela
  ytan under raden längst upp, även bredvid fästa bilder, där första klicket gör bilden så stor som
  fönstret. Helskärm visar bilden i skärmens fulla upplösning, och zoomad visas originalfilen
- Fäst bilder i helskärm: nålen bredvid mappknappen (eller P) lägger bilden som en liten förhandsvisning
  uppe till vänster medan du bläddrar vidare. Nästa fästa bild hamnar under, sedan i en kolumn bredvid,
  tills det inte får plats fler. Klicka på en fäst bild för att visa den igen, krysset lossar den
- Dra en fäst bild till en ny plats för att ändra ordningen, både i hörnet och i de större lägena. De andra
  bilderna glider undan medan du drar, och serien du sparar får den nya ordningen
- Under Visning väljer du hur fästa bilder visas: små i hörnet, mellanstora med bilden du bläddrar till
  i resten av skärmen, hela i en rad med den, eller som ett pussel som fyller skärmen. Pusslet bryts
  i rader som i kartan när bilderna blir fler, och den nya bilden hamnar sist, nere till höger
- När en sida är full fortsätter de större lägena på nästa sida. Bläddra mellan sidorna med pilarna
  längst ned eller Page Up och Page Down
- Spara som serie sparar de fästa bilderna i samma ordning som en ny serie. Välj om visningen (pussel,
  hörn, övergång) och mappens bakgrundsfärg, ram och skugga ska följa med. En serie sparad med visningen
  får knappen Visa som pussel, som öppnar helskärm med bilderna lagda som när de sparades
- Ett klick på den tomma ytan bredvid bilden i helskärm stänger den, precis som krysset (eller Esc). Visas en
  fäst bild ensam går klicket först tillbaka till alla fästa bilder.
- Med flera fästa bilder framme visar en ram vilken bild knappraden gäller, först den du bläddrat till. Håll
  musen över en annan bild och klicka på symbolen uppe till vänster, så gäller knappraden (och F, P, ⌫ och
  sifferknapparna) den bilden i stället. Bläddrar du vidare gäller den åter den nya bilden.
- Samlingar i helskärm: Favoriter och serierna sitter infällda som ikoner till vänster och fälls ut när
  musen kommer dit, eller när du drar bilden dit. Knappen överst i menyn (eller C) fäster den
  utfälld, och ett klick till fäller in den direkt. Dra
  bilden dit för att lägga den i en samling, eller klicka för att lägga till eller ta bort den. Ett klick
  på bilden zoomar som förut; zoomad flyttar du runt i bilden när du drar
- En bild i taget (under Visning, eller H): med marginaler, på hela skärmen så att hela bilden syns, eller
  så att bilden fyller skärmen och kanterna beskärs. På hela skärmen går appens fönster upp i helskärm och
  raden överst tonar bort när musen vilar
- Behåll zoom (under Visning): varje bild minns sin zoom, så den är kvar när du bläddrar tillbaka
- Rundade hörn (under Visning) rundar bilderna och deras ramar i helskärm
- Rubriker i helskärm (under Visning): visa bildernas rubriker ovanför bilden eller på bilden i ett hörn,
  och välj hur de kommer in (tona fram, glid in, parallax med flera). Storleken går från
  Normal till Jättestor. På bilden bryts en lång rubrik på upp till tre rader; ovanför bilden krymper den
  så att den får plats på en rad
- Förstora med AI (trollstaven i helskärm): gör en fyra gånger större kopia av en lågupplöst bild och
  sparar den bredvid originalet som "namn förstorad 4x". Originalet lämnas orört. Det sker på din Mac med
  Real-ESRGAN, utan nät, och kan ta upp till en minut. AI:n fyller i detaljer som ser rimliga ut, så
  resultatet är skarpare men inte alltid helt troget. Bilder större än 4000 pixlar förstoras inte
- Trollstaven frågar hur bilden ska förstoras: **På Macen** (Real-ESRGAN, gratis, skärper), eller med
  [Stability AI](https://platform.stability.ai), som känner igen vad bilden föreställer och ritar in detaljer
  som passar: **Varsam** håller sig nära originalet, **Kreativ** ritar om friare (för små eller suddiga bilder).
  Du kan beskriva bilden och välja hur fritt den får hitta på. Bilden skickas till Stability AI och varje
  förstoring drar krediter från ditt eget konto där; API-nyckeln sparas i Macens nyckelring. Kopian sparas
  som "namn förstorad AI" bredvid originalet
- **bigger.pics, gratis**: öppnar [bigger.pics](https://bigger.pics) i ett eget fönster och lämnar över bilden.
  När du klickat på "Send this back" eller "Download" sparas den förstorade bilden som "namn förstorad
  bigger.pics" bredvid originalet, och fönstret stängs. Inga extra kopior hamnar i Hämtade filer. Tjänsten är gratis med reklam; bilden skickas till
  bigger.pics. Andra länkar från fönstret öppnas i webbläsaren. Högerklicka och välj Inspektera element för
  att se felmeddelanden från sidan
- Varje AI-förstorad kopia märks i sina metadata som gjord med AI (IPTC DigitalSourceType
  "compositeWithTrainedAlgorithmicMedia", samma standard som Photoshop och många webbplatser läser), med
  namnet på verktyget. Själva bilden ändras inte
- **Visa AI-märkning** (i Utseende-menyn, gäller alla mappar) visar ett märke uppe till höger på bilder vars metadata säger
  att de gjorts eller ändrats med AI: "AI-förstorad" (trollstav) för bilder förstorade i Imagime och "AI-bild"
  (gnistor) för bilder som ett annat program märkt, till exempel Adobe Firefly. Omärkta AI-bilder går inte att känna igen
- Medan förstoringen pågår ligger en cirkel som fylls över den gamla bilden, i helskärm och i rutnätet, så
  att det syns att det är den gamla versionen tills den nya kommer
- Visa i Finder: knappen med mappen och förstoringsglaset, i helskärm och i raden för markerade bilder,
  öppnar Finder med filerna markerade. Toasten efter en förstoring har samma knapp
- Välj bland bilderna (knappen bredvid Öppna mapp, eller ⇧⌘O): Macens väljarfönster visar bilderna som
  miniatyrer, och mellanslag visar en större förhandsvisning. Väljer du en bild öppnas mappen den ligger i
  och bilden visas i helskärm. Inget kopieras, bilderna visas där de ligger
- Släpp bilder från Finder i appen: bildens mapp öppnas och bilden visas i helskärm. En mapp du släpper
  öppnas direkt. Står du i en serie läggs bilderna i serien och den första visas i helskärm (filerna ligger kvar där de är)
- Dra en bild från kartan till Favoriter eller till en serie i sidopanelen för att lägga till den där.
  Under serierna dyker "Släpp för en ny serie" upp medan du drar: släpp där så blir bilden (eller de
  markerade bilderna) en ny serie, som du namnger direkt
- Frågar macOS om tillgång till en mapp (Skrivbord, Dokument, Hämtade filer) står det varför. Bygget är
  inte signerat, så macOS frågar igen efter varje ny version
- Sidopanelen (knappen längst till vänster) samlar mapparna, **Favoriter** och dina **Serier**
- Serier: plus-knappen sparar det som visas som en namngiven serie med samma layout;
  lägg till eller ta bort bilder via bildens inställningar; byt namn eller ta bort serien i panelen
- Ändra ordning i en serie: dra en bild till en ny plats (en linje visar var den hamnar), eller
  markera bilden och tryck Alt + pil vänster/höger. Håll bilden vid kanten för att bläddra.
  Ordningen sparas och gäller i flöde, sidläge och helskärm
- Dölj och lås: ⋯-menyn på en serie, eller på Favoriter, kan dölja den eller låsa den med Touch ID
  (eller datorns lösenord). Dolda syns bara efter ögonknappen vid Bibliotek; låsta låses igen när du
  lämnar dem eller lägger appen i bakgrunden, och appen startar aldrig i något dolt eller låst.
  Bildfilerna själva ligger kvar i sina mappar och syns i Finder
- Taggar: Favoriter och varje serie fungerar som taggar; en bild i en serie får seriens tagg.
  Taggarna syns när du för musen över en bild och i helskärm
- Sök och filtrera: sökfältet (⌘F) letar på filnamn och taggar; filterknappen väljer taggar och
  hur nyligen bilden lades till (annars filens datum). Under filter visas "x av y bilder"
- Ordning i filtermenyn: **Senast ändrad först** sorterar på filens ändringsdatum, nyaste först
- **Visa bara dubbletter** i filtermenyn visar bilder med exakt samma innehåll, sida vid sida. Bara bilder
  med samma storlek jämförs, så det går fort. Med undermappar påslagna jämförs de också
- Sparade mappar: bokmärkesknappen vid Mappar sparar de öppna mapparna med ett eget namn
- Favoriter och serier finns kvar efter omstart; en bild som slängs försvinner ur dem

## Funktioner (steg 4, del 1)

- Utseende (palettknappen): bakgrundsfärg, ram (tunn linje, vitt passepartout, svart) och skugga (under eller inåt)
- Knappar, menyer och sidopanel tar färg efter bakgrunden och byter mellan mörk och ljus text för läsbarhet
- Färger från bilderna (pipetten under Bakgrund) tar fram de tre färger som bilderna har mest av och ger
  upp till sex teman där de byter plats som bakgrund, text och knappar. Texten och knapparna hålls läsbara
- Sparas per mapp, favoriter eller serie

## Funktioner (steg 4, del 2: rubriker)

- Bildens inställningsmeny: **Rubrik ovanför bilden** eller **Ny sida med rubrik**
- Rubriken har nivå H1–H3, valfri färg och valfritt typsnitt bland de som finns installerade på datorn
- Bildrubriken får en egen rad ovanför bilden; sidrubriken får en egen rad och bilden börjar en ny sida (i flödesläget en ny rad)
- Klicka på en rubrik för att ändra eller ta bort den

## Publicera som webbsida

- **Publicera** i verktygsfältet när en serie eller Favoriter visas gör en webbsida av bilderna:
  rader som fyller bredden, samma bakgrund, ramar, skugga och rubriker som i appen, och en helskärmsvisning
  med pilar och tangentbord. På mobilen visas en bild per rad
- Sidan laddas upp till ditt eget webbhotell med SFTP, FTP med kryptering (FTPS) eller vanlig FTP,
  till `<mapp på servern>/<sidans namn>/`, och nås på `<webbadress>/<sidans namn>/`.
  Publicerar du igen ersätts sidan
- Bilderna läggs upp som JPEG, högst 2048 pixlar på längsta sidan och aldrig större än originalet
- Lösenordet sparas i Macens nyckelring, aldrig i appen. Vid SFTP minns appen serverns nyckel och
  varnar om en annan server svarar senare
- **Spara på Macen** sparar samma sida i en mapp i stället, att öppna direkt eller ladda upp själv

## Installera

Varje push till `main` bygger en `.dmg` i GitHub Actions. Hämta den under fliken
**Actions → senaste körningen → Artifacts**. Appen är inte signerad av Apple, så första gången:
högerklicka på appen i Program och välj **Öppna**.

Bygget signeras med ett eget certifikat ("Imagime Self-Signed") när repots hemligheter
`MACOS_CERTIFICATE` (en base64-kodad .p12) och `MACOS_CERTIFICATE_PASSWORD` finns. Eftersom
signaturen är densamma i varje version kommer macOS ihåg vilka mappar appen fått öppna, i
stället för att fråga igen efter varje uppdatering. Utan hemligheterna blir bygget osignerat.

## Utveckla

Kräver Node 22, Rust och Xcode Command Line Tools.

```sh
npm install
npm run tauri dev     # starta appen
npm test              # testa layouten
cd src-tauri && cargo test
npm run tauri build   # bygg .app och .dmg
```

`npm run dev` startar bara gränssnittet i webbläsaren med genererade demobilder.

AI-förstoringen behöver Real-ESRGAN. Hämta den med `scripts/fetch-upscaler.sh` och bygg med
`npm run tauri build -- --config src-tauri/tauri.macos-upscale.json`. Bygget i GitHub Actions gör båda.

## Licens

Imagime är fri programvara under [GNU General Public License v3.0](LICENSE) eller senare version.
Du får använda, ändra och dela den. Om du sprider en ändrad version måste du dela den under samma
licens, med källkoden öppen.

AI-förstoringen använder [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (BSD 3-Clause), som
följer med i Mac-appen men inte ligger i det här arkivet.
