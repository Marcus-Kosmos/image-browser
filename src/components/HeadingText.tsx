import type { Heading } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface HeadingTextProps {
  heading: Heading;
  /** Height of the row the heading sits in; the text is sized to it. */
  height: number;
  /** Share of the row height used by the letters. */
  scale: number;
  onEdit?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** A heading in its chosen level, color and font, clickable to edit it. */
export function HeadingText({ heading, height, scale, onEdit, className, style }: HeadingTextProps) {
  const Tag = (`h${heading.level}` as "h1" | "h2" | "h3");
  return (
    <Tag
      className={cn("m-0 truncate", className)}
      style={{
        height,
        lineHeight: `${height}px`,
        fontSize: height * scale,
        fontWeight: heading.level === 3 ? 500 : 600,
        color: heading.color ?? "var(--foreground)",
        fontFamily: heading.font ? `"${heading.font}", system-ui, sans-serif` : undefined,
        ...style,
      }}
    >
      {onEdit ? (
        <button
          onClick={onEdit}
          title="Ändra rubriken"
          className="max-w-full cursor-text overflow-hidden rounded-sm text-ellipsis focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          // Wraps and lines up as the heading around it does.
          style={{ font: "inherit", color: "inherit", whiteSpace: "inherit", textAlign: "inherit" }}
        >
          {heading.text}
        </button>
      ) : (
        heading.text
      )}
    </Tag>
  );
}
