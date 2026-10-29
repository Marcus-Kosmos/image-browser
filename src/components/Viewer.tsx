import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  FolderSearch,
  Heart,
  Info,
  LayoutDashboard,
  Loader2,
  BadgeInfo,
  PanelBottomClose,
  PanelBottomOpen,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  PanelLeft,
  PanelRight,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  PanelBottom,
  PanelTop,
  PencilLine,
  Pin,
  RectangleEllipsis,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { AiMark, aiMarkTitle } from "./AiMark";
import { Button } from "@/components/ui/button";
import { listFonts, originalUrl, useWindowFullscreen, type ImageEntry } from "@/lib/api";
import { INSET_SHADOW, frameStyle } from "@/lib/frame";
import type { Frame, Heading, Shadow } from "@/lib/settings";
import {
  captionLineHeight,
  DEFAULT_VIEWER_SETTINGS,
  hasRoomToPin,
  pinLayout,
  pinPages,
  nextScreenFit,
  resolveTransition,
  useViewerSettings,
  CAPTION_ALIGN_LABELS,
  CAPTION_PLACE_LABELS,
  captionAlignAt,
  type CaptionAlign,
  type CaptionPlace,
  type CaptionSize,
  type Rect,
  type ViewerSettings,
  type ViewerTransition,
  type ViewerEffect,
} from "@/lib/viewer";
import type { Tag } from "@/lib/filter";
import type { Series } from "@/lib/library";
import { SeriesPicker } from "./SeriesPicker";
import { CollectionsPanel, FAVORITES_TARGET } from "./CollectionsPanel";
import { ViewerLookMenu } from "./ViewerLookMenu";
import { SavePinnedMenu, type SavePinnedChoice } from "./SavePinnedMenu";
import { HeadingText } from "./HeadingText";
import { HEADING_COLORS, lastStyle, rememberStyle } from "./HeadingDialog";
import { NativeSelect } from "@/components/ui/native-select";
import { useCloseOnLeaveAfterChoice } from "@/lib/menu";
import { WaitingRing, type Waiting } from "./WaitingRing";
import { GRID_THUMB_SIZE, VIEWER_THUMB_SIZE, requestThumbnail, viewerSize } from "@/lib/thumbnails";
import { LayoutGridCircles } from "./icons";
import { cn, formatBytes } from "@/lib/utils";

interface ViewerProps {
  images: ImageEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onTrash: (index: number) => void;
  /** Shown in a series: takes the image out of it; the file stays. */
  onRemove?: (index: number) => void;
  /** Enlarges the image with AI into a new file beside it. */
  onUpscale?: (index: number) => void;
  /** Shows the image's file in Finder. */
  onReveal?: (index: number) => void;
  /** Whether an enlargement is running. */
  upscaling?: boolean;
  /** Marks pictures made or changed by AI. */
  showAiMark?: boolean;
  /** Turns the AI marks on or off, everywhere. */
  onShowAiMarkChange?: (show: boolean) => void;
  /** The picture being enlarged, shown as the old version until the copy arrives. */
  waiting?: Waiting | null;
  isFavorite: (image: ImageEntry) => boolean;
  /** Favoriter and the series the image is in. */
  tagsOf: (image: ImageEntry) => Tag[];
  onToggleFavorite: (index: number) => void;
  /** The series listed in the sidebar, which the image can be added to. */
  series: Series[];
  onToggleSeries: (id: string, index: number) => void;
  onCreateSeries: (name: string, index: number) => void;
  newSeriesName: string;
  onShowShortcuts: () => void;
  /** The folder's frame and shadow, drawn when the viewer is set to show them. */
  frame: Frame;
  shadow: Shadow;
  /** Images kept in the top left corner while stepping on. */
  pinned: ImageEntry[];
  onPinnedChange: (pinned: ImageEntry[]) => void;
  /** Saves the pinned images, in order, as a new series, with the look when chosen. */
  onSavePinned: (name: string, look: ViewerSettings | undefined, appearance: boolean) => void;
  defaultPinnedName: string;
  /** A series' saved look, used instead of the usual one while this viewer is open. */
  savedLook?: ViewerSettings;
  /** The heading written for an image, if any. */
  headingOf: (image: ImageEntry) => Heading | undefined;
  /** Writes or removes an image's heading, typed in place over the picture. */
  onHeadingChange?: (index: number, heading: Heading | undefined) => void;
  /** Keyboard shortcuts pause while another dialog (the trash confirmation) is open. */
  paused: boolean;
}

interface Layer {
  id: number;
  path: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  /** How this image comes in, and how the one under it goes. */
  effect: ViewerEffect;
  /** 1 when stepping forward, -1 back. */
  dir: 1 | -1;
}

/** Resolves once the browser has decoded the image, so swapping it in never shows a blank frame. */
function decoded(src: string) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

/** Length of each effect; the covered image is dropped once the longest has finished. */
const DURATION: Record<ViewerEffect, number> = {
  none: 0,
  fade: 350,
  "slide-left": 700,
  "slide-right": 700,
  rise: 700,
  cascade: 800,
  parallax: 750,
};
const LONGEST = 800;

/** Size of a pinned preview, and the gap between them. */
const PIN_W = 120;
const PIN_H = 90;
const PIN_GAP = 8;
/** Pinned previews fill at most this many columns. */
const PIN_COLUMNS = 2;
/** Space between larger pinned pictures and the current one. */
const PIN_ROW_GAP = 12;

/** Pinned pictures and the current one glide to their new places as the layout changes. */
const SLOT_TRANSITION = "left 300ms ease-out, top 300ms ease-out, width 300ms ease-out, height 300ms ease-out";

/** Corner radii for "Rundade hörn": the frame's outer edge, and the picture inside it. */
function corners(rounded: boolean, framing: React.CSSProperties, width: number, height: number) {
  if (!rounded) return { outer: undefined, inner: undefined };
  const outer = Math.round(Math.max(8, Math.min(28, Math.min(width, height) * 0.03)));
  const pad = typeof framing.padding === "number" ? framing.padding : 0;
  return { outer, inner: pad ? Math.max(3, outer - pad) : outer };
}

const DROP_SHADOW = "0 24px 48px -12px rgb(0 0 0 / 0.55), 0 4px 12px rgb(0 0 0 / 0.25)";

interface Zoom {
  /** 1 shows the whole picture. */
  scale: number;
  /** Offset of the picture's center from the stage's, in screen pixels. */
  x: number;
  y: number;
}
const WHOLE: Zoom = { scale: 1, x: 0, y: 0 };
/** Clicks from the whole picture to the closest zoom. */
const ZOOM_STEPS = 3;

/** Where an image starts before it comes in. */
function enterStyle(effect: ViewerEffect, dir: 1 | -1): React.CSSProperties {
  switch (effect) {
    case "none":
      return {};
    case "slide-left":
      return { opacity: 0, transform: "translateX(-120px)" };
    case "slide-right":
      return { opacity: 0, transform: "translateX(120px)" };
    case "rise":
      return { opacity: 0, transform: "translateY(80px)" };
    case "cascade":
      return { opacity: 0, transform: "translateY(-48px) scale(0.94)" };
    case "parallax":
      // The new image passes over the old one, which drifts away more slowly, as if further back.
      return { opacity: 0.4, transform: `translateX(${dir * 60}vw)` };
    default:
      return { opacity: 0 };
  }
}

/** Where a covered image goes as the next one comes in with `effect`. */
function exitStyle(effect: ViewerEffect, dir: 1 | -1): React.CSSProperties {
  if (effect === "parallax") return { opacity: 0, transform: `translateX(${-dir * 18}vw)` };
  return { opacity: 0 };
}

function transitionFor(effect: ViewerEffect) {
  const ms = DURATION[effect];
  if (!ms) return "none";
  return `opacity ${ms}ms ease-out, transform ${ms}ms cubic-bezier(0.16, 1, 0.3, 1)`;
}

/** Padding a frame adds on each side of a picture this size. */
function framePad(frame: Frame, width: number, height: number) {
  const style = frameStyle(frame, width, height);
  return (typeof style.padding === "number" ? style.padding : 0) + (style.border ? 1 : 0);
}

/**
 * The largest box with the picture's shape that fits with its frame, never larger than the picture.
 * "grow" lets it grow past its own size to fill the room; "cover" fills the room, cut at the edges.
 */
