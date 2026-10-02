// Web port of the mobile app's hand-drawn stroke icon set
// (apps/mobile/src/components/UiIcons.tsx). Same 24x24 grid, round caps,
// 2px default stroke. Icons inherit text color via currentColor.

import type { JSX, SVGProps } from "react";

export type StrokeIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function frame(size: number, strokeWidth: number, props: StrokeIconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

function icon(render: (size: number, strokeWidth: number, props: StrokeIconProps) => JSX.Element) {
  return function Icon({ size = 18, strokeWidth = 2, ...props }: StrokeIconProps) {
    return render(size, strokeWidth, props);
  };
}

export const ChevronLeftIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="m14.5 6-6 6 6 6" /> })
);

export const ChevronRightIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="m9.5 6 6 6-6 6" /> })
);

export const ChevronUpIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="m6 14.5 6-6 6 6" /> })
);

export const ChevronDownIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="m6 9.5 6 6 6-6" /> })
);

export const GripHorizontalIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        {[5, 12, 19].flatMap((cx) =>
          [9, 15].map((cy) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} fill="currentColor" strokeWidth={0} />
          ))
        )}
      </>
    ) }
  )
);

export const SearchIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <circle cx={11} cy={11} r={7} />
        <path d="M20 20l-3.2-3.2" />
      </>
    ),
  })
);

export const ArrowUpRightIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M7 17 17 7" />
        <path d="M9.5 7H17v7.5" />
      </>
    ),
  })
);

export const BarChartIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M5 20V13" />
        <path d="M12 20V5" />
        <path d="M19 20v-10" />
      </>
    ),
  })
);

export const LineChartIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="M4 15l4.5-5.5 3.5 3L19 6" /> })
);

export const SettingsIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <circle cx={12} cy={12} r={2.75} />
        <path d="M12 3.75v2.1" />
        <path d="M12 18.15v2.1" />
        <path d="m5.64 5.64 1.48 1.48" />
        <path d="m16.88 16.88 1.48 1.48" />
        <path d="M3.75 12h2.1" />
        <path d="M18.15 12h2.1" />
        <path d="m5.64 18.36 1.48-1.48" />
        <path d="m16.88 7.12 1.48-1.48" />
      </>
    ) }
  )
);

export const KeyIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <path d="m16.555 3.843 3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1-4.069 0l-.301-.301-6.558 6.558a2 2 0 0 1-1.239.578L5.172 21H4a1 1 0 0 1-.993-.883L3 20v-1.172a2 2 0 0 1 .467-1.284l.119-.13L4 17h2v-2h2v-2l2.144-2.144-.301-.301a2.877 2.877 0 0 1 0-4.069l2.643-2.643a2.877 2.877 0 0 1 4.069 0M15 9h.01" />
    ),
  })
);

export const AdjustmentsIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <circle cx={14} cy={6} r={2} />
        <path d="M4 6h8" />
        <path d="M16 6h4" />
        <circle cx={8} cy={12} r={2} />
        <path d="M4 12h2" />
        <path d="M10 12h10" />
        <circle cx={17} cy={18} r={2} />
        <path d="M4 18h11" />
        <path d="M19 18h1" />
      </>
    ) }
  )
);

export const CopyIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M9.5 8.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
        <path d="M5.5 15.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
      </>
    ),
  })
);

export const CheckIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="m5 12.5 4.5 4.5L19 7" /> })
);

export const PlusIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <line x1={12} y1={6} x2={12} y2={18} />
        <line x1={6} y1={12} x2={18} y2={12} />
      </>
    ) }
  )
);

export const CloseIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <line x1={6.5} y1={6.5} x2={17.5} y2={17.5} />
        <line x1={17.5} y1={6.5} x2={6.5} y2={17.5} />
      </>
    ) }
  )
);

export const PencilIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M14.5 5.5 18.5 9.5" />
        <path d="M16.2 3.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L8.4 20.1 3.5 21l.9-4.9Z" />
      </>
    ),
  })
);

export const TrashIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <path d="M4.5 6.5h15" />
        <path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
        <path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
        <line x1={10} y1={10.5} x2={10} y2={16.5} />
        <line x1={14} y1={10.5} x2={14} y2={16.5} />
      </>
    ) }
  )
);

export const UnlinkIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <path d="M9.2 7.3 11 5.5a4 4 0 0 1 5.7 5.7l-1.8 1.8" />
        <path d="M14.8 16.7 13 18.5a4 4 0 0 1-5.7-5.7l1.8-1.8" />
        <line x1={4.5} y1={4.5} x2={19.5} y2={19.5} />
      </>
    ) }
  )
);

