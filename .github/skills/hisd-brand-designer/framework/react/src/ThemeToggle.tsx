import * as React from "react";

/**
 * HISD ThemeToggle — typed React wrapper around the vanilla `.hisd-theme-toggle`
 * component.
 *
 * This is a thin markup + ARIA layer. ALL styling/theming comes from the
 * design-system CSS (assets/hisd-theme.css + components/components.css, which
 * includes components/theme-toggle.css); reduced-motion and forced-colors are
 * handled there, not here. This component only:
 *   - renders the canonical grouped `role="group"` + icon `<button>` markup,
 *   - carries the accessible state (aria-pressed per option, explicit
 *     aria-labels) while the visible label is icon-based,
 *   - reports the chosen theme via onChange so the host can persist it and set
 *     `data-theme` on <html>.
 */
export type ThemeToggleValue = "light" | "dark";

export interface ThemeToggleOption {
  value: ThemeToggleValue;
  label?: string;
  "aria-label"?: string;
  title?: string;
  icon?: React.ReactNode;
}

export interface ThemeToggleProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: ThemeToggleValue;
  onChange: (value: ThemeToggleValue) => void;
  options?: readonly ThemeToggleOption[];
  variant?: "default" | "appbar";
  "aria-label"?: string;
  disabled?: boolean;
}

const DEFAULT_OPTIONS: readonly ThemeToggleOption[] = [
  { value: "light", label: "Light", "aria-label": "Use light theme", title: "Light theme" },
  { value: "dark", label: "Dark", "aria-label": "Use dark theme", title: "Dark theme" },
];

export function ThemeIcon({ theme }: { theme: ThemeToggleValue }) {
  return (
    <svg
      className="hisd-theme-toggle__icon"
      viewBox="0 -960 960 960"
      aria-hidden="true"
      focusable="false"
    >
      {theme === "light" ? (
        <path d="M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM80-434.5q-19.15 0-32.33-13.17Q34.5-460.85 34.5-480t13.17-32.33Q60.85-525.5 80-525.5h80q19.15 0 32.33 13.17Q205.5-499.15 205.5-480t-13.17 32.33Q179.15-434.5 160-434.5H80Zm720 0q-19.15 0-32.33-13.17Q754.5-460.85 754.5-480t13.17-32.33Q780.85-525.5 800-525.5h80q19.15 0 32.33 13.17Q925.5-499.15 925.5-480t-13.17 32.33Q899.15-434.5 880-434.5h-80Zm-320-320q-19.15 0-32.33-13.17Q434.5-780.85 434.5-800v-80q0-19.15 13.17-32.33Q460.85-925.5 480-925.5t32.33 13.17Q525.5-899.15 525.5-880v80q0 19.15-13.17 32.33Q499.15-754.5 480-754.5Zm0 720q-19.15 0-32.33-13.17Q434.5-60.85 434.5-80v-80q0-19.15 13.17-32.33Q460.85-205.5 480-205.5t32.33 13.17Q525.5-179.15 525.5-160v80q0 19.15-13.17 32.33Q499.15-34.5 480-34.5ZM222.17-673.93l-43-42Q165.5-728.61 166-747.76t13.17-33.07q13.44-13.67 32.59-13.67 19.15 0 32.07 13.67l42.24 43q12.67 13.44 12.55 31.71-.12 18.27-12.55 31.95-12.68 13.67-31.45 13.41-18.77-.26-32.45-13.17Zm494 494.76-42.24-43q-12.67-13.44-12.67-32.09 0-18.65 12.67-31.57 12.68-13.67 31.45-13.17t32.45 13.17l43 41.76q13.67 12.68 13.17 31.83t-13.17 33.07q-13.44 13.67-32.59 13.67-19.15 0-32.07-13.67Zm-42-494.76Q660.5-686.61 661-705.38t13.17-32.45l41.76-43q12.68-13.67 31.83-13.17t33.07 13.17q13.67 13.44 13.67 32.59 0 19.15-13.67 32.07l-43 42.24q-13.44 12.67-31.71 12.55-18.27-.12-31.95-12.55Zm-495 494.76q-13.67-13.44-13.67-32.59 0-19.15 13.67-32.07l43-42.24q13.44-12.67 32.09-12.67 18.65 0 31.57 12.67 13.67 12.68 13.17 31.45t-13.17 32.45l-41.76 43Q231.39-165.5 212.24-166t-33.07-13.17Z" />
      ) : (
        <path d="M480.24-116.41q-153.63 0-258.73-104.98Q116.41-326.37 116.41-480q0-133.93 84.74-235.43t223.31-123.05q15.39-3.43 27.54 1.35 12.15 4.78 19.83 14.02 7.91 9.24 9.72 22.2 1.82 12.95-4.75 26.11-13.89 25.04-21.31 51.65-7.42 26.61-7.42 55.5 0 91.67 64.31 155.87 64.32 64.19 156.23 64.19 28.37 0 56.48-7.44 28.11-7.45 50.91-20.58 12.91-5.8 25.13-4.11 12.22 1.7 21.22 8.13 9.76 6.44 14.54 18.23 4.78 11.8 1.59 27.95Q820.17-291 717.63-203.71q-102.54 87.3-237.39 87.3Z" />
      )}
    </svg>
  );
}

export const ThemeToggle = React.forwardRef<HTMLDivElement, ThemeToggleProps>(
  function ThemeToggle(props, forwardedRef) {
    const {
      value,
      onChange,
      options = DEFAULT_OPTIONS,
      variant = "default",
      "aria-label": ariaLabel = "Theme",
      disabled = false,
      className,
      ...rest
    } = props;

    const rootClass = [
      "hisd-theme-toggle",
      variant === "appbar" ? "hisd-theme-toggle--appbar" : "",
      className,
    ].filter(Boolean).join(" ");

    return (
      <div {...rest} ref={forwardedRef} className={rootClass} role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className="hisd-theme-toggle__button"
              data-theme-option={option.value}
              data-active={isActive}
              aria-pressed={isActive}
              aria-label={option["aria-label"] ?? `Use ${option.value} theme`}
              title={option.title ?? `${option.label ?? option.value} theme`}
              disabled={disabled || undefined}
              onClick={() => onChange(option.value)}
            >
              {option.icon ?? <ThemeIcon theme={option.value} />}
            </button>
          );
        })}
      </div>
    );
  },
);

export default ThemeToggle;
