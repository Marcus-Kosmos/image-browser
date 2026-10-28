import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes for the wrapper, which takes the select's place in the layout. */
  wrapperClassName?: string;
}

/**
 * The system's own dropdown list, but drawn flat: without macOS's raised, shaded button,
 * with a chevron in the text color so it fits on any background.
 */
export function NativeSelect({ wrapperClassName, className, children, ...props }: NativeSelectProps) {
  return (
    <span className={cn("relative inline-flex min-w-0", wrapperClassName)}>
      <select {...props} className={cn("w-full appearance-none pr-7", className)}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 opacity-70"
        aria-hidden
      />
    </span>
  );
}
