---
name: Tableside
description: Tableside explains your decisions and lets you inspect the math.
colors:
  primary: "#D4AE62"
  primary-foreground: "#1A1406"
  background: "#0E1311"
  card: "#161D1A"
  popover: "#1B2420"
  muted: "#1E2723"
  secondary: "#26312C"
  border: "#2C3832"
  foreground: "#F3EFE6"
  muted-foreground: "#A9B2AC"
  felt: "#1B5A43"
  felt-deep: "#123F2F"
  felt-glow: "#22704F"
  felt-line: "#EDE4CC99"
  felt-text: "#F1EAD6"
  felt-print: "#E4E1CD"
  table-button: "#0B2A20CC"
  rail: "#3A2A1E"
  paper: "#F6F1E4"
  paper-2: "#EDE6D4"
  paper-border: "#DCD3BE"
  ink: "#1E1A14"
  ink-muted: "#5E574B"
  card-face: "#FBF8F1"
  coach-accent: "#2D6CDF"
  hint-ink: "#2256BD"
  info-ink: "#7FA8F2"
  correct: "#3FA877"
  correct-ink: "#1F7A50"
  mistake: "#E07A5F"
  mistake-ink: "#B4472C"
  suit-spade: "#15171A"
  suit-heart: "#C8312F"
  suit-diamond: "#1F5FBF"
  suit-club: "#1C7A3E"
  chip-1: "#EDE7D8"
  chip-5: "#B83A33"
  chip-25: "#2E7D4F"
  chip-100: "#1D1F22"
  chip-500: "#6A3FA0"
  chip-1k: "#D99A2B"
  scrim: "#000000A6"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "56px"
    fontWeight: 600
  heading:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "32px"
    fontWeight: 500
  section:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
  stat-value:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "34px"
    fontWeight: 500
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  caption-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  eyebrow:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "2px"
  overline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "1px"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-table:
    backgroundColor: "{colors.table-button}"
    textColor: "{colors.felt-text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-lg:
    rounded: "{rounded.md}"
    padding: "0 28px"
    height: "52px"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  badge:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  tag:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
  stat-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.stat-value}"
    rounded: "{rounded.lg}"
    padding: "20px"
  selectable-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "20px"
  toggle-chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  toggle-chip-selected:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
  segmented-track:
    backgroundColor: "{colors.muted}"
    rounded: "12px"
    padding: "4px"
  segmented-option-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "9px"
    height: "40px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "52px"
  notice:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "14px"
  coach-note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "14px 16px 16px 16px"
    width: "358px"
  coach-note-action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  table-top-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    height: "56px"
  app-header:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    height: "68px"
  playing-card:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.suit-spade}"
    rounded: "{rounded.sm}"
  practice-chip:
    rounded: "{rounded.pill}"
    size: "52px"
  sheet:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "20px"
    width: "100%"
  tab-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
  tab-bar-item-selected:
    textColor: "{colors.primary}"
---

# Design System: Tableside

## Overview

**Creative North Star: "The Dealer at Your Shoulder"**

Tableside is a dark card room with a real table at its centre. The table is physical: baize
felt lit from the middle, a walnut rail, and chips, cards and dice drawn as objects you could
pick up. The teaching voice is a dealer standing beside you. It speaks through a note on warm
paper that sits next to the hand rather than covering it, so the reason arrives while the
cards are still on the felt. Everything else (navigation, panels, statistics) is quiet chrome
that makes room for the table and the coach.

The mood is **premium · instructional**.

- **Premium** comes from material and restraint. There is one gold, and it marks action, place
  and money. A Fraunces serif sets headlines and the figures that matter, in cream type on
  near-black.
- **Instructional** comes from the paper layer and from numbers that are always legible and
  traceable.

The interface is clean, legible 2D. It never chases a photorealistic 3D felt or casino-floor
spectacle (ADR-0005); "clean" is still never a licence for a spreadsheet.