function fit(
  room: { width: number; height: number },
  width: number,
  height: number,
  frame: Frame,
  mode: "fit" | "grow" | "cover" = "fit",
) {
  if (mode === "cover") {
    const scale = Math.max(room.width / width, room.height / height);
    const picture = { width: Math.round(width * scale), height: Math.round(height * scale) };
    return { picture, ...picture };
  }
  const most = mode === "grow" ? Infinity : 1;
  const first = Math.min(room.width / width, room.height / height, most);
  const room0 = framePad(frame, width * first, height * first);
  const scale = Math.max(0, Math.min((room.width - 2 * room0) / width, (room.height - 2 * room0) / height, most));
  const picture = {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
  const pad = framePad(frame, picture.width, picture.height);
  return {
    picture,
    width: picture.width + 2 * pad,
    height: picture.height + 2 * pad,
  };
}

export function Viewer({
  images,
  index,
  onIndexChange,
  onClose,
  onTrash,
  onRemove,
  onUpscale,
  onReveal,
  upscaling = false,
  showAiMark = false,
  onShowAiMarkChange,
  waiting = null,
  isFavorite,
  tagsOf,
  onToggleFavorite,
  series,
  onToggleSeries,
  onCreateSeries,
  newSeriesName,
  onShowShortcuts,
  frame: folderFrame,
  shadow: folderShadow,
  pinned,
  onPinnedChange,
  onSavePinned,
  defaultPinnedName,
  savedLook,
  headingOf,
  onHeadingChange,
  paused,
}: ViewerProps) {
  const { settings: usual, update: updateUsual } = useViewerSettings();
  // A saved look can be changed here for the moment, without changing the series or the usual look.
  // Looks saved before an option existed get its default.
  const [own, setOwn] = useState(savedLook && { ...DEFAULT_VIEWER_SETTINGS, ...savedLook });
  const look = own ?? usual;
  const updateLook = (change: Partial<ViewerSettings>) => (own ? setOwn({ ...own, ...change }) : updateUsual(change));
  // On the whole screen the header shows while the mouse moves, and fades when it rests.
  const [chrome, setChrome] = useState(true);
  const resting = useRef(0);
  const wake = () => {
    setChrome(true);
    window.clearTimeout(resting.current);
    resting.current = window.setTimeout(() => setChrome(false), 2500);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(resting.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.screen]);
  const frame = look.frame ? folderFrame : "none";
  const shadow = look.frame ? folderShadow : "none";
  // Read when the image changes, so changing the setting doesn't replay the current one.
  const transition = useRef(look.transition);
  transition.current = look.transition;
  const step = useRef(0);
  const lastIndex = useRef(index);
  const [picking, setPicking] = useState(false);
  const image = images[index];
  // The image on top fades in over the previous one, which is removed once covered.
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // Take focus from the grid tile that opened the viewer, so its key handlers don't fire underneath.
  // On close the gallery moves focus to the image last viewed.
  useEffect(() => {
    root.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sharp = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const chosen = resolveTransition(transition.current, step.current++);
    const effect: ViewerEffect = reduced && chosen !== "none" ? "fade" : chosen;
    const dir: 1 | -1 = index < lastIndex.current ? -1 : 1;
    lastIndex.current = index;
    const show = (src: string, isSharp: boolean) =>
      void decoded(src).then(() => {
        // Ignore a late grid thumbnail once the sharp version is up, and anything after moving on.
        if (cancelled || (sharp && !isSharp)) return;
        sharp ||= isSharp;
        setLayers((prev) => {
          const top = prev[prev.length - 1];
          if (top?.path === image.path) return [...prev.slice(0, -1), { ...top, src }];
          const layer: Layer = {
            id: nextId.current++,
            path: image.path,
            src,
            alt: image.name,
            width: image.width,
            height: image.height,
            effect,
            dir,
          };
          return [...prev.slice(-1), layer];
        });
      });
    // Show the grid thumbnail quickly, then swap in the sharp version.
    const cancelPreview = requestThumbnail(image, GRID_THUMB_SIZE, (src) => show(src, false));
    const cancelFull = requestThumbnail(image, viewerSize(image), (src) => show(src, true));
    return () => {
      cancelled = true;
      cancelPreview();
      cancelFull();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Drop the covered image once the transition has finished.
  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), LONGEST + 50);
    return () => clearTimeout(timer);
  }, [layers.length]);

  // Prepare the neighbours so stepping to them is instant.
  useEffect(() => {
    const cancels = [images[index - 1], images[index + 1]]
      .filter(Boolean)
      .map((img) => requestThumbnail(img, viewerSize(img), (src) => void decoded(src)));
    return () => cancels.forEach((c) => c());
  }, [images, index]);

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  // The whole area below the header, which a zoomed picture fills.
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!area) return;
    const measure = () => setAreaSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [area]);
  useEffect(() => {
    if (!content) return;
    const measure = () => setSpace({ width: content.clientWidth, height: content.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);
  // Larger pinned pictures share the space with the current one, which is shown once, on the right.
  const pinSize = look.pinSize;
  // A pinned picture clicked in the arrangement is shown on its own, large; the arrangement comes back as it
  // was, with the picture that was shown before, on Escape or "Visa serien".
  const [solo, setSolo] = useState<number | null>(null);
  // The current picture's heading while it is written in place, with the tools for it in the bar below.
  const [draft, setDraft] = useState<Heading | null>(null);
  useEffect(() => setDraft(null), [image.path]);
  // Among several pictures shown together, the bar of buttons can be pointed at a pinned one instead of
  // the current one. Stepping on points it back.
  const [aimedAt, setAimedAt] = useState<string | null>(null);
  useEffect(() => setAimedAt(null), [image.path]);
  const arranged = pinSize !== "small" && solo === null ? pinSize : null;
  // Larger pinned pictures go on pages, in the order they were pinned. The page shown is the current
  // picture's own, or else the last one, where it would be pinned next; on a full page it stands alone,
  // as the start of the next.
  const pages = arranged ? pinPages(arranged, pinned, space, PIN_ROW_GAP) : [];
  const pinnedAt = pinned.findIndex((p) => p.path === image.path);
  let page = pages.findIndex((pg) => pg.includes(pinnedAt));
  let beside: ImageEntry[] = [];
  let at: number | undefined;
  if (arranged && page >= 0) {
    beside = pages[page].filter((i) => i !== pinnedAt).map((i) => pinned[i]);
    at = pages[page].indexOf(pinnedAt);
  } else if (arranged) {
    const last = (pages[pages.length - 1] ?? []).map((i) => pinned[i]);
    const fits = last.length > 0 && hasRoomToPin(arranged, last, image, space, PIN_ROW_GAP);
    if (fits) beside = last;
    page = fits ? pages.length - 1 : pages.length;
  }
  const pageCount = arranged ? Math.max(pages.length, page + 1) : 0;
  // What the bar of buttons, the collections and the keys act on: the pinned picture pointed at while it
  // is shown, else the current one.
  const aimedIndex = aimedAt && beside.some((p) => p.path === aimedAt) ? images.findIndex((img) => img.path === aimedAt) : -1;
  const actIndex = aimedIndex >= 0 ? aimedIndex : index;
  const actOn = images[actIndex] ?? image;
  const layout = arranged ? pinLayout(arranged, beside, image, space, PIN_ROW_GAP, at) : null;
  const goToPage = (k: number) => {
    const first = pages[k]?.[0];
    const i = first === undefined ? -1 : images.findIndex((img) => img.path === pinned[first].path);
    if (i >= 0) onIndexChange(i);
  };
  // One image at a time can take the whole screen: the header steps aside and the margins go.
  const wide = !layout && look.screen !== "margins";
  const fitMode = !wide ? "fit" : look.screen === "fill" ? "cover" : "grow";
  // A frame cut off at the screen's edges would look broken, so a filling picture goes without.
  const pictureFrame = fitMode === "cover" ? "none" : frame;
  useWindowFullscreen(wide);
  const room = layout ? { width: layout.current.width, height: layout.current.height } : space;
  // The largest box with the picture's shape that fits, never larger than the picture itself.
  // A heading above the picture takes a line from its room.
  const captionOf = (img: ImageEntry) => (look.captionPlace === "off" ? undefined : headingOf(img));
  // A heading being written takes its room as it is typed; an empty one keeps the room of a short one.
  const heading = draft ? { ...draft, text: draft.text || "Rubrik" } : captionOf(image);
  const captionHeight = heading ? captionLineHeight(heading.level, look.captionSize, room.height) : 0;
  const lift = heading && besidePicture(look.captionPlace) ? captionHeight : 0;
  // A heading above moves the picture down, one under moves it up.
  const shift = look.captionPlace === "below" ? -lift : lift;
  // A heading to the left or right takes a column of its own, and moves the picture the other way.
  const aside = heading && asidePicture(look.captionPlace) ? asideWidth(room.width) : 0;
  const slide = look.captionPlace === "right" ? -aside : aside;
  const align = captionAlignAt(look.captionPlace, look.captionAlign);
  const pictureRoom = { width: Math.max(0, room.width - aside), height: Math.max(0, room.height - lift) };
  const box = fit(pictureRoom, image.width, image.height, pictureFrame, fitMode);
  // Beside pinned pictures the stage hugs the picture, so zooming stays in its place.
  const view = layout ? { width: box.width + aside, height: box.height + lift } : room;
  // The part of the picture on screen, where the heart and heading go when it's cut at the edges.
  const shown = { width: Math.min(box.width, pictureRoom.width), height: Math.min(box.height, pictureRoom.height) };
  const top = layers[layers.length - 1];

  // Zoom: each click magnifies where it points, three clicks reach the closest view.
  const [zoom, setZoom] = useState<Zoom>(WHOLE);
  const [panning, setPanning] = useState(false);
  // With "Behåll zoom" each image comes back as it was left while the viewer is open.
  const kept = useRef(new Map<string, Zoom>());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setZoom((look.keepZoom && kept.current.get(image.path)) || WHOLE), [image]);
  // Zoomed, the picture is seen through the whole area, not just its own place.
  const zoomView = areaSize.width > 0 ? areaSize : view;
  // Where the pinned pictures' box sits in that area, to reach its corner from inside it.
  const areaOffset = layout
    ? { x: (content?.offsetLeft ?? 0) + (space.width - layout.width) / 2, y: (space.height - layout.height) / 2 }
    : { x: 0, y: 0 };
  // Beside pinned pictures the first step fills the area with the picture, then it zooms on from there.
  const fullScale = layout ? Math.max(1, Math.min(zoomView.width / box.width, zoomView.height / box.height)) : 1;
  // At least 3× that, more for a picture with pixels to spare, so the last step shows them one to one.
  const maxScale = Math.min(12 * fullScale, Math.max(3 * fullScale, image.width / Math.max(1, box.picture.width)));
  const levels = [
    ...(fullScale > 1.05 ? [1] : []),
    ...Array.from({ length: ZOOM_STEPS + 1 }, (_, k) => fullScale * (maxScale / fullScale) ** (k / ZOOM_STEPS)),
  ];
  const zoomed = zoom.scale > 1.001;
  const atMax = zoom.scale >= maxScale - 0.001;
  useEffect(() => {
    if (zoomed) kept.current.set(image.path, zoom);
    else kept.current.delete(image.path);
    // Only a change of zoom; a new image restores its own first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  /** Keeps the picture covering the stage, so it can't be dragged off screen. */
  const clamp = useCallback(
    (z: Zoom): Zoom => {
      const limitX = Math.max(0, (box.width * z.scale - zoomView.width) / 2);
      const limitY = Math.max(0, (box.height * z.scale - zoomView.height) / 2);
      return {
        scale: z.scale,
        x: Math.max(-limitX, Math.min(limitX, z.x)),
        y: Math.max(-limitY, Math.min(limitY, z.y)),
      };
    },
    [box.width, box.height, zoomView.width, zoomView.height],
  );

  /** Zooms to `scale`, keeping the point `px, py` (from the stage's center) where it is. */
  const zoomTo = useCallback(
    (scale: number, px = 0, py = 0) =>
      setZoom((z) => {
        if (scale <= 1.001) return WHOLE;
        const qx = (px - z.x) / z.scale;
        const qy = (py - z.y) / z.scale;
        return clamp({ scale, x: px - qx * scale, y: py - qy * scale });
      }),
    [clamp],
  );
  const stepZoom = useCallback(
    (dir: 1 | -1, px = 0, py = 0) => {
      // From its place among pinned pictures, the picture first grows to fill the area, centered.
      if (dir > 0 && !zoomed && fullScale > 1.05) return zoomTo(fullScale);
      const next =
        dir > 0
          ? (levels.find((l) => l > zoom.scale + 0.001) ?? maxScale)
          : ([...levels].reverse().find((l) => l < zoom.scale - 0.001) ?? 1);
      zoomTo(next, px, py);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom.scale, zoomed, fullScale, maxScale, zoomTo],
  );

  // The file itself once zoomed in, as the largest thumbnail runs out of detail.
  const [original, setOriginal] = useState<{
    path: string;
    src: string;
  } | null>(null);
  useEffect(() => {
    if (!zoomed || original?.path === image.path) return;
    let cancelled = false;
    let cancelConverted = () => {};
    const use = (src: string) =>
      void decoded(src).then(() => {
        if (!cancelled) setOriginal({ path: image.path, src });
      });
    const src = originalUrl(image);
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => !cancelled && setOriginal({ path: image.path, src }))
      // A format the browser can't draw (RAW, some HEIC) is converted at full size instead.
      .catch(() => {
        if (!cancelled) cancelConverted = requestThumbnail(image, Math.max(image.width, image.height), use);
      });
    return () => {
      cancelled = true;
      cancelConverted();
    };
  }, [zoomed, image, original?.path]);

  // A press either drags the zoomed picture around or, without moving, is a zoom click.
  const press = useRef<{
    x: number;
    y: number;
    from: Zoom;
    moved: boolean;
  } | null>(null);
  // Dragging the whole picture carries it to Favoriter or a series beside it; zoomed, a drag pans instead.
  const [carry, setCarry] = useState<{ x: number; y: number; over: string | null } | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  /** Set when the side menu is folded in under the pointer, so it stays folded until the pointer leaves. */
  const railHeld = useRef(false);
  const pinCollections = (collections: boolean) => {
    updateLook({ collections });
    if (!collections) {
      setRailOpen(false);
      railHeld.current = true;
    }
  };
  const aiOf = useMemo(
    () => new Map(images.flatMap((img) => (img.ai ? [[img.path, img.ai] as const] : []))),
    [images],
  );
  const [added, setAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(null), 1200);
    return () => window.clearTimeout(t);
  }, [added]);
  const inSeries = (id: string, path = actOn.path) =>
    !!series.find((s) => s.id === id)?.images.some((img) => img.path === path);
  // A drop carries the current picture, whatever the bar is pointed at.
  const dropIn = (target: string) => {
    if (target === FAVORITES_TARGET) {
      if (!isFavorite(image)) onToggleFavorite(index);
    } else if (!inSeries(target, image.path)) onToggleSeries(target, index);
    setAdded(target);
  };
  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, [role=menu], input, select, label")) return;
    press.current = { x: e.clientX, y: e.clientY, from: zoom, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onStageMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!zoomed) {
      if (!p.moved && Math.hypot(dx, dy) < 6) return;
      p.moved = true;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-collection]");
      setCarry({ x: e.clientX, y: e.clientY, over: target?.dataset.collection ?? null });
      return;
    }
    if (!p.moved && Math.hypot(dx, dy) < 4) return;
    p.moved = true;
    setPanning(true);
    setZoom(clamp({ ...p.from, x: p.from.x + dx, y: p.from.y + dy }));
  };
  const onStageUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    setPanning(false);
    if (carry) {
      if (carry.over) dropIn(carry.over);
      setCarry(null);
      return;
    }
    if (!p || p.moved || !stage) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width / 2;
    const py = e.clientY - rect.top - rect.height / 2;
    // A click beside the picture leaves, like the cross; on it, it zooms.
    if (!zoomed && (Math.abs(px - slide / 2) > box.width / 2 || Math.abs(py - shift / 2) > box.height / 2)) return leave();
    if (e.altKey) stepZoom(-1, px, py);
    else if (atMax) zoomTo(1);
    else stepZoom(1, px, py);
  };

  // Scrolling or swiping moves around a zoomed picture.
  useEffect(() => {
    if (!stage || !zoomed) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp({ ...z, x: z.x - e.deltaX, y: z.y - e.deltaY }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stage, zoomed, clamp]);

  // Small pinned previews fill a column down the left, then a second one beside it.
  const pinRows = Math.max(1, Math.floor((space.height + PIN_GAP) / (PIN_H + PIN_GAP)));
  const pinColumns = Math.min(PIN_COLUMNS, Math.ceil(pinned.length / pinRows));
  const pinsWidth = pinSize === "small" && pinColumns ? 16 + pinColumns * (PIN_W + PIN_GAP) : 0;
  const isPinned = pinned.some((p) => p.path === actOn.path);
  // Larger ones stop when the next picture, assumed shaped like this one, would get too small.
  // Larger ones never run out: a full page is followed by another.
  const pinsFull = !isPinned && pinSize === "small" && pinned.length >= pinRows * PIN_COLUMNS;
  const togglePin = useCallback(() => {
    if (pinned.some((p) => p.path === actOn.path)) onPinnedChange(pinned.filter((p) => p.path !== actOn.path));
    else if (!pinsFull) onPinnedChange([...pinned, actOn]);
  }, [pinned, actOn, pinsFull, onPinnedChange]);
  const openPinned = (p: ImageEntry) => {
    // The click that ends a drag doesn't open the image.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const i = images.findIndex((img) => img.path === p.path);
    if (i < 0) return;
    if (layout) setSolo(index);
    onIndexChange(i);
  };
  const backToSeries = useCallback(() => {
    if (solo === null) return;
    if (solo < images.length) onIndexChange(solo);
    setSolo(null);
  }, [solo, images.length, onIndexChange]);
  // Leaving by a click beside the picture, as with Escape: from a picture shown on its own back to the
  // arrangement, otherwise out of the viewer.
  // Not while a heading is written, which would be lost.
  const leave = () => {
    if (draft) return;
    if (solo !== null) backToSeries();
    else onClose();
  };
  // Nothing left to arrange, nothing to go back to.
  useEffect(() => {
    if (pinned.length === 0 || pinSize === "small") setSolo(null);
  }, [pinned.length, pinSize]);

  // A pinned image dragged onto another takes its place; the others make room as it passes.
  const [dragging, setDragging] = useState<string | null>(null);
  const dragged = useRef(false);
  const latestPinned = useRef(pinned);
  latestPinned.current = pinned;
  const startPinDrag = (path: string, e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-unpin], [data-aim]")) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let lastOver: string | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = true;
      setDragging(path);
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-pin]")?.getAttribute("data-pin");
      if (!over || over === lastOver) return;
      lastOver = over;
      if (over === path) return;
      const list = latestPinned.current;
      const from = list.findIndex((p) => p.path === path);
      const to = list.findIndex((p) => p.path === over);
      if (from < 0 || to < 0) return;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      onPinnedChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragged.current = moved;
      // Forget it once the click that may follow has passed, so a drag ending elsewhere doesn't swallow the next click.
      setTimeout(() => (dragged.current = false), 0);
      setDragging(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const unpin = (p: ImageEntry) => onPinnedChange(pinned.filter((q) => q.path !== p.path));

  const favorite = isFavorite(actOn);

  // Writing a heading in place: it starts from the one there is, or from the style of the last one written.
  const startWriting = () => {
    setZoom(WHOLE);
    setSolo(null);
    if (look.captionPlace === "off") updateLook({ captionPlace: "above" });
    setDraft(headingOf(image) ?? { text: "", level: 3, ...lastStyle() });
  };
  const saveDraft = (next: Heading | null = draft) => {
    const text = next?.text.trim();
    if (next && text) rememberStyle(next);
    onHeadingChange?.(index, next && text ? { ...next, text } : undefined);
    setDraft(null);
  };
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      // While a heading is written, keys are for the text; Escape leaves it as it was.
      if (draft) {
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(null);
        }
        return;
      }
      // Typing a series name must not trash or step.
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = Number(e.key);
      if (e.key === "Escape") {
        if (zoomed) setZoom(WHOLE);
        else if (solo !== null) backToSeries();
        else onClose();
      } else if (e.key === "+" || e.key === "=") stepZoom(1);
      else if (e.key === "-") stepZoom(-1);
      else if (e.key === "0") setZoom(WHOLE);
      else if (e.key === "p") togglePin();
      else if (e.key === "h") updateLook({ screen: nextScreenFit(look.screen) });
      else if (e.key === "c") pinCollections(!look.collections);
      else if (Number.isInteger(digit) && digit >= 1 && digit <= series.length)
        onToggleSeries(series[digit - 1].id, actIndex);
      else if (e.key === "s") setPicking((p) => !p);
      else if (e.key === "PageUp" && page > 0) goToPage(page - 1);
      else if (e.key === "PageDown" && page < pages.length - 1) goToPage(page + 1);
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      else if (e.key === "Delete" || e.key === "Backspace") onTrash(actIndex);
      else if (e.key === "f") onToggleFavorite(actIndex);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    draft,
    paused,
    index,
    actIndex,
    hasPrev,
    hasNext,
    onClose,
    onIndexChange,
    onTrash,
    onToggleFavorite,
    series,
    onToggleSeries,
    zoomed,
    stepZoom,
    togglePin,
    look.screen,
    look.collections,
    updateLook,
    page,
    pages.length,
    goToPage,
    solo,
    backToSeries,
  ]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden outline-none"
      // The page's colors when chosen; otherwise black, with light text and a light frame line.
      style={
        look.background
          ? ({ background: "var(--canvas)", color: "var(--foreground)", "--viewer-bg": "var(--canvas)" } as React.CSSProperties)
          : ({
              background: "#000",
              color: "#fafafa",
              "--foreground": "#fafafa",
              "--viewer-bg": "#000",
            } as React.CSSProperties)
      }
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onPointerMove={wide ? wake : undefined}
    >
      <div
        className={cn(
          "flex h-12 shrink-0 items-center gap-3 px-3",
          wide && "absolute inset-x-0 top-0 z-30 transition-opacity duration-300",
          wide && !chrome && "opacity-0 focus-within:opacity-100 hover:opacity-100",
        )}
        style={
          wide
            ? {
                background: look.background
                  ? "color-mix(in oklab, var(--canvas) 85%, transparent)"
                  : "linear-gradient(rgb(0 0 0 / 0.6), transparent)",
              }
            : undefined
        }
      >
        {/* Keeps the name centered across from the buttons on the right. */}
        <span className="w-[120px] shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">{image.name}</div>
          <div className="text-xs text-current/60">
            {index + 1} av {images.length} · {image.width} × {image.height} · {formatBytes(image.size)}
            {tagsOf(image).map((t) => (
              <span key={t.key} className="ml-1.5 rounded-sm bg-current/15 px-1.5 py-px">
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <ViewerLookMenu settings={look} onChange={updateLook} />
        <HeaderButton onClick={onShowShortcuts} title="Kortkommandon (?)" label="Kortkommandon">
          <Info />
        </HeaderButton>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-current hover:bg-current/15 hover:text-current"
          onClick={onClose}
          title="Stäng (Esc)"
          aria-label="Stäng"
        >
          <X />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {/* Folded in to icons beside the picture; opens over it while the mouse is on it or the picture is
            carried there, and stays open beside it when pinned. Over a picture that fills the screen it
            takes no room of its own. */}
        <div
          className={cn(
            "z-30 shrink-0",
            look.collections ? "relative w-56" : wide ? "absolute inset-y-0 left-0 w-12" : "relative w-12",
          )}
          onPointerEnter={() => !railHeld.current && setRailOpen(true)}
          onPointerLeave={() => {
            railHeld.current = false;
            setRailOpen(false);
          }}
        >
          <CollectionsPanel
            series={series}
            favorite={favorite}
            inSeries={inSeries}
            onToggleFavorite={() => onToggleFavorite(actIndex)}
            onToggleSeries={(id) => onToggleSeries(id, actIndex)}
            over={carry?.over ?? null}
            added={added}
            compact={!look.collections && !railOpen && !carry}
            pinned={look.collections}
            onPinnedChange={pinCollections}
            className={cn("absolute bottom-0 left-0", wide ? "top-12" : "top-0", !look.collections && (railOpen || carry) && "shadow-xl")}
            style={{
              background:
                look.collections && !wide
                  ? undefined
                  : look.background
                    ? "color-mix(in oklab, var(--canvas) 94%, transparent)"
                    : "rgb(0 0 0 / 0.88)",
            }}
          />
        </div>
        <div
          ref={setArea}
          className={cn("relative flex min-w-0 flex-1 items-center justify-center", !wide && "px-14 pb-6")}
          style={{
            paddingLeft: pinsWidth && !wide ? pinsWidth + 48 : undefined,
            // While a heading is written the bar of tools stays below, so the picture keeps clear of it.
            paddingBottom: draft ? DOCK_ROOM : undefined,
          }}
          // A click on the empty space around the picture leaves, like the cross. Beside pinned pictures the
          // stage hugs the picture, so a click beside them all lands on one of these.
          onClick={(e) => {
            const el = e.target as HTMLElement;
            if (el === e.currentTarget || el === content || el.dataset.pinsBox !== undefined) leave();
          }}
        >
          {solo !== null && (
            <button
              onClick={backToSeries}
              title="Tillbaka till de fästa bilderna (Esc)"
              className="absolute top-3 left-3 z-20 flex h-9 items-center gap-2 rounded-full bg-black/35 px-3.5 text-sm text-white hover:bg-black/55 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <LayoutDashboard className="size-4" />
              Visa serien
            </button>
          )}
          {pinSize === "small" && pinned.length > 0 && (
            <div
              className="absolute top-0 left-4 flex flex-col flex-wrap content-start"
              style={{
                gap: PIN_GAP,
                height: pinRows * (PIN_H + PIN_GAP) - PIN_GAP,
              }}
              aria-label="Fästa bilder"
            >
              {pinned.map((p) => (
                <PinnedPreview
                  key={p.path}
                  image={p}
                  current={p.path === image.path}
                  dragging={dragging === p.path}
                  onDragStart={(e) => startPinDrag(p.path, e)}
                  onOpen={() => openPinned(p)}
                  onUnpin={() => unpin(p)}
                />
              ))}
            </div>
          )}
          <div ref={setContent} className="flex size-full min-w-0 items-center justify-center">
            <div
              className={layout ? "relative shrink-0" : "contents"}
              style={layout ? { width: layout.width, height: layout.height } : undefined}
              aria-label={layout ? "Fästa bilder och bilden som visas" : undefined}
              data-pins-box
            >
              {layout?.pins.map((rect, i) => (
                <PinnedPicture
                  key={beside[i].path}
                  image={beside[i]}
                  rect={rect}
                  frame={frame}
                  shadow={shadow}
                  rounded={look.rounded}
                  heading={captionOf(beside[i])}
                  place={look.captionPlace}
                  align={look.captionAlign}
                  size={look.captionSize}
                  dragging={dragging === beside[i].path}
                  onDragStart={(e) => startPinDrag(beside[i].path, e)}
                  onOpen={() => openPinned(beside[i])}
                  onUnpin={() => unpin(beside[i])}
                  aimed={aimedIndex >= 0 && beside[i].path === aimedAt}
                  onAim={
                    images.some((img) => img.path === beside[i].path) ? () => setAimedAt(beside[i].path) : undefined
                  }
                />
              ))}
              <div
                ref={setStage}
                className={cn(
                  "group/stage flex touch-none items-center justify-center overflow-hidden",
                  layout || zoomed ? "absolute" : "relative size-full",
                  zoomed && "z-10",
                )}
                style={{
                  // Marks the picture the bar of buttons acts on, among several.
                  ...(beside.length > 0 && aimedIndex < 0 && !zoomed && { outline: AIMED_OUTLINE, outlineOffset: 6 }),
                  ...(layout && {
                    left: layout.current.x + (layout.current.width - box.width - aside) / 2,
                    top: layout.current.y + (layout.current.height - box.height - lift) / 2,
                    ...view,
                    transition: SLOT_TRANSITION,
                  }),
                  // Zoomed, it covers the whole area below the header, pinned pictures included.
                  ...(zoomed && {
                    left: layout ? -areaOffset.x : 0,
                    top: layout ? -areaOffset.y : 0,
                    ...zoomView,
                    background: look.background ? "var(--canvas)" : "#000",
                  }),
                  cursor: panning || carry ? "grabbing" : atMax ? "zoom-out" : "zoom-in",
                }}
                onPointerDown={onStageDown}
                onPointerMove={onStageMove}
                onPointerUp={onStageUp}
                onPointerCancel={() => {
                  press.current = null;
                  setPanning(false);
                  setCarry(null);
                }}
              >
                {layers.map((layer, i) => (
                  <LayerView
                    key={layer.id}
                    layer={
                      original?.path === layer.path && i === layers.length - 1 ? { ...layer, src: original.src } : layer
                    }
                    box={fit(pictureRoom, layer.width, layer.height, pictureFrame, fitMode)}
                    lift={shift}
                    slide={slide}
                    frame={pictureFrame}
                    shadow={shadow}
                    rounded={look.rounded}
                    animate={i > 0}
                    exit={i < layers.length - 1 ? top : undefined}
                    zoom={i === layers.length - 1 && layer.path === image.path ? zoom : WHOLE}
                    panning={panning}
                    waitingSince={waiting?.path === layer.path ? waiting.since : undefined}
                    aiMark={showAiMark ? aiOf.get(layer.path) : undefined}
                  />
                ))}
                {/* Sized to the picture, so the heart sits on its corner whatever its shape. Hidden while zoomed. */}
                <div
                  className={cn(
                    "pointer-events-none relative shrink-0 transition-opacity",
                    zoomed ? "opacity-0" : "*:pointer-events-auto",
                  )}
                  style={{
                    ...shown,
                    transform: shift || slide ? `translate(${slide / 2}px, ${shift / 2}px)` : undefined,
                  }}
                >
                  {!draft && beside.length > 0 && aimedIndex >= 0 && (
                    <AimButton name={image.name} onAim={() => setAimedAt(null)} className="group-hover/stage:opacity-100" />
                  )}
                  {draft ? (
                    <HeadingInPlace
                      heading={draft}
                      place={look.captionPlace}
                      align={align}
                      aside={aside}
                      height={heading && besidePicture(look.captionPlace) ? fitLine(heading, captionHeight, shown.width) : captionHeight}
                      inset={framePad(pictureFrame, box.picture.width, box.picture.height) + 16}
                      width={shown.width}
                      onChange={(text) => setDraft({ ...draft, text })}
                      onDone={() => saveDraft()}
                    />
                  ) : (
                    heading && (
                      <Caption
                        key={image.path}
                        heading={heading}
                        place={look.captionPlace}
                        align={align}
                        aside={aside}
                        height={captionHeight}
                        inset={framePad(pictureFrame, box.picture.width, box.picture.height) + 16}
                        width={shown.width}
                        effect={look.captionEffect}
                        animate
                        onEdit={onHeadingChange ? startWriting : undefined}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Stepping on while writing would leave the heading half done. */}
          {!draft && (
            <>
              <NavButton
                side="left"
                disabled={!hasPrev}
                onClick={() => onIndexChange(index - 1)}
                style={pinsWidth ? { left: pinsWidth + 4 } : undefined}
              />
              <NavButton side="right" disabled={!hasNext} onClick={() => onIndexChange(index + 1)} />
            </>
          )}
          <Dock pinned={look.dockPinned || !!draft} themed={look.background}>
            {draft ? (
              <HeadingTools
                heading={draft}
                place={look.captionPlace}
                align={look.captionAlign ?? "left"}
                themed={look.background}
                onChange={(change) => setDraft({ ...draft, ...change })}
                onPlace={(captionPlace) => updateLook({ captionPlace })}
                onAlign={(captionAlign) => updateLook({ captionAlign })}
                onSave={() => saveDraft()}
                onRemove={() => saveDraft(null)}
                onCancel={() => setDraft(null)}
                canRemove={!!headingOf(image)}
              />
            ) : (
            <>
            {/* Set apart at the start, so it isn't clicked by mistake for something else. */}
            <DockButton onClick={() => onTrash(actIndex)} title="Flytta till papperskorgen (⌫)" label="Flytta till papperskorgen" danger>
              <Trash2 />
            </DockButton>
            <DockDivider />
            {onUpscale && (
              <DockButton
                onClick={() => onUpscale(actIndex)}
                disabled={upscaling}
                title={upscaling ? "Förstorar med AI…" : "Förstora med AI: sparar en större kopia bredvid originalet"}
                label="Förstora med AI"
              >
                {upscaling ? <Loader2 className="animate-spin" /> : <WandSparkles />}
              </DockButton>
            )}
            {onReveal && (
              <DockButton onClick={() => onReveal(actIndex)} title="Visa i Finder" label="Visa i Finder">
                <FolderSearch />
              </DockButton>
            )}
            {onHeadingChange && (
              <DockButton
                onClick={startWriting}
                title="Skriv en rubrik direkt vid bilden"
                label={headingOf(image) ? "Ändra rubriken" : "Skriv en rubrik"}
              >
                <PencilLine />
              </DockButton>
            )}
            <SeriesPicker
              path={actOn.path}
              series={series}
              open={picking}
              onOpenChange={setPicking}
              onToggle={(id) => onToggleSeries(id, actIndex)}
              onCreate={(name) => onCreateSeries(name, actIndex)}
              defaultName={newSeriesName}
            />
            {onRemove && (
              <DockButton onClick={() => onRemove(actIndex)} title="Ta bort ur serien (filen finns kvar)" label="Ta bort ur serien">
                <CircleMinus />
              </DockButton>
            )}
            {pageCount > 1 && !zoomed && (
              <>
                <DockDivider />
                <nav aria-label="Sidor" className="flex items-center gap-0.5 text-xs">
                  <DockButton
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 0}
                    title="Föregående sida (Page Up)"
                    label="Föregående sida"
                  >
                    <ChevronLeft />
                  </DockButton>
                  <span className="px-1 tabular-nums">
                    Sida {page + 1} av {pageCount}
                  </span>
                  <DockButton
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= pages.length - 1}
                    title="Nästa sida (Page Down)"
                    label="Nästa sida"
                  >
                    <ChevronRight />
                  </DockButton>
                </nav>
              </>
            )}
            {pinned.length > 0 && (
              <SavePinnedMenu
                count={pinned.length}
                defaultName={defaultPinnedName}
                onSave={({ name, look: keepLook, appearance }: SavePinnedChoice) =>
                  onSavePinned(name, keepLook ? look : undefined, appearance)
                }
              />
            )}
            <DockDivider />
            {onShowAiMarkChange && (
              <DockButton
                onClick={() => onShowAiMarkChange(!showAiMark)}
                pressed={showAiMark}
                title={
                  showAiMark
                    ? "Dölj AI-märkningen"
                    : "Visa AI-märkning: ett märke i hörnet på bilder som är gjorda eller förstorade med AI"
                }
                label="Visa AI-märkning"
              >
                <BadgeInfo />
              </DockButton>
            )}
            <DockDivider />
            <DockButton
              onClick={togglePin}
              disabled={pinsFull}
              pressed={isPinned}
              title={
                isPinned
                  ? "Lossa bilden (P)"
                  : pinsFull
                    ? "Det får inte plats fler fästa bilder"
                    : "Fäst bilden medan du bläddrar vidare (P)"
              }
              label={isPinned ? "Lossa bilden" : "Fäst bilden"}
            >
              <Pin className={cn(isPinned && "fill-current")} />
            </DockButton>
            <DockButton
              onClick={() => onToggleFavorite(actIndex)}
              pressed={favorite}
              title={favorite ? "Ta bort från favoriter (F)" : "Lägg till i favoriter (F)"}
              label={favorite ? "Ta bort från favoriter" : "Lägg till i favoriter"}
            >
              <Heart className={cn(favorite && "fill-current")} />
            </DockButton>
            <DockDivider />
            <DockButton
              onClick={() => updateLook({ dockPinned: !look.dockPinned })}
              pressed={look.dockPinned}
              title={look.dockPinned ? "Göm knappraden tills musen kommer nära" : "Visa knappraden hela tiden"}
              label={look.dockPinned ? "Göm knappraden" : "Visa knappraden hela tiden"}
            >
              {look.dockPinned ? <PanelBottomClose /> : <PanelBottomOpen />}
            </DockButton>
            </>
            )}
          </Dock>
        </div>
      </div>
      {carry && (
        <img
          src={top.src}
          alt=""
          className="pointer-events-none fixed z-50 max-h-24 max-w-24 rounded-md opacity-80 shadow-xl"
          style={{ left: carry.x + 8, top: carry.y + 8 }}
        />
      )}
    </div>
  );
}

/**
 * The floating bar at the bottom of the picture with everything that can be done with it.
 * Half see-through, in the page's colors when chosen. Unless pinned, it stays hidden until
 * the mouse comes near the bottom edge, so the picture is left alone.
 */
function Dock({ pinned, themed, children }: { pinned: boolean; themed: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        // Hidden, the bar still needs room around it to notice the mouse in, kept to the bar's
        // width so clicks on the rest of the picture still reach it.
        "group/dock absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 justify-center px-24 pt-20 pb-8",
      )}
    >
      <div
        role="toolbar"
        aria-label="Åtgärder för bilden"
        className={cn(
          // Shown while a button in it is reached with the keyboard, not after a mouse click.
          "pointer-events-auto flex items-center gap-1 rounded-3xl border border-current/10 p-1.5 shadow-lg backdrop-blur-sm transition-opacity duration-300 has-focus-visible:opacity-100",
          !pinned && "opacity-0 group-hover/dock:opacity-100",
          !themed && "text-white",
        )}
        style={{
          background: themed ? "color-mix(in oklab, var(--canvas) 45%, transparent)" : "rgb(0 0 0 / 0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DockDivider() {
  return <span className="mx-1 h-7 w-px bg-current/20" aria-hidden />;
}

function DockButton({
  onClick,
  title,
  label,
  pressed,
  disabled,
  danger,
  wide,
  children,
}: {
  onClick: () => void;
  title: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Room for words beside the icon. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      aria-label={label}
      className={cn(
        "h-11 rounded-2xl text-current/85 hover:bg-current/15 hover:text-current [&_svg:not([class*='size-'])]:size-5",
        wide ? "gap-1.5 px-3 text-sm" : "w-11 px-0",
        pressed && "bg-current/20 text-current",
        danger && "hover:bg-destructive hover:text-white",
      )}
    >
      {children}
    </Button>
  );
}

/** A button in the bar at the top of the full screen view. */
function HeaderButton({
  onClick,
  title,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  title: string;
  label: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      aria-label={label}
      className={cn("text-current/80 hover:bg-current/15 hover:text-current", pressed && "bg-current/15 text-current")}
    >
      {children}
    </Button>
  );
}

interface NavButtonProps {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

function NavButton({ side, disabled, onClick, style }: NavButtonProps) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const label = side === "left" ? "Föregående bild (←)" : "Nästa bild (→)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={label}
      aria-label={label}
      className={`absolute top-1/2 z-20 ${side === "left" ? "left-2" : "right-2"} flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
    >
      <Icon className="size-6" />
    </button>
  );
}

interface LayerViewProps {
  layer: Layer;
  box: ReturnType<typeof fit>;
  frame: Frame;
  shadow: Shadow;
  rounded: boolean;
  /** Room kept free above the picture for its heading. */
  lift: number;
  /** Room kept free to the left of the picture for its heading (to the right when negative). */
  slide: number;
  /** Plays the layer's effect when added on top. */
  animate: boolean;
  /** The layer that now covers this one, whose effect decides how this one goes. */
  exit?: Layer;
  zoom: Zoom;
  /** Follows the pointer without easing while the picture is dragged. */
  panning: boolean;
  /** When an enlarged copy of this picture began to be made, while it is on its way. */
  waitingSince?: number;
  /** Shown in the picture's top right corner: made or enlarged with AI. */
  aiMark?: NonNullable<ImageEntry["ai"]>;
}

/** One picture with its frame, centered on the stage, coming in or going out. */
function LayerView({
  layer,
  box,
  frame,
  shadow,
  rounded,
  lift,
  slide,
  animate,
  exit,
  zoom,
  panning,
  waitingSince,
  aiMark,
}: LayerViewProps) {
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    // Paint the starting position first, then move to rest.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  const framing = frameStyle(frame, box.picture.width, box.picture.height);
  const radius = corners(rounded, framing, box.width, box.height);
  const motion = exit
    ? {
        ...exitStyle(exit.effect, exit.dir),
        transition: transitionFor(exit.effect),
      }
    : entered
      ? {
          opacity: 1,
          transform: "none",
          transition: transitionFor(layer.effect),
        }
      : { ...enterStyle(layer.effect, layer.dir), transition: "none" };
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% - ${(box.width - slide) / 2}px)`,
        top: `calc(50% - ${(box.height - lift) / 2}px)`,
        width: box.width,
        height: box.height,
        transform: zoom.scale === 1 ? undefined : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
        transition: panning ? "none" : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        className="relative size-full"
        style={{
          ...framing,
          borderRadius: radius.outer,
          boxShadow: shadow === "drop" ? DROP_SHADOW : undefined,
          ...motion,
        }}
      >
        <img
          src={layer.src}
          alt={layer.alt}
          draggable={false}
          className="block size-full object-contain"
          style={{ borderRadius: radius.inner }}
        />
        {shadow === "inset" && (
          <div
            className="absolute"
            style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW, borderRadius: radius.inner }}
            aria-hidden
          />
        )}
        {waitingSince !== undefined && (
          <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius.outer }}>
            <WaitingRing since={waitingSince} />
          </div>
        )}
        {aiMark && zoom.scale === 1 && (
          <span
            className="absolute top-2.5 right-2.5 flex h-7 items-center gap-1.5 rounded-md bg-black/55 px-2 text-xs font-medium text-white backdrop-blur-sm"
            style={{ marginTop: framing.padding, marginRight: framing.padding }}
            title={aiMarkTitle(aiMark)}
          >
            <AiMark kind={aiMark} className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

interface PinnedPreviewProps {
  image: ImageEntry;
  current: boolean;
  dragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onOpen: () => void;
  onUnpin: () => void;
}

/** A small pinned image; a click shows it in full again. */
function PinnedPreview({ image, current, dragging, onDragStart, onOpen, onUnpin }: PinnedPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, GRID_THUMB_SIZE, setSrc), [image]);
  return (
    <div
      data-pin={image.path}
      onPointerDown={onDragStart}
      className={cn("group relative shrink-0 touch-none", dragging && "cursor-grabbing opacity-50")}
      style={{ width: PIN_W, height: PIN_H }}
    >
      <button
        onClick={(e) => {
          // Keep the ring for the image shown, not the one last clicked.
          e.currentTarget.blur();
          onOpen();
        }}
        title={`${image.name}\nVisa i helskärm`}
        aria-label={`Visa ${image.name}`}
        aria-current={current || undefined}
        className={cn(
          "flex size-full items-center justify-center rounded-md bg-current/10 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
          current && "ring-2 ring-current",
        )}
      >
        {src && <img src={src} alt="" draggable={false} className="max-h-full max-w-full rounded-sm object-contain" />}
      </button>
      <button
        data-unpin
        onClick={onUnpin}
        title="Lossa från hörnet"
        aria-label={`Lossa ${image.name} från hörnet`}
        className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

interface PinnedPictureProps {
  image: ImageEntry;
  /** The slot the layout gave it; the picture keeps its shape, centered inside. */
  rect: Rect;
  frame: Frame;
  shadow: Shadow;
  rounded: boolean;
  heading?: Heading;
  place: CaptionPlace;
  align: CaptionAlign | undefined;
  size: CaptionSize;
  dragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onOpen: () => void;
  onUnpin: () => void;
  /** The bar of buttons acts on it. */
  aimed: boolean;
  /** Points the bar of buttons at it; left out when it can't be, being outside what is browsed. */
  onAim?: () => void;
}

const AIMED_OUTLINE = "2px solid color-mix(in oklab, currentColor 70%, transparent)";

/** Shown on hover over a picture among several: points the bar of buttons at it. */
function AimButton({ name, onAim, className }: { name: string; onAim: () => void; className?: string }) {
  return (
    <button
      data-aim
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        onAim();
      }}
      title="Använd knappraden för den här bilden"
      aria-label={`Använd knappraden för ${name}`}
      className={cn(
        "absolute top-2 left-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        className,
      )}
    >
      <RectangleEllipsis className="size-4" />
    </button>
  );
}

