/**
 * HISD Design System — Card (React wrapper)
 * ============================================================================
 * A thin behavior + markup layer over the vanilla `hisd-card` component. It
 * applies the SAME `hisd-card*` classes and ARIA contract defined in
 * components/card.css (bundled into components/components.css) and the theme in
 * assets/hisd-theme.css — it NEVER re-implements styling. Theming flows entirely
 * from those stylesheets, which the host app must load.
 *
 * Faithful to components/card.html:
 *   - Root is <article> (static), or <a> / <button> (interactive). A fully
 *     clickable card is a single interactive root carrying aria-label — never
 *     nested interactive elements.
 *   - Variants: raised, sunken, accent rail (brand/action/accent/success/
 *     warning/danger/info).
 *   - Selectable cards are real <button aria-pressed>; the browser fires click
 *     on both Enter and Space, so a single onClick covers mouse + keyboard.
 *   - aria-disabled links are not natively inert, so activation (click + Enter/
 *     Space) is intercepted and prevented, exactly like the demo's <script>.
 *   - prefers-reduced-motion / forced-colors are honored by the CSS already.
 * ============================================================================
 */

import * as React from 'react';

/** Surface elevation / inset treatment. `flat` adds no variant class. */
export type CardVariant = 'flat' | 'raised' | 'sunken';

/** Optional categorical accent rail drawn on the inline-start edge. */
export type CardAccent =
  | 'brand'
  | 'action'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** How an interactive card reports its toggled / current state to AT. */
export type CardSelectionRole = 'pressed' | 'current';

interface CardOwnProps {
  /** Surface treatment. @default 'flat' */
  variant?: CardVariant;
  /** Categorical accent rail on the inline-start edge. */
  accent?: CardAccent;
  /**
   * Render the whole card as a single interactive control (`hisd-card--interactive`).
   * When `href` is provided the root is an `<a>`; otherwise it is a `<button>`.
   * Required by the contract to carry an `aria-label` covering the whole intent.
   */
  interactive?: boolean;
  /**
   * Selected state. Adds `hisd-card--selected` and, for interactive cards,
   * the matching ARIA state attribute (`aria-pressed` or `aria-current`).
   */
  selected?: boolean;
  /**
   * Which ARIA attribute carries the selected state on an interactive card.
   * @default 'pressed'
   */
  selectionRole?: CardSelectionRole;
  /** Fires when an interactive card is toggled. Receives the next selected value. */
  onSelectedChange?: (selected: boolean) => void;
  /** Disable an interactive card (sets `aria-disabled`, blocks activation). */
  disabled?: boolean;
  /** Destination for a clickable card; when present the root renders as `<a>`. */
  href?: string;
  /** Extra class names appended after the `hisd-card*` classes. */
  className?: string;
  children?: React.ReactNode;
}

/**
 * Props for a static (non-interactive) card. The root is an `<article>`, so it
 * accepts the full set of native `<article>` attributes (e.g. aria-labelledby).
 */
export type StaticCardProps = CardOwnProps & {
  interactive?: false;
  href?: undefined;
} & Omit<React.HTMLAttributes<HTMLElement>, keyof CardOwnProps>;

/** Props for an interactive card rendered as a link (`<a href>`). */
export type LinkCardProps = CardOwnProps & {
  interactive: true;
  href: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CardOwnProps>;

/** Props for an interactive card rendered as a button (no href). */
export type ButtonCardProps = CardOwnProps & {
  interactive: true;
  href?: undefined;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CardOwnProps>;

export type CardProps = StaticCardProps | LinkCardProps | ButtonCardProps;

/** Build the className string from the variant / state props. */
function cardClassName(props: {
  variant: CardVariant;
  accent?: CardAccent | undefined;
  interactive: boolean;
  selected: boolean;
  className?: string | undefined;
}): string {
  const { variant, accent, interactive, selected, className } = props;
  const classes = ['hisd-card'];
  if (variant === 'raised') classes.push('hisd-card--raised');
  if (variant === 'sunken') classes.push('hisd-card--sunken');
  if (interactive) classes.push('hisd-card--interactive');
  if (selected) classes.push('hisd-card--selected');
  if (accent) classes.push(`hisd-card--accent-${accent}`);
  if (className) classes.push(className);
  return classes.join(' ');
}

/**
 * HISD Card.
 *
 * @example Static
 * ```tsx
 * <Card aria-labelledby="t">
 *   <Card.Header>
 *     <Card.Eyebrow>Enrollment</Card.Eyebrow>
 *     <Card.Title id="t">Register for 2026–27</Card.Title>
 *   </Card.Header>
 *   <Card.Body>Online registration is open.</Card.Body>
 * </Card>
 * ```
 *
 * @example Selectable button card
 * ```tsx
 * const [on, setOn] = React.useState(false);
 * <Card interactive selected={on} onSelectedChange={setOn}
 *       aria-label="Select the Pre-K program card">
 *   <Card.Header><Card.Title>Pre-K (ages 3–4)</Card.Title></Card.Header>
 * </Card>
 * ```
 */
export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  props,
  ref,
) {
  const {
    variant = 'flat',
    accent,
    interactive = false,
    selected = false,
    selectionRole = 'pressed',
    onSelectedChange,
    disabled = false,
    href,
    className,
    children,
    onClick,
    onKeyDown,
    ...rest
  } = props as CardProps & {
    onClick?: React.MouseEventHandler<HTMLElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  };

  const computedClassName = cardClassName({
    variant,
    accent,
    interactive,
    selected,
    className,
  });

  // ----- Static card: plain <article> wrapper -------------------------------
  if (!interactive) {
    const articleRest = rest as React.HTMLAttributes<HTMLElement>;
    return (
      <article
        {...articleRest}
        ref={ref as React.Ref<HTMLElement>}
        className={computedClassName}
      >
        {children}
      </article>
    );
  }

  // ----- Interactive selected-state ARIA ------------------------------------
  // Mirrors card.css: selection reads via aria-pressed OR aria-current.
  const ariaSelection: {
    'aria-pressed'?: boolean;
    'aria-current'?: boolean;
  } = {};
  if (onSelectedChange || selected || selectionRole) {
    if (selectionRole === 'current') ariaSelection['aria-current'] = selected;
    else ariaSelection['aria-pressed'] = selected;
  }

  // Toggle handler — native click fires on Enter (links/buttons) and Space
  // (buttons), so a single click handler covers mouse + full keyboard, exactly
  // like the vanilla demo's selectable wiring.
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onSelectedChange?.(!selected);
    onClick?.(event);
  };

  // aria-disabled roots are not natively inert: block Enter/Space activation,
  // matching the demo's keydown guard for disabled links.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onKeyDown?.(event);
  };

  // ----- Interactive as <a href> --------------------------------------------
  if (typeof href === 'string') {
    const anchorRest = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        {...anchorRest}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={computedClassName}
        // role="link" + aria-disabled keeps a disabled anchor announced as a
        // (disabled) link without making it inert via removed href.
        href={disabled ? undefined : href}
        role={disabled ? 'link' : anchorRest.role}
        aria-disabled={disabled || undefined}
        {...ariaSelection}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </a>
    );
  }

  // ----- Interactive as <button> --------------------------------------------
  const buttonRest = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      {...buttonRest}
      ref={ref as React.Ref<HTMLButtonElement>}
      type={buttonRest.type ?? 'button'}
      className={computedClassName}
      disabled={disabled}
      {...ariaSelection}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}) as React.ForwardRefExoticComponent<
  CardProps & React.RefAttributes<HTMLElement>