export const InfoCircleIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <circle cx={12} cy={12} r={8} />
        <line x1={12} y1={10.5} x2={12} y2={16} />
        <circle cx={12} cy={7.25} r={0.8} fill="currentColor" stroke="none" />
      </>
    ) }
  )
);

export const AlertCircleIcon = icon((s, w, p) =>
  frame(
    s,
    w,
    { ...p, children: (
      <>
        <circle cx={12} cy={12} r={8} />
        <line x1={12} y1={8} x2={12} y2={12.5} />
        <circle cx={12} cy={16.35} r={0.8} fill="currentColor" stroke="none" />
      </>
    ) }
  )
);

export const EyeIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M3.75 12s2.85-5 8.25-5 8.25 5 8.25 5-2.85 5-8.25 5-8.25-5-8.25-5Z" />
        <circle cx={12} cy={12} r={2.25} />
      </>
    ),
  })
);

export const SyncLoopIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M18.25 8.25a6.5 6.5 0 0 0-10.95-2.7" />
        <path d="M7.3 5.55v3.4h3.35" />
        <path d="M5.75 15.75a6.5 6.5 0 0 0 10.95 2.7" />
        <path d="M16.7 18.45v-3.4h-3.35" />
      </>
    ),
  })
);

export const CalendarIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M6.5 5.75h11a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2Z" />
        <path d="M4.5 9.75h15" />
        <path d="M8.5 3.75v3" />
        <path d="M15.5 3.75v3" />
      </>
    ),
  })
);

export const ClockIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <circle cx={12} cy={12} r={7.75} />
        <path d="M12 8v4.25l2.75 1.75" />
      </>
    ),
  })
);

export const StarIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: <path d="M12 4.5l2.32 4.7 5.18.75-3.75 3.66.88 5.14L12 16.5l-4.63 2.44.88-5.14-3.75-3.66 5.18-.75L12 4.5Z" />,
  })
);

export const MailIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M4.5 6.75h15a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75v-9a.75.75 0 0 1 .75-.75Z" />
        <path d="m4.5 8 7.5 5.25L19.5 8" />
      </>
    ),
  })
);

export const InboxTrayIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M4.5 8.5h15l-1.35 8.25a2 2 0 0 1-1.98 1.65H7.83a2 2 0 0 1-1.98-1.65Z" />
        <path d="M8.25 12.25h2.25a1.5 1.5 0 0 0 3 0h2.25" />
      </>
    ),
  })
);

export const ChatBubbleIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <path d="M6.25 8.5a3.75 3.75 0 0 1 3.75-3.75h4a3.75 3.75 0 0 1 3.75 3.75v3a3.75 3.75 0 0 1-3.75 3.75h-2.25L8 18.5v-3.25h.25A3.75 3.75 0 0 1 6.25 11.5Z" />
    ),
  })
);

export const BellIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M12 4.75a4.75 4.75 0 0 1 4.75 4.75c0 3.1.85 4.75 1.5 5.75H5.75c.65-1 1.5-2.65 1.5-5.75A4.75 4.75 0 0 1 12 4.75Z" />
        <path d="M10.25 18.25a1.85 1.85 0 0 0 3.5 0" />
      </>
    ),
  })
);

export const MoonIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: <path d="M18.75 13.9a7 7 0 0 1-8.65-8.65 7 7 0 1 0 8.65 8.65Z" />,
  })
);

export const LedgerCheckIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M7.5 5.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
        <path d="m8.75 12 2 2 4.5-4.5" />
        <path d="M8.5 8.5h7" />
      </>
    ),
  })
);

export const StackPlusIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M4 7h9" />
        <path d="M4 12h9" />
        <path d="M4 17h6" />
        <path d="M17.5 14v6" />
        <path d="M14.5 17h6" />
      </>
    ),
  })
);

export const PulseIcon = icon((s, w, p) =>
  frame(s, w, { ...p, children: <path d="M3.5 12h3.25l2.5-5.5 3.5 11 2.5-5.5h5.25" /> })
);

export const RetryArrowIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
        <path d="M19.5 3.5v3.5H16" />
      </>
    ),
  })
);

export const FileTextIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <>
        <path d="M8 3.5h5.5L18 8v9.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" />
        <path d="M13.5 3.5V8H18" />
        <path d="M8.5 12.5H14" />
        <path d="M8.5 16H12" />
      </>
    ),
  })
);

export const SparkIcon = icon((s, w, p) =>
  frame(s, w, {
    ...p,
    children: (
      <path d="M12 3.5c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7Z" />
    ),
  })
);