/** A pinned picture shown large beside the current one; a click shows it on its own again. */
function PinnedPicture({
  image,
  rect,
  frame,
  shadow,
  rounded,
  heading,
  place,
  align,
  size,
  dragging,
  onDragStart,
  onOpen,
  onUnpin,
  aimed,
  onAim,
}: PinnedPictureProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => requestThumbnail(image, VIEWER_THUMB_SIZE, setSrc), [image]);
  // Headings shrink with smaller pictures, but stay readable.
  const captionHeight = heading
    ? Math.max(18, Math.round(captionLineHeight(heading.level, size, rect.height) * Math.min(1, rect.height / 600)))
    : 0;
  const lift = heading && besidePicture(place) ? captionHeight : 0;
  const shift = place === "below" ? -lift : lift;
  const aside = heading && asidePicture(place) ? asideWidth(rect.width) : 0;
  const slide = place === "right" ? -aside : aside;
  const box = fit(
    { width: Math.max(0, rect.width - aside), height: Math.max(0, rect.height - lift) },
    image.width,
    image.height,
    frame,
  );
  const framing = frameStyle(frame, box.picture.width, box.picture.height);
  const radius = corners(rounded, framing, box.width, box.height);
  return (
    <div
      data-pin={image.path}
      onPointerDown={onDragStart}
      className={cn("group absolute touch-none", dragging && "z-10 cursor-grabbing opacity-60")}
      style={{
        left: rect.x + (rect.width - box.width + slide) / 2,
        top: rect.y + (rect.height - box.height + shift) / 2,
        width: box.width,
        height: box.height,
        transition: SLOT_TRANSITION,
        ...(aimed && { outline: AIMED_OUTLINE, outlineOffset: 6 }),
      }}
    >
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          onOpen();
        }}
        title={`${image.name}\nVisa i stort`}
        aria-label={`Visa ${image.name}`}
        className="block size-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        style={{ ...framing, borderRadius: radius.outer, boxShadow: shadow === "drop" ? DROP_SHADOW : undefined }}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            className="block size-full object-contain"
            style={{ borderRadius: radius.inner }}
          />
        )}
      </button>
      {shadow === "inset" && (
        <div
          className="pointer-events-none absolute"
          style={{ inset: framing.padding ?? 0, boxShadow: INSET_SHADOW, borderRadius: radius.inner }}
          aria-hidden
        />
      )}
      {heading && (
        <Caption
          heading={heading}
          place={place}
          align={captionAlignAt(place, align)}
          aside={aside}
          height={captionHeight}
          inset={framePad(frame, box.picture.width, box.picture.height) + Math.round(captionHeight / 3)}
          width={box.width}
          effect="none"
          animate={false}
        />
      )}
      {onAim && !aimed && <AimButton name={image.name} onAim={onAim} className="group-hover:opacity-100" />}
      <button
        data-unpin
        onClick={onUnpin}
        title="Lossa bilden"
        aria-label={`Lossa ${image.name}`}
        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

