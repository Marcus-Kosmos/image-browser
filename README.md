# Image Browser

En lätt bildbläddrare för Mac. Välj en mapp så visas bilderna som förhandsvisningar
i en pussel-layout där bilder i olika format fyller raderna jämnt.

Byggd med [Tauri 2](https://tauri.app), React, Tailwind och shadcn/ui med Lucide-ikoner.

## Funktioner (steg 1)

- Öppna en mapp (⌘O), gå till överordnad mapp (⌘↑) och undermappar, läs in igen (⌘R)
- Pussel-layout med reglage för storlek på förhandsvisningar
- Snabba miniatyrer som cachas; på macOS skapas de med `sips`, så HEIC och RAW fungerar
- Klicka på en bild för att visa den stort, bläddra med ← och →, stäng med Esc
- Flytta bilder till papperskorgen (⌫ eller papperskorgsikonen), med bekräftelse

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