The layout is phone-first and comfortably dense. A table screen stacks a top bar and phase
stepper, the felt, a status line, a row of equal-width actions, and the chip rack on its rail.
App screens are one column on phones and open to two or three on desktop inside a 1440 frame.
There is no motion today: state changes are instant.

**Key Characteristics:**

- Near-black green canvas (Night Shift Black), cream type, a single gold accent (House Gold).
- Felt, rail, chips, cards and dice rendered as tactile objects with their own shadows.
- Coach notes on paper with a 4px edge coloured by verdict: Hint Blue, Replay Coral or
  Good-Call Green.
- Fraunces for display and key figures; Inter for everything the player operates.
- App surfaces are separated by tonal steps and 1px hairlines. Shadows belong to objects and
  overlays.
- Every tap target meets the platform minimum: 44pt on iOS and the web, 48dp on Android.
- On iOS and Android the platform's own tab bar, back bars and sheets carry navigation; the
  web keeps its App Header.

## Colors

A night palette with one warm metal, a green table and a cream paper layer for the coach.

### Primary

- **House Gold** (#D4AE62): the colour of action, position and money. It is used for:
  - the one primary button per view;
  - the current Phase Stepper step;
  - the selected chip ring, selected cards and radios;
  - focus rings (`ring` aliases it);
  - the practice bankroll in the Table Top Bar;
  - eyebrows on dark sections ("TRAINER", "THE TABLES").
- **Dark Gold Ink** (#1A1406): text and icons on House Gold.

### Secondary

The table family: every game's felt is drawn from these.

- **Pit Green** (#1B5A43): the felt.
- **Deep Pit Green** (#123F2F): the felt's edge. Every felt is a radial gradient from
  **Lamp-Lit Felt** (#22704F) at the centre to Deep Pit Green at the edge.
- **Chalk Line** (#EDE4CC at 60%): printed lines and bet-spot outlines on the felt.
- **Felt Cream** (#F1EAD6): the brightest felt type: labels on bet spots and Table buttons.
- **Felt Print** (#E4E1CD): every other line of type on the felt, from "BLACKJACK PAYS 3 TO 2"
  to "pays 1:1" and the chip-rack caption. It is Felt Cream tinted 6% toward the felt and fully
  opaque, so it reads 4.6:1 even at the lit centre, where a translucent cream fell to 2–3:1.
- **Felt Shadow Button** (#0B2A20 at 80%): the fill of Table buttons that sit on felt.
- **Walnut Rail** (#3A2A1E): the table's rail and the chip-rack shelf.

### Tertiary

The coach's paper.

- **Coach Paper** (#F6F1E4): coach notes, table tips, the landing page's teaching sections,
  and the selected option inside a segmented control.
- **Paper Shade** (#EDE6D4) and **Paper Edge** (#DCD3BE): secondary paper fills and outlines
  on paper.
- **Coach Ink** (#1E1A14): text on paper, and the solid action button inside a coach note.
- **Faded Ink** (#5E574B): body copy on paper.
- **Card Stock** (#FBF8F1): playing-card faces, slightly whiter than paper so cards read as
  their own object.

### Neutral

- **Night Shift Black** (#0E1311): the page background everywhere, including the static web
  document. Overscroll never flashes white.
- **Night Panel** (#161D1A): panels, stat cards, selectable cards, inputs and toggle chips at
  rest.
- **Raised Panel** (#1B2420): notices and popovers.
- **Quiet Fill** (#1E2723): badges, the active nav item, segmented tracks and icon boxes.
- **Secondary Fill** (#26312C): Secondary buttons.
- **Pit Hairline** (#2C3832): every 1px border and divider on dark surfaces. `input` aliases
  it.
- **Cream Type** (#F3EFE6): primary text on dark.
- **Sage Grey** (#A9B2AC): secondary text, inactive nav, captions (7.9:1 on Night Panel).

### Feedback

- **Good-Call Green** (#3FA877) on dark; **Good-Call Ink** (#1F7A50) on paper.
- **Replay Coral** (#E07A5F) on dark; **Replay Rust** (#B4472C) on paper. Replay Rust is also
  the eyebrow and numeral colour on the landing page's paper sections. The design file also
  defines `destructive` (same value as Replay Coral) and `accent` (#24302B); neither is used
  by the design system today.
- **Hint Blue** (#2D6CDF): the hint coach note's edge, and the strategy chart's "Double" cells.
- **Hint Ink** (#2256BD): hint text and icons on paper (the coach note's "HINT" line, the felt
  tip): Hint Blue darkened to 5.9:1 on Coach Paper.
- **Hint Blue Light** (#7FA8F2): informational text on dark surfaces (the strategy chart's
  "Ds" cells), where Hint Blue is too dark to read.

### Suits and Chips

- **Four-colour deck:** spade #15171A, heart #C8312F, diamond #1F5FBF, club #1C7A3E.
- **Practice chips, by denomination:** 1 #EDE7D8, 5 #B83A33, 25 #2E7D4F, 100 #1D1F22,
  500 #6A3FA0, 1K #D99A2B. A denomination's colour is fixed. Chip 25 green also marks the
  balance dot in the header pill.

### Named Rules

**The House Gold Rule.** Gold means _act here_, _you are here_ or _money_. Use it for the
primary action, the current step, the chosen option and the bankroll. Never use it as
decoration, and give each view only one gold-filled button.

**The Paper Is the Coach Rule.** Paper carries the teaching voice: coach notes, table tips and
the landing page's teaching sections. Inside a control, paper marks the one chosen option.
Nothing else sits on paper.

**The Four-Colour Deck Rule.** Suits are always four colours. Hearts and diamonds never share
red; a glance must separate them.

**The One Ink Rule.** The felt prints in one opaque ink, Felt Print. Small felt type ranks by
size, weight and tracking, never by fading the ink: translucent cream on lit green fails.

**The Named Literal Rule.** Screens never carry a raw hex value. Design variables come from
`colors`. A design literal gets a name in `surfaces` or `marketing`, or in a game's own map:
`felt` for blackjack, `craps`, `live`, `machine` for the video poker cabinet, and baccarat's
`palette`.

## Typography

**Display Font:** Fraunces (with Georgia, serif)
**Body Font:** Inter (with system-ui, sans-serif)

**Character:** Fraunces is a soft, slightly old-style serif with real weight. It gives
headlines and key numbers the feel of a menu or wager slip. Inter is neutral, sturdy and very
legible at small sizes, so every control and line of guidance stays plain.

On native, weight is chosen by face name (`Fraunces_600SemiBold`, `Inter_700Bold`) through
`ui()` and `display()`, never by `fontWeight`; setting both makes browsers fake-bold a real
face. The bundled faces are Fraunces 400/500/600 and Inter 400/500/600/700/800.

### Hierarchy

- **Display** (Fraunces 600, 56px): page titles on desktop ("Tableside" on the system sheet).
  The landing page's hero takes this face larger.
- **Heading** (Fraunces 500, 32px): the base for screen titles and section headlines. Screens
  scale it between 30 and 48 at the same weight; for example, Progress uses 36, and the
  landing page's sections use 44 (34 on narrow screens).
- **Section** (Fraunces 400, 24px): sub-section headings ("Components", "Your games").
- **Stat Value** (Fraunces 500, 34px): the figures that matter: decision accuracy, level,
  drill numerals ("01").
- **Title** (Inter 600, 20px): card and option titles.
- **Body** (Inter 400, 16px / 24px): running copy, onboarding answers, inputs.
- **Body Small** (Inter 400, 14px / 20px): coach-note bodies, descriptions, secondary
  paragraphs.
- **Button** (Inter 600, 15px): button labels (14px small, 16px large).
- **Label** (Inter 500, 13px): field labels, stat-card labels, segment labels.
- **Caption** (Inter 400/500, 12px): metadata, rules lines under a table title, deltas.
- **Eyebrow** (Inter 600, 12px, 2px tracking, uppercase): section kickers in gold on dark or
  rust on paper.
- **Overline** (Inter 700, 11px, 1px tracking, uppercase): micro-labels such as "PRACTICE"
  over the bankroll and the coach note's verdict line. 11 is the floor for words; only marks
  printed on a game object (a chip's value, the craps puck's ON) go smaller.

### Text Scaling

Text follows the system size (Dynamic Type, Android font scale). Page copy, coach notes and
fields scale freely and their containers grow with them: controls set a minimum height, never a
fixed one. Text inside fixed table geometry is capped with `maxFontSizeMultiplier` from
`textScale`:

- **felt** (1.3×): everything printed on the felt, bet spots and the chip-rack caption;
- **control** (1.6×): button labels, the Phase Stepper, segments and the Table Top Bar;
- **1×**: marks printed on an object, such as a chip's denomination. These are read aloud through
  the object's accessible label.

### Named Rules

**The Serif Counts Rule.** Fraunces sets headlines and the numbers worth remembering.
Everything the player taps, reads mid-hand or types is Inter.

**The Fixed Felt Rule.** The felt is a drawing, not a layout: its type is capped at 1.3× so
the table keeps its shape at any text size, and everything around the felt (bars, actions,
notes) grows instead.

**The 16 Floor Rule.** Running body copy is never smaller than 16px; the system sheet sets
this as the minimum for older readers. Use 14px and below only for secondary lines, captions
and labels.

## Layout

- **Spacing:** a 4pt scale (4, 8, 12, 16, 24, 32, 48, 64). Component gaps are mostly 8–16;
  panels pad 20–24.
- **Pages:** app pages sit in a column capped at 1440, padded 32 / 32 / 48 on desktop. Below
  640 wide the padding becomes a 16pt gutter with 20 at the top.
- **Navigation on iOS and Android:** the five areas (Lobby, Trainer, Strategies, Live,
  Progress) are the platform's own tab bar (`app/(tabs)`): UITabBar with SF Symbols, Liquid
  Glass on iOS 26; the Material navigation bar with Material Symbols on Android, every label
  shown and the active pill in Secondary Fill. Each tab is a native stack: its root screen has
  no bar and draws its own Fraunces title, and a screen pushed inside the tab gets the
  platform's back bar. Games, Play and onboarding open over the tabs, full screen, with their
  own Table Top Bar or step header. An installed app opens on onboarding or the Lobby, never on
  the landing page.
- **App header (web):**
  - full nav labels at 1040 wide and above;
  - icons only below 1040;
  - below 640 the wordmark and the avatar go and the chip pill shortens to the number.

- **Content breakpoints:** observed across screens at 640 (narrow), 760, 900 (two columns) and
  1040–1200 (wide). Width is measured after mount (`onLayout`), never during render, so the
  static web export hydrates cleanly.
- **Table screens:** a fixed vertical order, top to bottom:
  1. Table Top Bar (56): back, game and rules line, bankroll, rules book;
  2. Phase Stepper;
  3. the felt;
  4. a "LAST" status line;
  5. a row of three equal-width actions (Clear, Rebet, Deal);
  6. the chip rack on its walnut shelf, flush with the bottom.

  The coach note and tips appear on or beside the felt, never over the cards.

- **Sheets:** every modal panel is the shared `Sheet` (see Components): up to 560 wide (430
  for game rules, 720 for the bug report) and 88–92% tall.
- **Insets:** the top inset is the root's; the bottom inset belongs to each screen. The native
  tab bar draws its own, and screens pushed over the tabs pad for the home indicator.
- **Keyboard:** scrolling pages adjust their insets so a focused field stays above the
  keyboard (iOS); sheets rise with it.
- **Tap targets:** at least `MIN_TAP`: 44pt on iOS and the web, 48dp on Android. A smaller
  visual (36pt button, 40pt segment, 36pt tab) makes up the difference with `hitSlop`.
  Roulette's number cells are 44pt tall, the board's densest row.

## Elevation & Depth

App surfaces are flat and layered by tone: Night Shift Black under Night Panel under Raised
Panel, each edge drawn with a 1px Pit Hairline. Shadows mark two things:

- **physical table objects:** chips, cards, dice, the coach note and the roulette loupe;
- **layers above the page:** sheets take the Loupe shadow; menus and popovers may take the
  Note shadow.

In-flow panels, stat cards and list rows never cast a shadow.

### Shadow Vocabulary

- **Chip** (`box-shadow: 0px 2px 4px #00000066`): a practice chip resting on felt or on the
  rack.
- **Card** (`box-shadow: 0px 2px 6px #00000055`): a playing card on the felt.
- **Note** (`box-shadow: 0px 8px 24px #00000066`): the coach note; also the strength for
  popovers and menus.
- **Die** (`box-shadow: 0px 4px 8px #00000088`): a thrown die.
- **Loupe** (`box-shadow: 0px 12px 32px #000000AA`): the roulette bet loupe; also the strength
  for sheets.
- **Pill** (`box-shadow: 0px 6px 18px #00000066`): a raised pill floating over the landing
  page's hero table.

### Named Rules

**The Lift Has a Reason Rule.** A shadow means one of two things: this is an object on the
table, or this is a layer above the page. If it is neither, it is flat.

## Shapes

- **Corners:** gently rounded throughout.
  - 6px (sm) for playing cards;
  - 10px (md) for buttons, inputs, notices, nav items and coach-note actions;
  - 16px (lg) for panels, stat cards, selectable cards and the coach note;
  - pill for badges, tags, toggle chips and the balance pill.
- **One-off radii:** segmented and tab tracks use 12 with 8–9 inside; icon boxes use 12;
  sheets use 20 on their top corners.
- **Circles:** chips, avatars and radio dots.
- **The table's silhouette:** the blackjack felt is a wide arch, flat at the top and curving
  at the bottom, ringed by the walnut rail. Roulette and craps run a rectangular felt edge
  to edge, with the layout printed on it.
- **Bet spots:** Chalk Line outlines on the felt, with a near-invisible white wash inside.
- **The coach note** is the one asymmetric shape: square-feeling on three sides, with a 4px
  coloured edge on the left.

## Components

**The Tactile Felt, Quiet Chrome Rule.** Objects on the table look physical: chips have edge
spots and an inlay, and cards have card stock and a hairline edge. Felt is lit from the
centre, and these objects carry shadows. The chrome around the table stays flat, hairlined
and restrained, so the eye goes to the table and the coach.

### Buttons

- **Shape:** gently rounded (10px). Minimum heights are 36 (sm), 44 (md, the default) and 52
  (lg, onboarding Back/Continue); a button grows with its label at large text sizes, and the
  label is capped at 1.6×. Horizontal padding is 14 / 20 / 28.
- **Primary:** House Gold with Dark Gold Ink, Inter 600 15px, an optional 18px leading icon.
  One per view.
- **Secondary:** Secondary Fill with a 1px Pit Hairline and Cream Type.
- **Ghost:** transparent, Cream Type. Used for low-emphasis actions such as "See the coach in
  40s".
- **Table:** Felt Shadow Button fill with a Chalk Line border and Felt Cream text. For
  buttons that sit on the felt.
- **Pressed:** 85% opacity. There is no hover treatment today.
- **Disabled:** 45% opacity, only for actions that are genuinely unavailable (Deal with no
  bet). A legal player action is never disabled.

### Badges and Tags

- **Badge:** a Quiet Fill pill (4 / 10 padding) with a 12px icon and a 12px medium label.
  Its tone (muted, gold, correct, mistake) colours the icon and label, never the fill.
- **Tag:** a House Gold pill with Dark Gold Ink ("Best for trip prep").

### Selection Controls

- **Toggle chip:** a 44pt pill on Night Panel with a hairline border. Selected, it inverts to
  Cream Type fill with Night Shift Black ink and a leading check. It behaves as a checkbox.
- **Segmented control:**
  - equal-width 40pt segments on a Quiet Fill track (12 radius, 4 padding);
  - the chosen segment is Coach Paper with Coach Ink;
  - the others are Sage Grey text;
  - it behaves as a radio group.
- **Tabs:** content-width tabs in a hairlined Night Panel track. The chosen tab sits on Quiet
  Fill, and the row scrolls sideways rather than wrapping.
- **Selectable card:** a large radio option on Night Panel with a 48pt icon box, title,
  description and radio dot. Selected, it takes a 2px gold border, a gold wash (#D4AE62 at
  8%), a gold icon box and a filled gold dot. Its padding drops by 1 so the content does not
  shift.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** Night Panel.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Pit Hairline.
- **Internal Padding:** 24 for panels (16 gap), 20 for stat cards and selectable cards.
- **Panel title row:** an Inter 600 17px title with a right-aligned muted aside ("This
  month").
- **Stat Card:** a 13px label, a Stat Value figure, and a 12px delta line with a 14px trend
  icon in the delta tone.
- **List Row:** a label in Sage Grey, the value in Cream Type or a feedback tone, and a
  hairline under each row.

### Inputs / Fields

- **Style:** 52pt tall, Night Panel fill, 1px Pit Hairline, 10px radius, 16px horizontal
  padding, Body (16px) text in Cream Type. Placeholders are Sage Grey.
- **Focus:** the border turns House Gold (`ring`) at 1.5px.
- **Error:** the border turns Replay Coral, with the reason in text below.
- **Dates:** on iOS and Android a date is the system date picker (iOS's compact control, the
  Material date dialog), which cannot produce a malformed or past date. The web keeps a typed
  `YYYY-MM-DD` field with inline validation.

### Navigation

- **Tab bar (iOS, Android):** the system tab bar described in Layout. Selected items are House
  Gold; the rest are Sage Grey.
- **Back bar (iOS, Android):** the platform's navigation bar on screens pushed inside a tab:
  Night Shift Black, no hairline, a back chevron (iOS shows its minimal glass button), no title.
  Edge-swipe back on iOS and system Back on Android always work.
- **App Header** (web, 68 tall):
  - left to right: the logo (a gold rounded square with a spade, plus the Fraunces wordmark),
    the five destinations (Lobby, Trainer, Strategies, Live tables, Progress), the practice
    chip pill, notifications and the avatar;
  - inactive items are Sage Grey with a 16px icon;
  - the active item is Cream Type on Quiet Fill with `aria-current="page"`;
  - it collapses as described in Layout.
- **Table Top Bar** (56 tall): a 44pt back chevron, the game title (Inter 600 16) over a
  two-line rules caption, then the bankroll and a 44pt rules-book button. The bankroll is a
  "PRACTICE" overline over a gold amount, which turns Good-Call Green while a payout lands.
- **Phase Stepper:** equal steps, each a 3px bar above an 11px numbered label.
  - The current step has a solid gold bar and a bold Cream Type label.
  - Finished steps have gold at 40% and a muted label.
  - Steps still to come sit on Pit Hairline.

### Sheet

The one modal surface: table panels, rules, the bug report.

- **Surface:** Raised Panel, 20pt top corners, a 1px Pit Hairline, the Loupe shadow, over a
  black scrim at 65%. Its bottom edge clears the home indicator.
- **Motion:** it rises 260ms with an ease-out curve while the scrim fades; with Reduce Motion
  it appears in place.
- **Closing:** a visible Close or Done in its header, a tap on the scrim, Back on Android,
  Escape on the web, and on iOS and Android a drag down on the grabber (a 36×5 pill at the
  top). A drag past 96pt, or a quick flick, dismisses.
- **Keyboard:** it lifts above the keyboard.

### Notice

An in-place statement of something this build cannot do, or of the context in play (the
strategy under test). It is a Raised Panel with a 1px House Gold border, 10px radius and 14
padding, a gold info icon, a 14px semibold title and a 13px muted body. It has an optional
dismiss button and is announced politely.

### Coach Note (signature)

The dealer's note: the North Star made concrete.

- **Surface:** Coach Paper, 16 radius, a 4px left edge in the verdict colour, the Note
  shadow, 358 wide (or full width).
- **Header:** a 32pt dealer portrait, the name in 13px semibold Coach Ink, an Overline verdict
  line in the verdict ink, and an 18px verdict icon.
  - **Hint:** "HINT · BASIC STRATEGY", lightbulb, Hint Blue edge with Hint Ink.
  - **Mistake:** "LET'S REPLAY THAT", rotate-back icon, Replay Coral edge with Replay Rust
    ink.
  - **Good call:** "GOOD CALL", check icon, Good-Call Green edge with Good-Call Ink.
- **Content:** a 17px bold title that states the move ("Hit. 12 against a dealer 7 is a hit.")
  and a 14px Faded Ink body with the why.
- **Actions:** up to two, on one row. The solid one is Coach Ink with paper text; the outlined
  one has a Paper Edge border. A long label wraps inside its button rather than pushing the
  other to a new row.

### Table Objects (signature)

- **Practice chip:** a 52pt disc in its denomination colour, with six white edge spots, a
  thin inner inlay ring and the value in Inter 800. It casts the Chip shadow. Selectable,
  it sits in a slot that shows a 2.5px House Gold ring.
- **Chip rack:** the chips in a row on the Walnut Rail shelf, with a caption under them ("$25
  selected · tap a spot to bet, long-press to remove").
- **Playing card:** Card Stock face, 6px radius, a hairline edge and the Card shadow. The rank
  is Inter 800 and the suit glyph sits top-left, with a larger glyph bottom-right. Cards come
  in three sizes. The card back is an oxblood gradient (#7A2E2A to #5B1F1C) with a gold-tinted
  inner line.
- **Felt:** a radial light from the centre to the edge, Chalk Line markings, rules text in
  Felt Print set in Fraunces caps with wide tracking, and bet spots outlined in Chalk Line.
- **Dice:** red rounded cubes with white pips and the Die shadow.
- **Per-game cabinets:** video poker swaps felt for a dark-blue cabinet gradient (#14233F to
  #0C1428) with a gold pay table. The paper-selected segments and House Gold primary action
  are unchanged.

## Do's and Don'ts

### Do:

- **Do** import colours, spacing, radii and type from `@/ui/ds` (`colors`, `space`, `radius`,
  `type`, `ui()`, `display()`), and name any new design literal in `surfaces`, `marketing` or
  the game's own palette map.
- **Do** keep House Gold to the one primary action, the current step, the chosen option and
  the bankroll.
- **Do** put the coach's voice on Coach Paper with a 4px verdict edge, beside the hand and
  never covering the cards.
- **Do** keep every tap target at least `MIN_TAP` (44pt iOS and web, 48dp Android), using
  `hitSlop` when the visual is smaller.
- **Do** select type weight by face name through `ui()` / `display()`, never `fontWeight`.
- **Do** use Hint Blue Light (#7FA8F2) for informational text on dark surfaces and Hint Ink
  (#2256BD) for hint text on paper.
- **Do** open every modal panel with `Sheet`, so Back, the scrim, the grabber and the keyboard
  behave the same everywhere.
- **Do** give text containers a minimum height, never a fixed one, and cap text only through
  `textScale` where geometry is fixed.

### Don't:

- **Don't** put a raw hex value in a screen file.
- **Don't** set Hint Blue (#2D6CDF) as text. It reaches only 4.3:1 on Coach Paper and 3.5:1 on
  Night Panel; use Hint Ink on paper and Hint Blue Light on dark.
- **Don't** fade felt type with alpha; use Felt Print.
- **Don't** draw the App Header or any web-style global navigation on iOS or Android.
- **Don't** grey out or hide a legal player action to steer the player. Disabled styling is
  only for actions that are genuinely unavailable.
- **Don't** render a photorealistic 3D felt or casino-floor spectacle. The table is clean,
  legible 2D.
- **Don't** add shadows to in-flow panels, stat cards or list rows.
- **Don't** use gold as decoration, or put two gold-filled buttons in one view.
- **Don't** set running body copy below 16px.
