# Image Browser

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
  nedtryckt). Raden längst ner lägger de markerade i Favoriter eller i en serie; de kan också dras till
  sidopanelen tillsammans. ⌘A markerar alla, Esc avmarkerar
- ⋯-menyn på Favoriter eller en serie har "Lägg alla i serie…" för att lägga alla bilderna i en annan serie
- (i)-knappen längst till höger i verktygsraden, eller ?, visar alla kortkommandon
- I helskärm lägger mappknappen bredvid hjärtat (eller S) bilden i en serie, eller i en ny serie.
  Siffertangenterna 1–9 lägger till i serie nummer 1–9 direkt
- I helskärm väljer knappen Visning (reglagen uppe till höger) hur nästa bild kommer in: tona fram,
  glid in från vänster eller höger, glid upp, kaskad, parallax eller växla automatiskt. Där kan du också
  visa mappens ram, skugga och bakgrundsfärg i helskärm. Valet gäller i alla mappar.
- Dra en bild från kartan till Favoriter eller till en serie i sidopanelen för att lägga till den där
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
- Sparade mappar: bokmärkesknappen vid Mappar sparar de öppna mapparna med ett eget namn
- Favoriter och serier finns kvar efter omstart; en bild som slängs försvinner ur dem

## Funktioner (steg 4, del 1)

- Utseende (palettknappen): bakgrundsfärg, ram (tunn linje, vitt passepartout, svart) och skugga (under eller inåt)
- Knappar, menyer och sidopanel tar färg efter bakgrunden och byter mellan mörk och ljus text för läsbarhet
- Sparas per mapp, favoriter eller serie

## Funktioner (steg 4, del 2: rubriker)

- Bildens inställningsmeny: **Rubrik ovanför bilden** eller **Ny sida med rubrik**
- Rubriken har nivå H1–H3, valfri färg och valfritt typsnitt bland de som finns installerade på datorn
- Bildrubriken får en egen rad ovanför bilden; sidrubriken får en egen rad och bilden börjar en ny sida (i flödesläget en ny rad)
- Klicka på en rubrik för att ändra eller ta bort den

## Installera

Varje push till `main` bygger en `.dmg` i GitHub Actions. Hämta den under fliken
**Actions → senaste körningen → Artifacts**. Appen är inte signerad, så första gången:
högerklicka på appen i Program och välj **Öppna**.

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
