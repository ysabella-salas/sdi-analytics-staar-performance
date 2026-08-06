# HISD Power Pages — Liquid / HTML snippets

Paste these into Power Pages **Web Templates**, **Content Snippets**, or directly
into a page's HTML. They assume `hisd-powerpages.css` is loaded (see `README.md`)
and that the brand logos have been uploaded as web files.

All colors come from the `var(--color-*)` semantic tokens defined in the CSS, so
every snippet adapts to light/dark automatically. Logo image `src` values use
Power Pages' root-relative web-file URLs — adjust the partial URLs to match what
you uploaded.

> Liquid note: Power Pages renders Liquid server-side. The `{{ ... }}` and
> `{% ... %}` tags below are evaluated by the portal; the produced HTML is what
> the browser sees. Where a value is static you can also just hard-code it.

---

## 1. Brand header with logo + theme toggle

Two logo `<img>` tags are included — a dark-ink logo for light mode and a white
logo for dark mode. The CSS (`.hisd-header__logo--light/--dark`) shows the right
one for the active theme. Upload both web files first (see README font/logo
steps; logos work the same way).

```html
<header class="hisd-header" role="banner">
  <a class="hisd-header__brand" href="{{ website.adx_partialurl | default: '/' }}"
     aria-label="Houston Independent School District home">
    <!-- Shown in LIGHT mode: dark-ink wordmark -->
    <img class="hisd-header__logo hisd-header__logo--light"
         src="/full-dark-grey-teal.svg"
         alt="Houston Independent School District" />
    <!-- Shown in DARK mode: white wordmark -->
    <img class="hisd-header__logo hisd-header__logo--dark"
         src="/full-white.svg"
         alt="Houston Independent School District" />
  </a>

  <nav class="hisd-header__actions" aria-label="Site utilities">
    <!-- Theme toggle button — wired by the script in section 5 -->
    <button type="button"
            class="hisd-theme-toggle"
            id="hisd-theme-toggle"
            aria-pressed="false">
      <span class="hisd-theme-toggle__icon" aria-hidden="true">&#9789;</span>
      <span class="hisd-theme-toggle__label">Theme</span>
    </button>
  </nav>
</header>
```

Liquid variant pulling the logo from a web file by name (resolves to its URL):

```liquid
<img class="hisd-header__logo hisd-header__logo--light"
     src="{{ weburl }}/full-dark-grey-teal.svg"
     alt="Houston Independent School District" />
```

---

## 2. Themed primary button

```html
<a href="/apply/" class="btn btn-primary">Apply now</a>

<!-- or as a real button -->
<button type="submit" class="btn btn-primary">Submit</button>

<!-- secondary / outline variant -->
<a href="/learn-more/" class="btn btn-secondary">Learn more</a>
```

Liquid example linking to a page by its site marker:

```liquid
<a href="{{ sitemarkers['Apply'].url }}" class="btn btn-primary">Apply now</a>
```

These pick up `--color-action` / `--color-on-action` from the CSS — no inline
styles needed.

---

## 3. Card

```html
<div class="card">
  <div class="card-header">School Navigator</div>
  <div class="card-body">
    <h3 class="card-title">Find your zoned school</h3>
    <p class="card-text">
      Enter your address to see the campuses your student is eligible to attend.
    </p>
    <a href="/school-navigator/" class="btn btn-primary">Open Navigator</a>
  </div>
  <div class="card-footer">
    Updated for the 2026&ndash;2027 school year
  </div>
</div>
```

Liquid loop rendering a card per row of a list (e.g. an entity list / FetchXML
result), kept brand-consistent:

```liquid
{% for item in items %}
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">{{ item.title }}</h3>
      <p class="card-text">{{ item.summary }}</p>
      <a href="{{ item.url }}" class="btn btn-secondary">View details</a>
    </div>
  </div>
{% endfor %}
```

---

## 4. Footer

```html
<footer class="page-footer" role="contentinfo">
  <div class="container">
    <img class="hisd-header__logo" src="/full-white.svg"
         alt="Houston Independent School District" />
    <nav aria-label="Footer">
      <a href="/privacy/">Privacy</a>
      <a href="/accessibility/">Accessibility</a>
      <a href="/contact/">Contact</a>
    </nav>
  </div>
</footer>
```

---

## 5. Theme toggle script (default OS, manual override, persisted)

Add this **once** per page — best placed near the end of your site's base layout
web template (just before `</body>`), or in a Content Snippet of type *Text/HTML*
that the layout includes. It implements the School Navigator pattern:

- **Default:** follow the OS (`prefers-color-scheme`) — no attribute is set.
- **Manual override:** clicking the toggle sets `data-theme="light"|"dark"` on
  `<html>` and persists the choice to `localStorage`.
- **Persistence:** the saved choice is re-applied on every page load, before
  paint, so there is no flash. "System" clears the override and returns to OS.

```html
<script>
(function () {
  var STORAGE_KEY = "hisd-theme";          // "light" | "dark" | "system"
  var root = document.documentElement;

  // Resolve what the user has chosen (or "system" if nothing saved).
  function savedChoice() {
    try { return localStorage.getItem(STORAGE_KEY) || "system"; }
    catch (e) { return "system"; }
  }

  // Apply a choice: light/dark force a theme; system removes the override.
  function applyTheme(choice) {
    if (choice === "light" || choice === "dark") {
      root.setAttribute("data-theme", choice);
    } else {
      root.removeAttribute("data-theme");   // back to OS preference
    }
    syncToggle(choice);
  }

  // Is the page currently rendering dark? (explicit attr OR OS preference)
  function isDarkNow() {
    var attr = root.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return window.matchMedia &&
           window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Keep the toggle button's label + ARIA state in sync.
  function syncToggle(choice) {
    var btn = document.getElementById("hisd-theme-toggle");
    if (!btn) return;
    var dark = isDarkNow();
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    var label = btn.querySelector(".hisd-theme-toggle__label");
    if (label) {
      label.textContent = dark ? "Dark" : "Light";
    }
    btn.title = "Theme: " + choice + " (click to switch)";
  }

  // Apply the saved choice immediately so there is no flash of the wrong theme.
  applyTheme(savedChoice());

  // Wire up the button + react to OS changes when in "system" mode.
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("hisd-theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        // Toggle relative to what is showing right now, then persist.
        var next = isDarkNow() ? "light" : "dark";
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
        applyTheme(next);
      });
    }
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", function () {
          if (savedChoice() === "system") { syncToggle("system"); }
        });
    }
  });
})();
</script>
```

### Optional: anti-flash snippet for `<head>`

To eliminate any flash of the wrong theme on first paint, also place this tiny
inline script as early as possible in `<head>` (before the stylesheet link). It
only sets the attribute; the full script above still handles the button.

```html
<script>
(function () {
  try {
    var c = localStorage.getItem("hisd-theme");
    if (c === "light" || c === "dark") {
      document.documentElement.setAttribute("data-theme", c);
    }
  } catch (e) {}
})();
</script>
```

### Optional: "System" reset

If you want a three-way control (Light / Dark / System), add a second button or
menu item that clears the override:

```html
<button type="button" class="hisd-theme-toggle" onclick="
  try { localStorage.setItem('hisd-theme','system'); } catch(e) {}
  document.documentElement.removeAttribute('data-theme');
">Use system theme</button>
```