interface CaptionProps {
  heading: Heading;
  place: CaptionPlace;
  align: CaptionAlign;
  /** Width of the column it takes to the picture's side, gap included. */
  aside: number;
  height: number;
  /** Distance from the picture's edges when the heading sits on it. */
  inset: number;
  /** Width of the picture; a heading above it shrinks to fit rather than being cut. */
  width: number;
  effect: ViewerTransition;
  /** Comes in with the effect a moment after its picture. */
  animate: boolean;
  /** A click on it writes it again in place. */
  onEdit?: () => void;
}

/** Above or under the picture, taking a line of its own, rather than on it. */
function besidePicture(place: CaptionPlace) {
  return place === "above" || place === "below";
}

/** To the left or right of the picture, in a column of its own. */
function asidePicture(place: CaptionPlace) {
  return place === "left" || place === "right";
}

/** Space between a heading to the side and its picture. */
const ASIDE_GAP = 24;

/** Width of the column a heading to the side takes, gap included, out of `room`. */
function asideWidth(room: number) {
  return Math.round(Math.min(360, Math.max(140, room * 0.24)));
}

/** On the picture rather than around it. */
function onPicture(place: CaptionPlace) {
  return !besidePicture(place) && !asidePicture(place);
}

/**
 * Where a heading goes around or on the picture: `inset` in from the edges when on it, in a column
 * `aside` wide (gap included) when to its side.
 */