> & {
  Media: typeof CardMedia;
  Header: typeof CardHeader;
  Eyebrow: typeof CardEyebrow;
  Title: typeof CardTitle;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
  Cta: typeof CardCta;
};

// ---------------------------------------------------------------------------
// Structural sub-parts — presentational class+markup wrappers, one per
// `hisd-card__*` part in card.css. Each spreads ...rest and forwards a ref.
// ---------------------------------------------------------------------------

function joinClass(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

export interface CardPartProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/** Leading media slot (`hisd-card__media`). */
export const CardMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardMedia({ className, children, ...rest }, ref) {
    return (
      <div {...rest} ref={ref} className={joinClass('hisd-card__media', className)}>
        {children}
      </div>
    );
  },
);

/** Header grouping eyebrow + title (`hisd-card__header`). */
export const CardHeader = React.forwardRef<HTMLElement, CardPartProps>(
  function CardHeader({ className, children, ...rest }, ref) {
    return (
      <header {...rest} ref={ref} className={joinClass('hisd-card__header', className)}>
        {children}
      </header>
    );
  },
);

/** Small uppercase label above the title (`hisd-card__eyebrow`). */
export const CardEyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardEyebrow({ className, children, ...rest }, ref) {
  return (
    <p {...rest} ref={ref} className={joinClass('hisd-card__eyebrow', className)}>
      {children}
    </p>
  );
});

export interface CardTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level for the title element. @default 3 */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

/**
 * Card heading (`hisd-card__title`). Acts as the accessible heading; for
 * interactive cards the card's aria-label is the accessible name, so this still
 * provides a visible/semantic heading inside.
 */
export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  function CardTitle({ as = 'h3', className, children, ...rest }, ref) {
    const Heading = as;
    return (
      <Heading {...rest} ref={ref} className={joinClass('hisd-card__title', className)}>
        {children}
      </Heading>
    );
  },
);

/** Body copy (`hisd-card__body`). */
export const CardBody = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardBody({ className, children, ...rest }, ref) {
  return (
    <p {...rest} ref={ref} className={joinClass('hisd-card__body', className)}>
      {children}
    </p>
  );
});

/** Footer row, pinned to the bottom in a grid (`hisd-card__footer`). */
export const CardFooter = React.forwardRef<HTMLElement, CardPartProps>(
  function CardFooter({ className, children, ...rest }, ref) {
    return (
      <footer {...rest} ref={ref} className={joinClass('hisd-card__footer', className)}>
        {children}
      </footer>
    );
  },
);

export interface CardCtaProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Render the trailing chevron affordance (`hisd-card__cta-icon`). @default true */
  withIcon?: boolean;
}

/**
 * Affordance row inside an interactive card (`hisd-card__cta`). Rendered as
 * plain text + an aria-hidden icon span — NOT a nested control, per the
 * "no nested interactive elements" contract. The whole row is aria-hidden so
 * AT relies on the card's single aria-label.
 */
export const CardCta = React.forwardRef<HTMLSpanElement, CardCtaProps>(
  function CardCta({ withIcon = true, className, children, ...rest }, ref) {
    return (
      <span
        aria-hidden="true"
        {...rest}
        ref={ref}
        className={joinClass('hisd-card__cta', className)}
      >
        {children}
        {withIcon ? <span className="hisd-card__cta-icon" /> : null}
      </span>
    );
  },
);

Card.Media = CardMedia;
Card.Header = CardHeader;
Card.Eyebrow = CardEyebrow;
Card.Title = CardTitle;
Card.Body = CardBody;
Card.Footer = CardFooter;
Card.Cta = CardCta;
