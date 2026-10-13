/**
 * The pieces the three Strategy Builders share (frames RYP9O, GYRRl, D0h320): the builder
 * head (breadcrumb, title, draft badge, attribution bar, actions), the 4-step rail, the
 * inspector's building blocks, and the notes and notices.
 */

import { Link, router } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Badge,
  Button,
  CoachNote,
  colors,
  display,
  MIN_TAP,
  radius,
  ui,
  icons as ds,
} from "@/ui/ds";
import { NOTE_LIMIT, type StrategyCredit } from "@/state/strategies";
import {
  ArrowRight,
  ChevronRight,
  CircleAlert,
  Eye,
  Info,
  Link as LinkIcon,
  Minus,
  Pencil,
  Plus,
  Send,
} from "./icons";
import { builder } from "./palette";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Below this content width the rail, editor and inspector stack. */
export const WIDE = 1100;

/**
 * Head + workspace. Measures its own width after mount (hydration-safe) to choose between the
 * design's three columns and a stacked phone layout.
 */
export function BuilderLayout({
  head,
  rail,
  children,
  inspector,
}: {
  head: (bleed: number, wide: boolean) => ReactNode;
  rail: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const wide = width === null || width >= WIDE;
  const bleed = width !== null && width < 600 ? 16 : 32;
  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {head(bleed, wide)}
      <View style={[styles.workspace, wide ? styles.row : styles.column]}>
        <View style={wide ? styles.rail : undefined}>{rail}</View>
        <View style={wide ? styles.center : undefined}>{children}</View>
        {inspector ? <View style={wide ? styles.inspector : undefined}>{inspector}</View> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

function savedLabel(savedAt: string | null, readOnly: boolean): string {
  if (readOnly) return "Example · read-only";
  if (!savedAt) return "Draft · autosaves as you edit";
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return "Draft · autosaved";
  return `Draft · autosaved ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function BuilderHead({
  bleed,
  wide = true,
  title,
  savedAt,
  readOnly,
  forkedFrom,
  changes,
  compareOpen,
  onCompare,
  onShare,
  testHref,
  onSubmit,
  onFork,
  onRename,
}: {
  bleed: number;
  wide?: boolean;
  title: string;
  savedAt: string | null;
  readOnly: boolean;
  forkedFrom: StrategyCredit | null;
  changes: number;
  compareOpen: boolean;
  onCompare: () => void;
  onShare: () => void;
  testHref: string;
  onSubmit: () => void;
  onFork: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const commit = () => {
    setEditing(false);
    const next = draftTitle.trim();
    if (next && next !== title) onRename(next);
  };
  return (
    <View
      style={[
        styles.head,
        { marginHorizontal: -bleed, marginTop: -bleed, paddingHorizontal: bleed },
      ]}
    >
      <View style={styles.crumbs} role="navigation" accessibilityLabel="Breadcrumb">
        <Link href="/strategies" style={[ui(13), { color: colors.mutedForeground }]}>
          Strategies
        </Link>
        <ChevronRight size={14} color={colors.mutedForeground} />
        <Link href="/strategies" style={[ui(13), { color: colors.mutedForeground }]}>
          {readOnly ? "Library" : "My strategies"}
        </Link>
        <ChevronRight size={14} color={colors.mutedForeground} />
        <Text style={[ui(13, 500), { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={[styles.titleRow, !wide && styles.titleRowNarrow]}>
        <View style={styles.titleCol}>
          <View style={styles.titleLine}>
            {editing ? (
              <TextInput
                accessibilityLabel="Strategy name"
                value={draftTitle}
                onChangeText={setDraftTitle}
                autoFocus
                maxLength={60}
                onBlur={commit}
                onSubmitEditing={commit}
                style={[display(30, 500), styles.titleInput]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Rename ${title}`}
                disabled={readOnly}
                style={styles.shrink}
                onPress={() => {
                  setDraftTitle(title);
                  setEditing(true);
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={[display(30, 500), { color: colors.foreground }]}
                >
                  {title}
                </Text>
              </Pressable>
            )}
            <Badge label={savedLabel(savedAt, readOnly)} icon={Pencil} />
          </View>
          {forkedFrom || !readOnly ? (
            <View style={[styles.attribution, wide && styles.attributionWide]}>
              <ds.GitFork size={16} color={colors.primary} />
              {forkedFrom ? (
                <View style={[styles.credit, wide && styles.creditWide]}>
                  <Text
                    style={[ui(13, 500), styles.shrink, { color: colors.foreground }]}
                    numberOfLines={wide ? 1 : undefined}
                  >
                    Forked from {forkedFrom.title}
                  </Text>
                  <Text style={[ui(13, 500), styles.noShrink, { color: colors.foreground }]}>
                    {` by ${forkedFrom.author} · v${forkedFrom.version}`}
                  </Text>
                </View>
              ) : (
                <Text style={[ui(13, 500), { color: colors.foreground }]}>Your own strategy</Text>
              )}
              {forkedFrom ? (
                <>
                  {/* The dot only joins two phrases on one line; wrapped, it would be orphaned. */}
                  {wide ? <Text style={[ui(13), { color: colors.mutedForeground }]}>·</Text> : null}
                  <Text
                    style={[ui(13), styles.noShrink, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    Credit is shown on every copy
                  </Text>
                </>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Compare (${changes} ${changes === 1 ? "change" : "changes"})`}
                aria-expanded={compareOpen}
                onPress={onCompare}
                hitSlop={10}
                style={styles.noShrink}
              >
                <Text style={[ui(13, 600), { color: colors.primary }]}>
                  Compare ({changes} {changes === 1 ? "change" : "changes"})
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {readOnly ? (
            <Button label="Fork to edit" icon={ds.GitFork} onPress={onFork} />
          ) : (
            <>
              <Button label="Share draft" variant="ghost" icon={LinkIcon} onPress={onShare} />
              <Button
                label="Test in trainer"
                variant="secondary"
                icon={ds.Play}
                onPress={() => router.push(testHref)}
              />
              <Button label="Submit to community" icon={Send} onPress={onSubmit} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compare, share and submit panels (under the head)
// ---------------------------------------------------------------------------

export interface ChangeItem {
  readonly key: string;
  readonly title: string;
  readonly from: string;
  readonly to: string;
}

export function ComparePanel({
  original,
  changes,
  onPick,
  onClose,
}: {
  original: string;
  changes: readonly ChangeItem[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheet} accessibilityLabel="Compare with the original">
      <View style={styles.sheetHead}>
        <Text style={[ui(15, 600), { color: colors.foreground }]}>Compared with {original}</Text>
        <Button label="Close" size="sm" variant="ghost" onPress={onClose} />
      </View>
      {changes.length === 0 ? (
        <Text style={[ui(13), { color: colors.mutedForeground }]}>No changes yet.</Text>
      ) : (
        changes.map((c) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}: ${c.from} to ${c.to}`}
            onPress={() => onPick(c.key)}
            style={styles.changeRow}
          >
            <Text style={[ui(13, 600), styles.flex, { color: colors.foreground }]}>{c.title}</Text>
            <Text style={[ui(13), { color: colors.mutedForeground }]}>{c.from}</Text>
            <ArrowRight size={14} color={colors.mutedForeground} />
            <Text style={[ui(13, 600), { color: colors.primary }]}>{c.to}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

export function SharePanel({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const copy = () => {
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clip) {
      setCopied("manual");
      return;
    }
    clip.writeText(text).then(
      () => setCopied("copied"),
      () => setCopied("manual"),
    );
  };
  return (
    <View style={styles.sheet} accessibilityLabel="Share draft">
      <View style={styles.sheetHead}>
        <Text style={[ui(15, 600), { color: colors.foreground }]}>Share this draft</Text>
        <Button label="Close" size="sm" variant="ghost" onPress={onClose} />
      </View>
      <Text style={[ui(13, 400, { lineHeight: 19 }), { color: colors.mutedForeground }]}>
        There is no server in this build, so sharing is a copy: paste this JSON anywhere. It carries
        the credit to the original author and every coach note.
      </Text>
      <TextInput
        accessibilityLabel="Draft export"
        value={text}
        editable={false}
        multiline
        style={[ui(12), styles.export]}
      />
      <View style={styles.row8}>
        <Button label="Copy JSON" size="sm" variant="secondary" onPress={copy} />
        {copied !== "idle" ? (
          <Text
            style={[
              ui(13),
              { color: copied === "copied" ? colors.correct : colors.mutedForeground },
            ]}
          >
            {copied === "copied"
              ? "Copied to the clipboard."
              : "Select the text above and copy it."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** "Submit to community": the rules check's verdict, then the honest no-backend notice. */
export function SubmitPanel({
  ok,
  title,
  body,
  onClose,
}: {
  ok: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.sheet} accessibilityLabel="Submit to community" role="alert">
      <View style={styles.sheetHead}>
        <Text style={[ui(15, 600), { color: colors.foreground }]}>Submit to community</Text>
        <Button label="Close" size="sm" variant="ghost" onPress={onClose} />
      </View>
      <EngineCheck ok={ok} title={title} body={body} />
      <InfoNote
        text={
          ok
            ? "Community sharing isn't available in this build: there is no server yet, so nothing was sent. Your draft stays on this device, and Share draft gives you a copy to pass around."
            : "Nothing was sent. Fix the flagged items first; community sharing isn't available in this build anyway, since there is no server yet."
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step rail
// ---------------------------------------------------------------------------

export interface Step {
  readonly title: string;
  readonly detail: string;
}

export function StepRail({
  steps,
  active,
  onSelect,
  footer,
}: {
  steps: readonly Step[];
  active: number;
  onSelect: (index: number) => void;
  footer: string;
}) {
  return (
    <View style={styles.steps} accessibilityRole="tablist" accessibilityLabel="Builder steps">
      {steps.map((s, i) => {
        const on = i === active;
        const done = i === 0 && !on;
        return (
          <Pressable
            key={s.title}
            accessibilityRole="tab"
            accessibilityLabel={`Step ${i + 1}: ${s.title}`}
            aria-selected={on}
            onPress={() => onSelect(i)}
            style={[styles.step, on && { backgroundColor: colors.muted }]}
          >
            <View
              style={[
                styles.stepN,
                done
                  ? { backgroundColor: colors.correct }
                  : on
                    ? { backgroundColor: colors.primary }
                    : styles.stepTodo,
              ]}
            >
              {done ? (
                <ds.Check size={14} color={builder.doneInk} strokeWidth={2.5} />
              ) : (
                <Text
                  style={[
                    ui(13, 700),
                    { color: on ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            <View style={styles.flex}>
              <Text
                style={[
                  ui(14, 600),
                  { color: on || done ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {s.title}
              </Text>
              <Text style={[ui(12), { color: colors.mutedForeground }]}>{s.detail}</Text>
            </View>
          </Pressable>
        );
      })}
      <View style={styles.railNote}>
        <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>
          Works the same for every game
        </Text>
        <Text style={[ui(12, 400, { lineHeight: 18 }), { color: colors.mutedForeground }]}>
          {footer}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cards and inspector parts
// ---------------------------------------------------------------------------

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function InspectorHead({
  eyebrow,
  title,
  original,
  yours,
}: {
  eyebrow: string;
  title: string;
  original?: string;
  yours?: string;
}) {
  return (
    <View style={styles.gap4}>
      <Text style={[ui(10, 700, { letterSpacing: 1.2 }), { color: colors.mutedForeground }]}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text accessibilityRole="header" style={[display(22, 500), { color: colors.foreground }]}>
        {title}
      </Text>
      {original || yours ? (
        <View style={styles.original}>
          {original ? (
            <Text style={[ui(13), { color: colors.mutedForeground }]}>{original}</Text>
          ) : null}
          {original && yours ? <ArrowRight size={14} color={colors.mutedForeground} /> : null}
          {yours ? <Text style={[ui(13, 600), { color: colors.primary }]}>{yours}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={[ui(13, 600), { color: colors.foreground }]}>{children}</Text>;
}

export function Eyebrow({ children, aside }: { children: string; aside?: string }) {
  return (
    <View style={styles.eyebrowRow}>
      <Text style={[ui(11, 700, { letterSpacing: 1.2 }), { color: colors.mutedForeground }]}>
        {children.toUpperCase()}
      </Text>
      {aside ? <Text style={[ui(12), { color: colors.mutedForeground }]}>{aside}</Text> : null}
    </View>
  );
}

/** The paper-on-muted segmented control of the inspectors (height 36, 12pt labels). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segTrack} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            aria-checked={on}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            style={[styles.seg, on && { backgroundColor: colors.paper }]}
          >
            <Text
              style={[ui(12, on ? 700 : 500), { color: on ? colors.ink : colors.mutedForeground }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  label,
  onMinus,
  onPlus,
}: {
  value: string;
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Less: ${label}`}
        onPress={onMinus}
        style={styles.stepBtn}
      >
        <Minus size={16} color={colors.foreground} />
      </Pressable>
      <View style={styles.stepValue} accessibilityLabel={`${label}: ${value}`}>
        <Text style={[ui(16, 700), { color: colors.foreground }]}>{value}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More: ${label}`}
        onPress={onPlus}
        style={styles.stepBtn}
      >
        <Plus size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

export function EngineCheck({
  ok,
  title,
  body,
  warn = false,
}: {
  ok: boolean;
  title: string;
  body: string;
  /** Allowed, but worth knowing: amber instead of red. */
  warn?: boolean;
}) {
  const tone = ok ? colors.correct : warn ? colors.primary : colors.mistake;
  const wash = ok ? builder.correctWash : warn ? builder.primaryWash : builder.mistakeWash;
  return (
    <View
      role="status"
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.check, { backgroundColor: wash }]}
    >
      {ok ? <ds.BadgeCheck size={18} color={tone} /> : <CircleAlert size={18} color={tone} />}
      <View style={[styles.flex, styles.gap2]}>
        <Text style={[ui(13, 600), { color: tone }]}>{title}</Text>
        {body ? (
          <Text style={[ui(12, 400, { lineHeight: 17 }), { color: colors.mutedForeground }]}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** "What the coach says when someone misses it": a 160-character note with a live preview. */
export function CoachNoteEditor({
  value,
  onChange,
  previewTitle,
  readOnly,
}: {
  value: string;
  onChange: (text: string) => void;
  previewTitle: string;
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState(false);
  return (
    <View style={styles.gap8}>
      <Label>What the coach says when someone misses it</Label>
      <View style={[styles.textarea, focused && { borderColor: colors.ring, borderWidth: 1.5 }]}>
        <TextInput
          accessibilityLabel="Coach note"
          value={value}
          editable={!readOnly}
          onChangeText={(t) => onChange(Array.from(t).slice(0, NOTE_LIMIT).join(""))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          maxLength={NOTE_LIMIT}
          placeholder="Explain the change in a sentence or two."
          placeholderTextColor={colors.mutedForeground}
          style={[ui(14, 400, { lineHeight: 21 }), styles.textInput]}
        />
        <Text style={[ui(11), { color: colors.mutedForeground }]}>
          {Array.from(value).length} / {NOTE_LIMIT}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={preview ? "Hide preview" : "Preview as coach note"}
        onPress={() => setPreview((p) => !p)}
        style={styles.previewLink}
        hitSlop={10}
      >
        <Eye size={14} color={colors.mutedForeground} />
        <Text style={[ui(12, 600), { color: colors.mutedForeground }]}>
          {preview ? "Hide preview" : "Preview as coach note"}
        </Text>
      </Pressable>
      {preview ? (
        <CoachNote
          variant="mistake"
          title={previewTitle}
          body={value || "Your note appears here."}
          width="100%"
        />
      ) : null}
    </View>
  );
}

export function ChangeNav({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.footer}>
      <Text style={[ui(13), { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.row8}>
        <Button
          label=""
          accessibilityLabel="Previous"
          variant="secondary"
          size="sm"
          icon={ds.ChevronLeft}
          onPress={onPrev}
          style={styles.navBtn}
        />
        <Button
          label=""
          accessibilityLabel="Next"
          variant="secondary"
          size="sm"
          icon={ChevronRight}
          onPress={onNext}
          style={styles.navBtn}
        />
      </View>
    </View>
  );
}

/** The paper "honesty note" with the coach-blue edge. */
export function InfoNote({ text }: { text: string }) {
  return (
    <View style={styles.note} role="note">
      <Info size={18} color={colors.coachAccent} />
      <Text style={[ui(13, 400, { lineHeight: 19 }), styles.flex, { color: colors.ink }]}>
        {text}
      </Text>
    </View>
  );
}

/** A small rounded pill button ("Half", "1 unit", "Add rule" choices…). */
export function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-pressed={on}
      onPress={onPress}
      hitSlop={8}
      style={[styles.pill, on && { borderColor: colors.primary }]}
    >
      <Text style={[ui(12, 500), { color: on ? colors.primary : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Explain your changes
// ---------------------------------------------------------------------------

export function ExplainStep({
  changes,
  notes,
  onNote,
  readOnly,
}: {
  changes: readonly ChangeItem[];
  notes: Readonly<Record<string, string>>;
  onNote: (key: string, text: string) => void;
  readOnly: boolean;
}) {
  const written = changes.filter((c) => notes[c.key]).length;
  return (
    <Card>
      <View style={styles.gap4}>
        <Text accessibilityRole="header" style={[ui(18, 600), { color: colors.foreground }]}>
          Explain your changes
        </Text>
        <Text style={[ui(13), { color: colors.mutedForeground }]}>
          {written} of {changes.length} notes written. Learners see your note when they miss one of
          these.
        </Text>
      </View>
      {changes.length === 0 ? (
        <Text style={[ui(14), { color: colors.mutedForeground }]}>
          No changes yet. Edit the strategy in step 2, then explain each change here.
        </Text>
      ) : (
        changes.map((c) => (
          <View key={c.key} style={styles.explainRow}>
            <View style={styles.original}>
              <Text style={[ui(14, 600), { color: colors.foreground }]}>{c.title}</Text>
              <Text style={[ui(13), { color: colors.mutedForeground }]}>{c.from}</Text>
              <ArrowRight size={14} color={colors.mutedForeground} />
              <Text style={[ui(13, 600), { color: colors.primary }]}>{c.to}</Text>
            </View>
            <CoachNoteEditor
              value={notes[c.key] ?? ""}
              onChange={(t) => onNote(c.key, t)}
              previewTitle={c.title}
              readOnly={readOnly}
            />
          </View>
        ))
      )}
    </Card>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "mistake" | "correct";
}) {
  return (
    <View style={styles.tile} accessibilityLabel={`${label}: ${value}. ${sub}`}>
      <Text style={[ui(12), { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          display(22, 500),
          {
            color:
              tone === "mistake"
                ? colors.mistake
                : tone === "correct"
                  ? colors.correct
                  : colors.foreground,
          },
        ]}
      >
        {value}
      </Text>
      <Text style={[ui(11), { color: colors.mutedForeground }]}>{sub}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  workspace: { marginTop: 24, gap: 24 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  column: { flexDirection: "column" },
  rail: { width: 240 },
  center: { flex: 1, minWidth: 0, gap: 16 },
  inspector: { width: 360 },
  head: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 14,
  },
  crumbs: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  titleRowNarrow: { flexDirection: "column", alignItems: "flex-start" },
  titleCol: { gap: 10, flexShrink: 1 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  titleInput: {
    color: colors.foreground,
    borderBottomWidth: 1,
    borderBottomColor: colors.ring,
    minWidth: 320,
    paddingVertical: 0,
  },
  shrink: { flexShrink: 1 },
  credit: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1 },
  creditWide: { flexWrap: "nowrap" },
  noShrink: { flexShrink: 0 },
  attributionWide: { flexWrap: "nowrap", maxWidth: "100%" },
  attribution: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: builder.primaryEdge,
    backgroundColor: builder.primaryWash,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 },
  sheet: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: MIN_TAP,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  export: {
    color: colors.foreground,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    height: 160,
    fontFamily: "monospace",
  },
  steps: { gap: 4 },
  step: { flexDirection: "row", gap: 12, padding: 12, borderRadius: radius.md },
  stepN: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTodo: { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  railNote: { gap: 8, paddingTop: 20, paddingHorizontal: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 20,
  },
  original: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4, flexWrap: "wrap" },
  eyebrowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  segTrack: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  seg: { flex: 1, height: 36, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.ring,
    alignItems: "center",
    justifyContent: "center",
  },
  check: { flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md },
  textarea: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  textInput: { color: colors.foreground, minHeight: 64, padding: 0 },
  previewLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  navBtn: { paddingHorizontal: 10, gap: 0 },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.coachAccent,
    backgroundColor: colors.coach,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  explainRow: { gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  tile: {
    flex: 1,
    minWidth: 160,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 3,
  },
});