function captionPosition(place: CaptionPlace, inset: number, aside: number): React.CSSProperties {
  if (place === "above") return { left: 0, right: 0, bottom: "100%" };
  if (place === "below") return { left: 0, right: 0, top: "100%" };
  if (place === "left") return { top: 0, right: `calc(100% + ${ASIDE_GAP}px)`, width: aside - ASIDE_GAP };
  if (place === "right") return { top: 0, left: `calc(100% + ${ASIDE_GAP}px)`, width: aside - ASIDE_GAP };
  if (place === "top" || place === "bottom") return { [place]: inset, left: inset, right: inset };
  return {
    [place.startsWith("top") ? "top" : "bottom"]: inset,
    [place.endsWith("right") ? "right" : "left"]: inset,
    maxWidth: `calc(100% - ${inset * 2}px)`,
  };
}

/** On the picture, light letters with a soft shadow, so they read on any part of it. */
/** Room kept free below the picture for the bar of tools while a heading is written. */
const DOCK_ROOM = 96;

const ON_PICTURE_TEXT: React.CSSProperties = {
  textShadow: "0 1px 3px rgb(0 0 0 / 0.6), 0 0 18px rgb(0 0 0 / 0.35)",
};

let measure: CanvasRenderingContext2D | null = null;

/** The largest line height, up to `height`, at which the heading fits in `width` on one line. */
function fitLine(heading: Heading, height: number, width: number): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return height;
  const weight = heading.level === 3 ? 500 : 600;
  const family = heading.font ? `"${heading.font}", system-ui, sans-serif` : "system-ui, sans-serif";
  measure.font = `${weight} 100px ${family}`;
  // Text width grows with its size, so one measurement at 100px gives the size that fits.
  const per100 = measure.measureText(heading.text).width;
  if (per100 <= 0) return height;
  const fits = Math.floor(((width * 0.98) / per100) * (100 / 0.62));
  return Math.max(18, Math.min(height, fits));
}

