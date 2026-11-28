import { useCallback, useEffect, useState } from "react";
import { Download, FlaskConical, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  canUpdate,
  checkUpdate,
  currentVersion,
  installedTestVersion,
  installUpdate,
  testVersions,
  type FoundUpdate,
  type TestVersion,
} from "@/lib/updates";

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  /** Start installing the newest main version right away (from the toast's "Uppdatera"). */
  installNow?: boolean;
}

type MainState =
  | { kind: "looking" }
  | { kind: "newest" }
  | { kind: "found"; update: FoundUpdate; back: boolean }
  | { kind: "error"; text: string };

/**
 * Shows which version this is, installs a newer one, and lists the test versions (one per open pull
 * request) that can be tried. A version installed from here opens without macOS asking first.
 */
export function UpdateDialog({ open, onClose, installNow = false }: UpdateDialogProps) {
  const [version, setVersion] = useState("");
  const [main, setMain] = useState<MainState>({ kind: "looking" });
  const [tests, setTests] = useState<TestVersion[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  /** What is being installed: "main" or a test tag, and how far the download has come. */
  const [installing, setInstalling] = useState<{ what: string; share: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const testTag = installedTestVersion();

  const install = useCallback(async (tag: string | null, alreadyChecked: boolean) => {
    setError(null);
    setInstalling({ what: tag ?? "main", share: null });
    try {
      if (!alreadyChecked) {
        const update = await checkUpdate(tag, true);
        if (!update) throw new Error("Versionen finns inte längre.");
      }
      await installUpdate(tag, (share) => setInstalling({ what: tag ?? "main", share }));
    } catch (e) {
      setInstalling(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setMain({ kind: "looking" });
    setTests(null);
    setTestError(null);
    setError(null);
    setInstalling(null);
    currentVersion().then((v) => !stale && setVersion(v));
    (async () => {
      try {
        if (!(await canUpdate())) {
          throw new Error("Den här versionen kan inte uppdatera sig själv. Installera en version från GitHub en sista gång.");
        }
        let update = await checkUpdate();
        let back = false;
        if (!update && installedTestVersion()) {
          update = await checkUpdate(null, true);
          back = update !== null;
        }
        if (stale) return;
        setMain(update ? { kind: "found", update, back } : { kind: "newest" });
        if (update && installNow && !back) install(null, true);
      } catch (e) {
        if (!stale) setMain({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      }
    })();
    testVersions().then(
      (list) => !stale && setTests(list),
      (e) => !stale && setTestError(String(e)),
    );
    return () => {
      stale = true;
    };
  }, [open, installNow, install]);

  const busy = installing !== null;

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} labelledBy="update-title" className="max-h-[90vh] max-w-lg overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 id="update-title" className="flex items-center gap-2 text-lg font-semibold">
          <RefreshCw className="size-5" />
          Uppdateringar
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label="Stäng" title="Stäng (Esc)">
          <X />
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Du har Imagime {version}
        {testTag ? `, testversionen ${testTag.replace("test-pr-", "#")}` : ""}.
      </p>

      {installing ? (
        <div className="mt-5" role="status">
          <p className="text-sm">
            {installing.share === null || installing.share < 1 ? "Hämtar den nya versionen…" : "Installerar…"} Imagime startar om
            av sig själv när den är klar.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full bg-foreground/70 transition-[width] ${installing.share === null ? "w-1/3 animate-pulse" : ""}`}
              style={installing.share === null ? undefined : { width: `${Math.round(installing.share * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <section className="mt-4 rounded-md border px-3 py-3">
            {main.kind === "looking" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Söker efter en ny version…
              </p>
            )}
            {main.kind === "newest" && <p className="text-sm">Du har den senaste versionen.</p>}
            {main.kind === "error" && <p className="text-sm text-destructive">{main.text}</p>}
            {main.kind === "found" && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {main.back ? "Tillbaka till huvudversionen" : "En ny version finns"}, {main.update.version}
                  </p>
                  {main.update.notes && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{main.update.notes}</p>
                  )}
                </div>
                <Button onClick={() => install(null, true)} data-autofocus>
                  <Download />
                  Uppdatera
                </Button>
              </div>
            )}
          </section>

          <section className="mt-5">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FlaskConical className="size-3.5" />
              Testversioner, en för varje ändring som inte är klar än
            </h3>
            {tests === null && !testError && <p className="py-1.5 text-sm text-muted-foreground">Hämtar listan…</p>}
            {testError && <p className="py-1.5 text-sm text-destructive">{testError}</p>}
            {tests?.length === 0 && <p className="py-1.5 text-sm text-muted-foreground">Inga testversioner just nu.</p>}
            <ul className="flex flex-col">
              {tests?.map((t) => (
                <li key={t.tag} className="flex items-center justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.tag.replace("test-pr-", "#")}
                      {t.date && `, ${new Date(t.date).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`}
                      {t.tag === testTag && ", installerad"}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => install(t.tag, false)}>
                    Prova
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}
