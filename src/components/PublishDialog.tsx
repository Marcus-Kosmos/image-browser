import { useEffect, useState } from "react";
import { Check, Copy, FolderDown, Globe, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { hasHostPassword, saveHostPassword, type WebHost, type WebProtocol } from "@/lib/api";
import { loadWebHost, saveWebHost, webName } from "@/lib/webpage";

interface PublishDialogProps {
  /** The series to publish; null keeps the dialog closed. */
  seriesName: string | null;
  onClose: () => void;
  /** Uploads the page into the folder `name` on the host; resolves to its address. */
  onPublish: (host: WebHost, name: string) => Promise<string>;
  /** Saves the page in a folder on this Mac instead; resolves to where, or null when cancelled. */
  onSaveLocal: (name: string) => Promise<string | null>;
}

const PROTOCOL_LABELS: Record<WebProtocol, string> = {
  sftp: "SFTP",
  ftps: "FTP med kryptering (FTPS)",
  ftp: "FTP utan kryptering",
};
const DEFAULT_PORT: Record<WebProtocol, number> = { sftp: 22, ftps: 21, ftp: 21 };

const EMPTY_HOST: WebHost = { protocol: "sftp", host: "", port: 22, user: "", folder: "public_html", url: "" };

const field =
  "mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const label = "mt-3 block text-xs font-medium text-muted-foreground";

type State =
  | { step: "form" }
  | { step: "busy" }
  | { step: "done"; where: string; online: boolean }
  | { step: "error"; message: string };

/** Puts a series on the user's own web host as a web page, or saves the page on the Mac. */
export function PublishDialog({ seriesName, onClose, onPublish, onSaveLocal }: PublishDialogProps) {
  const [host, setHost] = useState<WebHost>(EMPTY_HOST);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<State>({ step: "form" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (seriesName === null) return;
    setHost(loadWebHost() ?? EMPTY_HOST);
    setName(webName(seriesName));
    setPassword("");
    setState({ step: "form" });
    setCopied(false);
  }, [seriesName]);

  // Whether the keychain already knows this account's password.
  useEffect(() => {
    if (seriesName === null || !host.host || !host.user) return setSaved(false);
    let live = true;
    hasHostPassword(host).then(
      (has) => live && setSaved(has),
      () => live && setSaved(false),
    );
    return () => {
      live = false;
    };
  }, [seriesName, host.host, host.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<WebHost>) => {
    // A new server or account has a key of its own.
    const fingerprint = patch.host !== undefined || patch.port !== undefined ? undefined : host.fingerprint;
    setHost({ ...host, fingerprint, ...patch });
  };
  const folderName = webName(name);
  const ready = host.host.trim() && host.user.trim() && host.url.trim() && (saved || password);

  const publish = async () => {
    if (!ready) return;
    setState({ step: "busy" });
    try {
      if (password) {
        await saveHostPassword(host, password);
        setPassword("");
        setSaved(true);
      }
      saveWebHost(host);
      const url = await onPublish(host, folderName);
      setHost(loadWebHost() ?? host);
      setState({ step: "done", where: url, online: true });
    } catch (e) {
      setState({ step: "error", message: String(e) });
    }
  };

  const saveLocal = async () => {
    setState({ step: "busy" });
    try {
      const where = await onSaveLocal(folderName);
      setState(where ? { step: "done", where, online: false } : { step: "form" });
    } catch (e) {
      setState({ step: "error", message: String(e) });
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <Dialog
      open={seriesName !== null}
      onClose={state.step === "busy" ? () => {} : onClose}
      labelledBy="publish-title"
      className="max-w-lg"
    >
      <h2 id="publish-title" className="flex items-center gap-2 text-lg font-semibold">
        <Globe className="size-5" />
        Publicera som webbsida
      </h2>

      {state.step === "done" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {state.online ? "Webbsidan finns nu på adressen:" : "Webbsidan är sparad i mappen:"}
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium select-all">{state.where}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => copy(state.where)}
              title="Kopiera"
              aria-label="Kopiera"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {state.online
              ? "Skicka adressen till dem som ska se bilderna. Publicerar du serien igen ersätts sidan."
              : "Öppna index.html i mappen för att se sidan, eller ladda upp hela mappen till din webbserver."}
          </p>
          <div className="mt-6 flex justify-end">
            <Button onClick={onClose} data-autofocus>
              Stäng
            </Button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            publish();
          }}
        >
          <p className="mt-2 text-sm text-muted-foreground">
            Serien blir en egen sida med bilderna i rader, i samma färger och ramar som här. Uppgifterna sparas till
            nästa gång.
          </p>

          <div className="mt-1 grid grid-cols-[1fr_6rem] gap-x-3">
            <div>
              <label className={label} htmlFor="publish-protocol">
                Anslutning
              </label>
              <NativeSelect
                id="publish-protocol"
                wrapperClassName="mt-1 w-full"
                value={host.protocol}
                onChange={(e) => {
                  const protocol = e.target.value as WebProtocol;
                  update({ protocol, port: DEFAULT_PORT[protocol] });
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {(Object.keys(PROTOCOL_LABELS) as WebProtocol[]).map((p) => (
                  <option key={p} value={p}>
                    {PROTOCOL_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label className={label} htmlFor="publish-port">
                Port
              </label>
              <input
                id="publish-port"
                inputMode="numeric"
                value={host.port || ""}
                onChange={(e) => update({ port: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className={field}
              />
            </div>
          </div>
          {host.protocol === "ftp" && (
            <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="size-3.5 shrink-0 translate-y-px" />
              Utan kryptering skickas lösenordet öppet över nätet. Välj SFTP eller FTPS om webbhotellet har det.
            </p>
          )}

          <label className={label} htmlFor="publish-host">
            Server
          </label>
          <input
            id="publish-host"
            data-autofocus
            value={host.host}
            onChange={(e) => update({ host: e.target.value.trim() })}
            placeholder="Till exempel ftp.dindomän.se"
            autoCapitalize="off"
            spellCheck={false}
            className={field}
          />

          <div className="grid grid-cols-2 gap-x-3">
            <div>
              <label className={label} htmlFor="publish-user">
                Användarnamn
              </label>
              <input
                id="publish-user"
                value={host.user}
                onChange={(e) => update({ user: e.target.value })}
                autoCapitalize="off"
                spellCheck={false}
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="publish-password">
                Lösenord
              </label>
              <input
                id="publish-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={saved ? "Sparat i nyckelringen" : undefined}
                autoComplete="off"
                className={field}
              />
            </div>
          </div>
          <p className="mt-1.5 flex gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3.5 shrink-0 translate-y-px" />
            Lösenordet sparas i Macens nyckelring, inte i appen.
          </p>

          <label className={label} htmlFor="publish-folder">
            Mapp på servern
          </label>
          <input
            id="publish-folder"
            value={host.folder}
            onChange={(e) => update({ folder: e.target.value })}
            placeholder="Mappen som webbadressen visar, till exempel public_html"
            autoCapitalize="off"
            spellCheck={false}
            className={field}
          />

          <label className={label} htmlFor="publish-url">
            Webbadress till mappen
          </label>
          <input
            id="publish-url"
            value={host.url}
            onChange={(e) => update({ url: e.target.value.trim() })}
            placeholder="Till exempel https://bilder.dindomän.se"
            autoCapitalize="off"
            spellCheck={false}
            className={field}
          />

          <label className={label} htmlFor="publish-name">
            Sidans namn
          </label>
          <input id="publish-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            Adress: {(host.url.trim() || "https://…").replace(/\/+$/, "")}/{folderName}/
          </p>

          {state.step === "error" && (
            <p role="alert" className="mt-4 flex gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm">
              <TriangleAlert className="size-4 shrink-0 translate-y-0.5 text-destructive" />
              <span className="min-w-0 break-words">{state.message}</span>
            </p>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={saveLocal}
              disabled={state.step === "busy"}
              title="Spara sidan i en mapp på Macen i stället"
            >
              <FolderDown />
              Spara på Macen
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose} disabled={state.step === "busy"}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!ready || state.step === "busy"}>
              {state.step === "busy" ? <Loader2 className="animate-spin" /> : <Globe />}
              {state.step === "busy" ? "Laddar upp…" : "Publicera"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