/** An image's heading in full screen, above the picture or in one of its corners. */
function Caption({ heading, place, align, aside, height, inset, width, effect, animate, onEdit }: CaptionProps) {
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntered(true), 180);
    return () => clearTimeout(timer);
  }, [animate]);
  const motion: React.CSSProperties = entered
    ? { opacity: 1, transform: "none", transition: transitionFor(resolveTransition(effect, 0)) }
    : { ...enterStyle(resolveTransition(effect, 0), 1), transition: "none" };
  const over = onPicture(place);
  const side = asidePicture(place);
  const line = besidePicture(place) ? fitLine(heading, height, width) : height;
  // A long heading wraps instead of being cut: up to three lines on the picture, as many as it needs beside it.
  const wrap: React.CSSProperties = {
    height: "auto",
    lineHeight: 1.1,
    whiteSpace: "normal",
    overflowWrap: "break-word",
    ...(over && { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }),
  };
  return (
    <div
      className={cn("absolute", onEdit ? "pointer-events-auto" : "pointer-events-none")}
      style={{ ...captionPosition(place, inset, aside), textAlign: align, ...motion }}
    >
      <HeadingText
        heading={heading}
        height={line}
        scale={0.62}
        onEdit={onEdit}
        style={
          over
            ? { color: heading.color ?? "#fff", ...ON_PICTURE_TEXT, ...wrap }
            : side
              ? wrap
              : undefined
        }
      />
    </div>
  );
}

