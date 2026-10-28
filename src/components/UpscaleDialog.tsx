import { useEffect, useState } from "react";
import { Cloud, ExternalLink, KeyRound, Laptop, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { hasCloudKey, saveCloudKey, type ImageEntry, type UpscaleMode } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface UpscaleChoice {
  mode: UpscaleMode;
  prompt: string;
  amount: number;
}

interface UpscaleDialogProps {
  /** The picture to enlarge; null keeps the dialog closed. */
  image: ImageEntry | null;
  onCancel: () => void;
  onStart: (choice: UpscaleChoice) => void;
}

const MODES: { mode: UpscaleMode; icon: React.ReactNode; title: string; text: string }[] = [
  {
    mode: "local",
    icon: <Laptop className="size-4" />,
    title: "På Macen",
    text: "Gratis och utan internet. Skärper kanter och struktur, men vet inte vad bilden föreställer.",
  },
  {
    mode: "conservative",
    icon: <Cloud className="size-4" />,
    title: "Varsam, med Stability AI",
    text: "Känner igen vad bilden visar och lägger till detaljer som passar, nära originalet.",
  },
  {
    mode: "creative",
    icon: <Sparkles className="size-4" />,
    title: "Kreativ, med Stability AI",
    text: "Ritar om detaljerna friare. För små eller suddiga bilder; kan ändra till exempel ansikten.",
  },
  {
    mode: "bigger",
    icon: <ExternalLink className="size-4" />,
    title: "bigger.pics, gratis",
    text: "Öppnas i ett eget fönster med reklam. Förstora där och klicka på Send this back eller Download, så sparas bilden bredvid originalet.",
  },
];

const STORAGE = "image-browser:upscale";

function remembered(): UpscaleChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
    return { mode: saved.mode ?? "conservative", prompt: "", amount: saved.amount ?? 0.5 };
  } catch {
    return { mode: "conservative", prompt: "", amount: 0.5 };
  }
}

/** Asks how to enlarge the picture: on the Mac, or with Stability AI, which understands what it shows. */
export function UpscaleDialog({ image, onCancel, onStart }: UpscaleDialogProps) {
  const [choice, setChoice] = useState<UpscaleChoice>(remembered);
  const [hasKey, setHasKey] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return;
    setChoice(remembered());
    setKey("");
    setEditingKey(false);
    setError(null);
    hasCloudKey().then(setHasKey, () => setHasKey(false));
  }, [image]);

  const cloud = choice.mode === "conservative" || choice.mode === "creative";
  const needsKey = cloud && (!hasKey || editingKey);
  const ready = !needsKey || key.trim() !== "";

  const start = async () => {
    if (!ready) return;
    try {
      if (needsKey) await saveCloudKey(key);
    } catch (e) {
      setError(String(e));
      return;
    }
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ mode: choice.mode, amount: choice.amount }));
    } catch {
      // Only a convenience.
    }
    onStart(choice);
  };

  return (
    <Dialog open={image !== null} onClose={onCancel} labelledBy="upscale-title" className="max-w-lg">
      <h2 id="upscale-title" className="flex items-center gap-2 text-lg font-semibold">
        <WandSparkles className="size-5" />
        Förstora bilden
      </h2>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {image?.name}, {image?.width} × {image?.height}. Kopian sparas bredvid originalet.
      </p>

      <div role="radiogroup" aria-label="Sätt att förstora" className="mt-4 space-y-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={choice.mode === m.mode}
            onClick={() => setChoice({ ...choice, mode: m.mode })}
            className={cn(
              "flex w-full gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              choice.mode === m.mode && "border-foreground/60 bg-accent",
            )}
          >
            <span className="mt-0.5 shrink-0">{m.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{m.title}</span>
              <span className="block text-xs text-muted-foreground">{m.text}</span>
            </span>
          </button>
        ))}
      </div>

      {cloud && (
        <>
          <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="upscale-prompt">
            Vad visar bilden? (valfritt, gärna på engelska)
          </label>
          <textarea
            id="upscale-prompt"
            rows={2}
            value={choice.prompt}
            onChange={(e) => setChoice({ ...choice, prompt: e.target.value })}
            placeholder="Till exempel: portrait of an old man by a lake, evening light"
            className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="upscale-amount">
            Hur fritt får den hitta på detaljer?
          </label>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Lite</span>
            <input
              id="upscale-amount"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={choice.amount}
              onChange={(e) => setChoice({ ...choice, amount: Number(e.target.value) })}
              className="size-slider flex-1"
            />
            <span>Mycket</span>
          </div>

          {needsKey ? (
            <>
              <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="upscale-key">
                API-nyckel från Stability AI
              </label>
              <input
                id="upscale-key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Skapa ett konto och en nyckel på platform.stability.ai. Nyckeln sparas i Macens nyckelring.
              </p>
            </>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5 shrink-0" />
              API-nyckeln finns i nyckelringen.
              <button
                type="button"
                onClick={() => setEditingKey(true)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Byt nyckel
              </button>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Bilden skickas till Stability AI, och varje förstoring drar krediter från ditt konto där.
          </p>
        </>
      )}

      {choice.mode === "bigger" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Bilden skickas till bigger.pics. Är den redan stor kan förstoringen ta en stund.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
        <Button onClick={start} disabled={!ready} data-autofocus>
          <WandSparkles />
          Förstora
        </Button>
      </div>
    </Dialog>
  );
}
