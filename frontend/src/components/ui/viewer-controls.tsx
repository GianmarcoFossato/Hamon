"use client";

import * as React from "react";
import { Download, Maximize, Minus, Plus, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export type ViewerControlPosition =
  | {
      kind: "page" | "slide" | "frame";
      current: number;
      total?: number;
    }
  | {
      label: React.ReactNode;
    };

export type ViewerZoomControl = {
  scale: number | null;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit?: () => void;
  onReset?: () => void;
  fitLabel?: string;
  isDisabled?: boolean;
};

export type ViewerRotateControl = {
  onRotate: () => void;
  isDisabled?: boolean;
};

export type ViewerDownloadAction = {
  id: string;
  label: string;
  url?: string;
  onDownload?: () => void;
  isDisabled?: boolean;
};

export type ViewerControlsState = {
  position?: ViewerControlPosition | null;
  zoom?: ViewerZoomControl | null;
  rotate?: ViewerRotateControl | null;
  downloads?: ViewerDownloadAction[];
  extra?: React.ReactNode;
};

export type ViewerControlsProps = Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  position?: ViewerControlPosition | null;
  zoom?: ViewerZoomControl | null;
  rotate?: ViewerRotateControl | null;
  downloads?: ViewerDownloadAction[];
  onDownloadError?: (err: unknown) => void;
  loading?: boolean;
  size?: "default" | "sm";
  extra?: React.ReactNode;
};

export function ViewerControls({
  className,
  title,
  subtitle,
  position,
  zoom,
  rotate,
  downloads,
  loading = false,
  size = "default",
  extra,
  ...props
}: ViewerControlsProps) {
  const hasDownloads = Boolean(downloads?.length);
  const hasControls = Boolean(zoom || rotate || hasDownloads || extra);
  const hasPlainTitle = typeof title === "string" || typeof title === "number";
  const hasMetadataGroup = loading || title != null || subtitle != null;

  return (
    <div
      data-slot="viewer-controls"
      className={cn(
        "bg-card text-card-foreground flex h-10 flex-shrink-0 items-center gap-1 border-b border-border px-3",
        size === "sm" && "h-9 px-2",
        className,
      )}
      {...props}
    >
      {hasMetadataGroup ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {loading ? (
            <span
              aria-hidden
              className="bg-primary size-2 flex-shrink-0 animate-pulse rounded-full"
            />
          ) : null}
          {title != null ? (
            <div
              className={cn(
                "min-w-0 px-1",
                hasPlainTitle && "truncate text-xs font-medium text-foreground",
              )}
            >
              {title}
            </div>
          ) : null}
          {subtitle != null ? (
            <span className="text-muted-foreground hidden min-w-0 truncate px-1 text-xs tabular-nums sm:inline">
              {subtitle}
            </span>
          ) : null}
          {position ? (
            <span className="text-muted-foreground flex-shrink-0 px-1 text-xs tabular-nums">
              {formatViewerControlPosition(position)}
            </span>
          ) : null}
        </div>
      ) : position ? (
        <span className="text-muted-foreground flex-shrink-0 px-1 text-xs tabular-nums">
          {formatViewerControlPosition(position)}
        </span>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      {hasControls ? (
        <div className="ml-auto flex flex-shrink-0 items-center gap-1">
          {zoom ? <ViewerZoomControls zoom={zoom} /> : null}
          {zoom && rotate ? <ViewerControlSeparator /> : null}
          {rotate ? <ViewerRotateControlButton rotate={rotate} /> : null}
          {(zoom || rotate) && hasDownloads ? <ViewerControlSeparator /> : null}
          {hasDownloads && downloads ? (
            downloads.map((action) => (
              <ViewerControlButton
                key={action.id}
                label={action.label}
                disabled={action.isDisabled}
                onClick={action.onDownload}
              >
                <Download className="size-3.5" />
              </ViewerControlButton>
            ))
          ) : null}
          {(zoom || rotate || hasDownloads) && extra ? (
            <ViewerControlSeparator />
          ) : null}
          {extra}
        </div>
      ) : null}
    </div>
  );
}

export function ViewerControlButton({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="iconXs"
      className={cn("size-7 text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

export function formatViewerControlPosition(position: ViewerControlPosition) {
  if ("label" in position) return position.label;

  const label =
    position.kind === "page"
      ? "Page"
      : position.kind === "slide"
        ? "Slide"
        : "Frame";
  const current =
    position.total == null
      ? position.current
      : Math.min(position.current, position.total);

  return position.total == null
    ? `${label} ${current}`
    : `${label} ${current} of ${position.total}`;
}

function ViewerZoomControls({ zoom }: { zoom: ViewerZoomControl }) {
  const fitLabel = zoom.fitLabel ?? "Fit width";

  return (
    <div className="flex items-center gap-0.5">
      <ViewerControlButton
        label="Zoom out"
        onClick={zoom.onZoomOut}
        disabled={zoom.isDisabled}
      >
        <Minus className="size-3.5" />
      </ViewerControlButton>
      {zoom.onReset ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground w-11 text-center text-xs tabular-nums disabled:pointer-events-none disabled:opacity-50"
          title="Reset zoom"
          onClick={zoom.onReset}
          disabled={zoom.isDisabled}
        >
          {zoom.scale == null ? "Fit" : `${Math.round(zoom.scale * 100)}%`}
        </button>
      ) : (
        <span className="text-muted-foreground w-11 text-center text-xs tabular-nums">
          {zoom.scale == null ? "Fit" : `${Math.round(zoom.scale * 100)}%`}
        </span>
      )}
      <ViewerControlButton
        label="Zoom in"
        onClick={zoom.onZoomIn}
        disabled={zoom.isDisabled}
      >
        <Plus className="size-3.5" />
      </ViewerControlButton>
      {zoom.onFit ? (
        <ViewerControlButton
          label={fitLabel}
          onClick={zoom.onFit}
          disabled={zoom.isDisabled}
        >
          <Maximize className="size-3.5" />
        </ViewerControlButton>
      ) : null}
    </div>
  );
}

function ViewerRotateControlButton({
  rotate,
}: {
  rotate: ViewerRotateControl;
}) {
  return (
    <ViewerControlButton
      label="Rotate"
      onClick={rotate.onRotate}
      disabled={rotate.isDisabled}
    >
      <RotateCw className="size-3.5" />
    </ViewerControlButton>
  );
}

function ViewerControlSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-4" />;
}
