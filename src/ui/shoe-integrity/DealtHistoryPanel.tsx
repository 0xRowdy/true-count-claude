/**
 * The full dealt-card history, in order, with the tag each card contributed.
 *
 * This is the audit trail behind the zero-sum check: the count did not arrive at its value
 * by assertion, it arrived one tag at a time, and every one of them is here to be added up
 * by hand if the user wants to.
 *
 * Long histories are collapsed by default — a finished eight-deck Shoe is 416 chips, and
 * re-laying that out on every card of a run-out makes the trace stutter on a phone. The
 * full history is one tap away and always complete in the export, so nothing is hidden;
 * only deferred.
 */

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Card } from "@/engine/cards";
import type { CountingSystem } from "@/engine/counting";
import { tagFor } from "@/engine/counting";
import { formatSigned, isRedSuit, suitGlyph } from "./integrity";
import { colors, radius, surfaces, ui, Panel } from "@/ui/ds";
import { SecondaryButton, text } from "@/ui/trainer/kit";

/** How many cards show before the history has to be opened. */
const COLLAPSED_LIMIT = 40;

export function DealtHistoryPanel({
  cards,
  system,
  expanded,
  onToggleExpanded,
}: {
  cards: readonly Card[];
  system: CountingSystem;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const collapsed = !expanded && cards.length > COLLAPSED_LIMIT;
  const shown = useMemo(
    () => (collapsed ? cards.slice(cards.length - COLLAPSED_LIMIT) : cards),
    [cards, collapsed],
  );
  const offset = cards.length - shown.length;

  return (
    <Panel title="Dealt-card history">
      <Text style={styles.prose}>
        {cards.length === 0
          ? "No cards dealt yet. Deal from the zero-sum check above and every card will be listed here, in order, with the tag it contributed."
          : `${cards.length} cards, in the order they came out of the Shoe, each with its ${system.name} tag.`}
      </Text>

      {shown.length > 0 ? (
        <>
          {collapsed ? (
            <Text style={styles.note}>
              Showing the last {COLLAPSED_LIMIT}. The export always contains all {cards.length}.
            </Text>
          ) : null}

          <View style={styles.grid}>
            {shown.map((card, index) => (
              <CardChip
                key={`${offset + index}-${card.rank}${card.suit}`}
                card={card}
                position={offset + index + 1}
                tag={tagFor(card, system)}
              />
            ))}
          </View>
        </>
      ) : null}

      {cards.length > COLLAPSED_LIMIT ? (
        <SecondaryButton
          label={
            expanded ? `Collapse to the last ${COLLAPSED_LIMIT}` : `Show all ${cards.length} cards`
          }
          onPress={onToggleExpanded}
        />
      ) : null}
    </Panel>
  );
}

function CardChip({ card, position, tag }: { card: Card; position: number; tag: number }) {
  // Tags read on the paper chip: the ink shades of correct and mistake.
  const tagColor = tag > 0 ? colors.correctInk : tag < 0 ? colors.mistakeInk : colors.inkMuted;
  return (
    <View
      style={styles.chip}
      accessibilityLabel={`Card ${position}: ${card.rank}${suitGlyph(card)}, tag ${formatSigned(tag)}`}
    >
      <Text style={styles.chipFace}>
        {card.rank}
        <Text style={isRedSuit(card) ? styles.redSuit : styles.blackSuit}>{suitGlyph(card)}</Text>
      </Text>
      <Text style={[styles.chipTag, { color: tagColor }]}>{formatSigned(tag)}</Text>
    </View>
  );
}

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  prose: text.note,
  note: text.warn,
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minWidth: 42,
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: surfaces.cardFace,
  },
  chipFace: { ...ui(13, 700), ...NUM, color: colors.ink },
  redSuit: { color: colors.suitHeart },
  blackSuit: { color: colors.suitSpade },
  chipTag: { ...ui(11, 700), ...NUM },
});
