/**
 * HISD Design System — Avatar (React wrapper)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-avatar` component. It
 * applies the SAME `hisd-avatar*` classes and ARIA contract defined in
 * components/avatar.css (bundled into components/components.css) and the theme in
 * assets/hisd-theme.css — it NEVER re-implements styling. Theming flows entirely
 * from those stylesheets, which the host app must load.
 *
 * Faithful to components/avatar.html:
 *   - Root is a <span> (static) or a real <button> (interactive). The
 *     interactive variant is icon-only, so it carries an aria-label that folds
 *     in the presence state; a native <button> gives Enter/Space activation for
 *     free per the WAI-ARIA APG button pattern, so NO custom keyboard JS is
 *     needed (the demo ships none).
 *   - Inner structure: `.hisd-avatar__media` wrapping either an
 *     `.hisd-avatar__img` (an <img> with REQUIRED alt) or an
 *     `.hisd-avatar__initials` fallback (role="img" + aria-label, or aria-hidden
 *     when the name lives on the interactive button instead).
 *   - Optional presence `.hisd-avatar__status` dot (success / muted). Static:
 *     role="img" + aria-label names it. Interactive: aria-hidden, because the
 *     presence is already folded into the button's accessible name.
 *   - Sizes sm / md / lg via `hisd-avatar--{size}`.
 *   - prefers-reduced-motion / forced-colors are honored by the CSS already.
 * ============================================================================
 */

import * as React from 'react';

/** Avatar diameter. Maps to `hisd-avatar--{size}`. @default 'md' */
export type AvatarSize = 'sm' | 'md' | 'lg';

/** Presence dot state. Maps to `hisd-avatar__status--{status}`. */
export type AvatarStatus = 'success' | 'muted';

/** Class-name constants — single source of truth, mirrors avatar.css. */
const AVATAR = 'hisd-avatar';
const AVATAR_INTERACTIVE = 'hisd-avatar--interactive';
const AVATAR_MEDIA = 'hisd-avatar__media';
const AVATAR_IMG = 'hisd-avatar__img';
const AVATAR_INITIALS = 'hisd-avatar__initials';
const AVATAR_STATUS = 'hisd-avatar__status';