interface HeadingInPlaceProps {
  heading: Heading;
  place: CaptionPlace;
  align: CaptionAlign;
  /** Width of the column it takes to the picture's side, gap included. */
  aside: number;
  /** Line height the heading gets there. */
  height: number;
  inset: number;
  width: number;
  onChange: (text: string) => void;
  onDone: () => void;
}

/**
 * A heading typed right where it will show, inside a dashed outline of the room it takes. On the
 * picture the outline grows with the text up to the picture's margin, then the text wraps as it will show.
 */
function HeadingInPlace({ heading, place, align, aside, height, inset, width, onChange, onDone }: HeadingInPlaceProps) {
  const over = onPicture(place);
  // On the picture and beside it, the text wraps onto lines as it will show.
  const wraps = !besidePicture(place);
  const fontSize = height * 0.62;
  const fontWeight = heading.level === 3 ? 500 : 600;
  const fontFamily = heading.font ? `"${heading.font}", system-ui, sans-serif` : "system-ui, sans-serif";
  const most = Math.max(0, width - inset * 2);
  let room = most;
  if (over) {
    measure ??= document.createElement("canvas").getContext("2d");
    if (measure) {
      measure.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      // Padding, outline and a letter's room for the caret.
      const text = measure.measureText(heading.text || "Skriv rubriken").width + 20 + fontSize * 0.6;
      room = Math.min(most, Math.max(Math.min(240, most), Math.ceil(text)));
    }
  }
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(height, el.scrollHeight)}px`;
  });
  return (
    <div className="absolute z-20" style={{ ...captionPosition(place, inset, aside), maxWidth: undefined }}>
      <textarea
        ref={field}
        autoFocus
        rows={1}
        value={heading.text}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onDone();
          }
        }}
        placeholder="Skriv rubriken"
        aria-label="Rubrik"
        className={cn(
          "block resize-none overflow-hidden rounded-md border-[1.5px] border-dashed border-current/70 bg-transparent px-2 outline-none placeholder:text-current/45 focus-visible:border-current",
          align === "center" ? "mx-auto" : align === "right" && "ml-auto",
        )}
        style={{
          width: over ? room : "100%",
          fontSize,
          fontWeight,
          color: heading.color ?? (over ? "#fff" : "var(--foreground)"),
          fontFamily: heading.font ? fontFamily : undefined,
          textAlign: align,
          // One line above or under the picture; on it or to its side, lines as tall as the heading's once it wraps.
          lineHeight: wraps ? 1.1 : `${height - 3}px`,
          paddingBlock: wraps ? (height - fontSize * 1.1) / 2 : 0,
          overflowWrap: "break-word",
          ...(over && ON_PICTURE_TEXT),
        }}
      />
    </div>
  );
}

/** The places a heading can go, laid out as they sit around and on the picture. */
const PLACE_GROUPS: { label: string; places: { place: CaptionPlace; icon: React.ReactNode }[] }[] = [
  {
    label: "Bredvid bilden",
    places: [
      { place: "above", icon: <PanelTop /> },
      { place: "below", icon: <PanelBottom /> },
      { place: "left", icon: <PanelLeft /> },
      { place: "right", icon: <PanelRight /> },
    ],
  },
  {
    label: "På bilden, uppe",
    places: [
      { place: "top-left", icon: <ArrowUpLeft /> },
      { place: "top", icon: <ArrowUp /> },
      { place: "top-right", icon: <ArrowUpRight /> },
    ],
  },
  {
    label: "På bilden, nere",
    places: [
      { place: "bottom-left", icon: <ArrowDownLeft /> },
      { place: "bottom", icon: <ArrowDown /> },
      { place: "bottom-right", icon: <ArrowDownRight /> },
    ],
  },
];

const ALIGN_TOOLS: { align: CaptionAlign; icon: React.ReactNode }[] = [
  { align: "left", icon: <AlignLeft /> },
  { align: "center", icon: <AlignCenter /> },
  { align: "right", icon: <AlignRight /> },
];

interface HeadingToolsProps {
  heading: Heading;
  place: CaptionPlace;
  align: CaptionAlign;
  themed: boolean;
  onChange: (change: Partial<Heading>) => void;
  onPlace: (place: CaptionPlace) => void;
  onAlign: (align: CaptionAlign) => void;
  onSave: () => void;
  onRemove: () => void;
  onCancel: () => void;
  /** There is a saved heading to take away. */
  canRemove: boolean;
}

/**
 * In the bar under the picture while a heading is written: where it goes, its level, color and font.
 * The buttons keep the typing in the heading rather than taking it.
 */
function HeadingTools({
  heading,
  place,
  align,
  themed,
  onChange,
  onPlace,
  onAlign,
  onSave,
  onRemove,
  onCancel,
  canRemove,
}: HeadingToolsProps) {
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => void listFonts().then(setFonts), []);
  const keep = (e: React.PointerEvent) => e.preventDefault();
  const custom = heading.color && !HEADING_COLORS.includes(heading.color);
  return (
    <div className="flex items-center gap-1" onPointerDown={(e) => e.target instanceof HTMLSelectElement || keep(e)}>
      <PlacePicker place={place} align={align} themed={themed} onPlace={onPlace} onAlign={onAlign} />
      <DockDivider />
      <div role="radiogroup" aria-label="Nivå" className="flex items-center gap-0.5">
        {([1, 2, 3] as const).map((level) => (
          <DockButton
            key={level}
            onClick={() => onChange({ level })}
            pressed={heading.level === level}
            title={`Rubriknivå ${level}`}
            label={`H${level}`}
          >
            <span className="text-sm font-semibold">H{level}</span>
          </DockButton>
        ))}
      </div>
      <DockDivider />
      <div role="radiogroup" aria-label="Färg" className="flex items-center gap-1 px-1">
        <Swatch
          selected={!heading.color}
          onClick={() => onChange({ color: undefined })}
          label="Standardfärg"
          style={{ background: "linear-gradient(135deg, #f4f4f5 50%, #18181b 50%)" }}
        />
        {HEADING_COLORS.slice(0, 6).map((c) => (
          <Swatch key={c} selected={heading.color === c} onClick={() => onChange({ color: c })} label={c} style={{ background: c }} />
        ))}
        <label
          title="Valfri färg"
          className={cn(
            "relative size-6 cursor-pointer overflow-hidden rounded-full border border-current/30",
            custom && "ring-2 ring-current ring-offset-1 ring-offset-transparent",
          )}
          style={{
            background: custom ? heading.color : "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)",
          }}
        >
          <span className="sr-only">Valfri färg</span>
          <input
            type="color"
            value={heading.color ?? "#808080"}
            onChange={(e) => onChange({ color: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <DockDivider />
      <NativeSelect
        aria-label="Typsnitt"
        title="Typsnitt"
        wrapperClassName="w-40"
        value={heading.font ?? ""}
        onChange={(e) => onChange({ font: e.target.value || undefined })}
        className="h-9 w-full rounded-xl border border-current/20 bg-transparent px-2 text-sm text-current outline-none"
      >
        <option value="">Systemets typsnitt</option>
        {heading.font && !fonts.includes(heading.font) && <option value={heading.font}>{heading.font}</option>}
        {fonts.map((f) => (
          <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
            {f}
          </option>
        ))}
      </NativeSelect>
      <DockDivider />
      {canRemove && (
        <DockButton onClick={onRemove} title="Ta bort rubriken" label="Ta bort rubriken" danger>
          <Trash2 />
        </DockButton>
      )}
      <DockButton onClick={onCancel} title="Avbryt (Esc)" label="Avbryt">
        <X />
      </DockButton>
      <DockButton onClick={onSave} title="Spara rubriken (Enter)" label="Spara rubriken" pressed>
        <Check />
      </DockButton>
    </div>
  );
}

/**
 * One button for where the heading goes, showing the place chosen. It opens, upward, the places
 * around and on the picture and how the text lines up; the menu stays put while the pointer is on it.
 */
function PlacePicker({
  place,
  align,
  themed,
  onPlace,
  onAlign,
}: {
  place: CaptionPlace;
  /** In the page's colors, as the bar it opens from. */
  themed: boolean;
  align: CaptionAlign;
  onPlace: (place: CaptionPlace) => void;
  onAlign: (align: CaptionAlign) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useCloseOnLeaveAfterChoice(root, open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  // Lining up only means something where the heading has the width to itself.
  const alignable = besidePicture(place) || asidePicture(place);
  return (
    <div ref={root} className="relative">
      <DockButton
        onClick={() => setOpen(!open)}
        pressed={open}
        title={`Var rubriken står: ${CAPTION_PLACE_LABELS[place]}`}
        label="Var rubriken står"
      >
        <LayoutGridCircles />
      </DockButton>
      {open && (
        <div
          role="menu"
          aria-label="Var rubriken står"
          className="absolute bottom-full left-0 mb-3 flex flex-col gap-2 rounded-2xl border border-current/10 p-2 shadow-lg backdrop-blur-md"
          style={{ background: themed ? "color-mix(in oklab, var(--canvas) 88%, transparent)" : "rgb(24 24 24 / 0.9)" }}
        >
          {PLACE_GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-1">
              <span className="px-1 text-xs whitespace-nowrap text-current/60">{group.label}</span>
              <div className="flex gap-0.5">
                {group.places.map(({ place: p, icon }) => (
                  <DockButton
                    key={p}
                    onClick={() => onPlace(p)}
                    pressed={place === p}
                    title={CAPTION_PLACE_LABELS[p]}
                    label={CAPTION_PLACE_LABELS[p]}
                  >
                    {icon}
                  </DockButton>
                ))}
              </div>
            </div>
          ))}
          {alignable && (
            <div role="group" aria-label="Textens linje" className="flex flex-col gap-1 border-t border-current/15 pt-2">
              <span className="px-1 text-xs whitespace-nowrap text-current/60">Textens linje</span>
              <div className="flex gap-0.5">
                {ALIGN_TOOLS.map(({ align: a, icon }) => (
                  <DockButton
                    key={a}
                    onClick={() => onAlign(a)}
                    pressed={align === a}
                    title={CAPTION_ALIGN_LABELS[a]}
                    label={CAPTION_ALIGN_LABELS[a]}
                  >
                    {icon}
                  </DockButton>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Swatch({
  selected,
  onClick,
  label,
  style,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  style: React.CSSProperties;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "size-6 rounded-full border border-current/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
        selected && "ring-2 ring-current ring-offset-1 ring-offset-transparent",
      )}
      style={style}
    />
  );
}
