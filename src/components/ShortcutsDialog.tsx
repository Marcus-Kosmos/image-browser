import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const GROUPS: Array<{ title: string; keys: Array<[string[], string]> }> = [
  {
    title: "Överallt",
    keys: [
      [["⌘", "O"], "Öppna mapp"],
      [["⇧", "⌘", "O"], "Välj bland bilderna med förhandsvisning och öppna mappen"],
      [["⌘", "R"], "Läs in mappen igen"],
      [["⌘", "↑"], "Överordnad mapp"],
      [["⌘", "F"], "Sök på namn eller tagg"],
      [["?"], "Visa kortkommandon"],
    ],
  },
  {
    title: "Markerad bild i kartan",
    keys: [
      [["↵"], "Öppna i helskärm"],
      [["F"], "Favorit på eller av"],
      [["1", "2", "3"], "Liten, mellan eller stor"],
      [["⌫"], "Flytta till papperskorgen"],
      [["⌥", "←", "→"], "Flytta i serien"],
    ],
  },
  {
    title: "Markera flera bilder",
    keys: [
      [["⌘", "klick"], "Markera eller avmarkera en bild"],
      [["⇧", "klick"], "Markera alla bilder fram till den"],
      [["⇧", "dra"], "Markera med en ruta (eller dra i tomrummet)"],
      [["⌘", "A"], "Markera alla"],
      [["Esc"], "Avmarkera"],
    ],
  },
  {
    title: "Helskärm",
    keys: [
      [["←", "→"], "Föregående eller nästa bild"],
      [["F"], "Favorit på eller av"],
      [["S"], "Lägg till i serie"],
      [["1–9"], "Lägg till i serie 1–9 direkt"],
      [["P"], "Fäst bilden i hörnet, eller lossa den"],
      [["Klick"], "Zooma in där du pekar, tre steg"],
      [["Alt + klick"], "Zooma ut ett steg"],
      [["+", "−"], "Zooma in eller ut"],
      [["0"], "Visa hela bilden igen"],
      [["H"], "Marginaler, hela skärmen eller fyll skärmen"],
      [["C"], "Visa eller dölj samlingarna att dra bilden till"],
      [["⌫"], "Flytta till papperskorgen"],
      [["Esc"], "Visa hela bilden, sedan stäng helskärm"],
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="shortcuts-title" className="max-h-[90vh] max-w-lg overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 id="shortcuts-title" className="text-lg font-semibold">
          Kortkommandon
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Stäng" title="Stäng (Esc)">
          <X />
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-4">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{group.title}</h3>
            <dl className="flex flex-col">
              {group.keys.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b py-1.5 text-sm last:border-b-0">
                  <dt>{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-xs text-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