function joinClasses(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Shared props                                                               */
/* -------------------------------------------------------------------------- */

interface AvatarCommonProps {
  /** Avatar diameter. @default 'md' */
  size?: AvatarSize;
  /**
   * Photo URL. When provided, the avatar renders an `<img>` and `alt` is
   * REQUIRED (the image carries the accessible name). Omit to render the
   * `initials` fallback instead.
   */
  src?: string;
  /**
   * Required alt text for the image variant (e.g. "Photo of Ana Reyes").
   * Ignored when `src` is absent.
   */
  alt?: string;
  /** Native <img> width hint (intrinsic), forwarded to the <img>. */
  imgWidth?: number;
  /** Native <img> height hint (intrinsic), forwarded to the <img>. */
  imgHeight?: number;
  /**
   * Initials shown when there is no `src` (e.g. "AR"). The CSS uppercases them;
   * 1–2 characters is the intended content.
   */
  initials?: string;
  /**
   * The person's name. On a static initials avatar it becomes the media's
   * accessible name (role="img" aria-label). On a static image avatar prefer
   * `alt`. Ignored for the inner media on an interactive avatar (the name lives
   * on the button via `label`).
   */
  name?: string;
  /**
   * Presence indicator. When set, renders the status dot. On a static avatar the
   * dot is a named graphic (role="img"); on an interactive avatar it is
   * aria-hidden and the state is folded into the button's `label`.
   */
  status?: AvatarStatus;
  /**
   * Accessible name for the presence dot on a STATIC avatar (e.g. "Online" /
   * "Offline"). Required for a meaningful static status dot; ignored on an
   * interactive avatar (use `statusLabel` only to compose `label` yourself).
   */
  statusLabel?: string;
  /** Extra class names appended after the canonical hisd-avatar classes. */
  className?: string;
  children?: React.ReactNode;
}

/** Render the inner media (img or initials). Shared by both root shapes. */
function renderMedia(args: {
  src?: string | undefined;
  alt?: string | undefined;
  imgWidth?: number | undefined;
  imgHeight?: number | undefined;
  initials?: string | undefined;
  name?: string | undefined;
  /**
   * When true the media is decorative for AT (the accessible name lives on the
   * interactive button), so the initials carry aria-hidden and the image keeps
   * an empty alt.
   */
  decorative: boolean;
  children?: React.ReactNode;
}): React.ReactNode {
  const { src, alt, imgWidth, imgHeight, initials, name, decorative, children } =
    args;

  let media: React.ReactNode;
  if (children !== undefined && children !== null) {
    media = children;
  } else if (typeof src === 'string') {
    media = (
      <img
        className={AVATAR_IMG}
        src={src}
        // Image variant: alt is the accessible name on a static avatar; empty on
        // an interactive one (the button's aria-label names the whole control).
        alt={decorative ? '' : (alt ?? '')}
        {...(imgWidth !== undefined ? { width: imgWidth } : {})}
        {...(imgHeight !== undefined ? { height: imgHeight } : {})}
      />
    );
  } else {
    media = (
      <span
        className={AVATAR_INITIALS}
        role="img"
        // Static: name the graphic. Interactive: hide it; the button names it.
        {...(decorative
          ? { 'aria-hidden': true }
          : { 'aria-label': name ?? alt ?? '' })}
      >
        {initials}
      </span>
    );
  }

  return <span className={AVATAR_MEDIA}>{media}</span>;
}

/* -------------------------------------------------------------------------- */
/* Static avatar (plain <span> container)                                     */
/* -------------------------------------------------------------------------- */

export interface AvatarProps
  extends AvatarCommonProps,
    Omit<
      React.HTMLAttributes<HTMLSpanElement>,
      keyof AvatarCommonProps | 'color'
    > {
  interactive?: false;
}

/* -------------------------------------------------------------------------- */
/* Interactive avatar (real <button>)                                         */
/* -------------------------------------------------------------------------- */

export interface InteractiveAvatarProps
  extends AvatarCommonProps,
    Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      keyof AvatarCommonProps | 'color'
    > {
  interactive: true;
  /**
   * Accessible name for the icon-only button. REQUIRED — it should fold in the
   * presence state, e.g. "Open Ana Reyes profile menu — Online".
   */
  label: string;
  /** Disabled state — native button disabled, genuinely inert. */
  disabled?: boolean;
}

export type AnyAvatarProps = AvatarProps | InteractiveAvatarProps;

function isInteractive(
  props: AnyAvatarProps,
): props is InteractiveAvatarProps {
  return props.interactive === true;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * HISD Avatar.
 *
 * @example Image (static, required alt)
 * ```tsx
 * <Avatar size="md" src="/users/ana.jpg" alt="Photo of Ana Reyes" />
 * ```
 *
 * @example Initials fallback
 * ```tsx
 * <Avatar size="md" initials="AR" name="Ana Reyes" />
 * ```
 *
 * @example With presence dot
 * ```tsx
 * <Avatar initials="ML" name="Marcus Lee" status="success" statusLabel="Online" />
 * ```
 *
 * @example Interactive (icon-only button — label folds in presence)
 * ```tsx
 * <Avatar
 *   interactive
 *   initials="AR"
 *   status="success"
 *   label="Open Ana Reyes profile menu — Online"
 *   aria-haspopup="menu"
 *   onClick={openMenu}
 * />
 * ```
 */
export const Avatar = React.forwardRef<
  HTMLSpanElement | HTMLButtonElement,
  AnyAvatarProps
>(function Avatar(props, ref) {
  if (isInteractive(props)) {
    return (
      <InteractiveAvatar
        {...props}
        forwardedRef={ref as React.ForwardedRef<HTMLButtonElement>}
      />
    );
  }
  return (
    <StaticAvatar
      {...props}
      forwardedRef={ref as React.ForwardedRef<HTMLSpanElement>}
    />
  );
});

/* --- Static --------------------------------------------------------------- */

function StaticAvatar(
  props: AvatarProps & { forwardedRef: React.ForwardedRef<HTMLSpanElement> },
) {
  const {
    size = 'md',
    src,
    alt,
    imgWidth,
    imgHeight,
    initials,
    name,
    status,
    statusLabel,
    className,
    children,
    forwardedRef,
    interactive: _interactive,
    ...rest
  } = props;

  return (
    <span
      {...rest}
      ref={forwardedRef}
      className={joinClasses(AVATAR, `${AVATAR}--${size}`, className)}
    >
      {renderMedia({
        src,
        alt,
        imgWidth,
        imgHeight,
        initials,
        name,
        decorative: false,
        children,
      })}
      {status ? (
        <span
          className={joinClasses(AVATAR_STATUS, `${AVATAR_STATUS}--${status}`)}
          // Static dot names itself, mirroring the demo's role="img" + label.
          role="img"
          aria-label={statusLabel}
        />
      ) : null}
    </span>
  );
}

/* --- Interactive ---------------------------------------------------------- */

function InteractiveAvatar(
  props: InteractiveAvatarProps & {
    forwardedRef: React.ForwardedRef<HTMLButtonElement>;
  },
) {
  const {
    size = 'md',
    src,
    alt,
    imgWidth,
    imgHeight,
    initials,
    name,
    status,
    statusLabel: _statusLabel,
    label,
    disabled = false,
    className,
    children,
    type,
    forwardedRef,
    interactive: _interactive,
    ...rest
  } = props;

  return (
    <button
      {...rest}
      ref={forwardedRef}
      type={type ?? 'button'}
      className={joinClasses(
        AVATAR,
        `${AVATAR}--${size}`,
        AVATAR_INTERACTIVE,
        className,
      )}
      // Icon-only control: the whole accessible name lives here and folds in the
      // presence state, exactly like the vanilla demo's interactive button.
      aria-label={label}
      disabled={disabled}
    >
      {renderMedia({
        src,
        alt,
        imgWidth,
        imgHeight,
        initials,
        name,
        // Inner media is decorative; the button carries the accessible name.
        decorative: true,
        children,
      })}
      {status ? (
        <span
          className={joinClasses(AVATAR_STATUS, `${AVATAR_STATUS}--${status}`)}
          // Dot is decorative here — presence is already in the button label.
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

export default Avatar;
