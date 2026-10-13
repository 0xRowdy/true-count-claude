import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import type { StrategyDraft, StrategyGame } from "@/state/strategies";
import { saveDraft, useDrafts } from "./draftStore";
import { EXAMPLE_IDS, builderHref, exampleDraft, forkStrategy, libraryStrategy } from "./library";

export type BuilderDraft<G extends StrategyGame> = Extract<StrategyDraft, { game: G }>;

export type BuilderState<G extends StrategyGame> =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      draft: BuilderDraft<G>;
      readOnly: boolean;
      update: (next: BuilderDraft<G>) => void;
      fork: () => void;
    };

/**
 * The draft a builder edits. Query params and storage are read only after mount (the web
 * export is prerendered without either), so the first render is always "loading".
 *
 *   ?id=<draft>   one of the player's drafts
 *   ?view=<id>    a library strategy, read-only until forked
 *   (nothing)     the design's example draft for this game, saved once edited
 */
export function useBuilderDraft<G extends StrategyGame>(game: G): BuilderState<G> {
  const params = useLocalSearchParams<{ id?: string; view?: string }>();
  const { drafts, ready } = useDrafts();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !ready) return { status: "loading" };

  const isGame = (d: StrategyDraft | undefined): d is BuilderDraft<G> => d?.game === game;
  const update = (next: BuilderDraft<G>) => {
    saveDraft(next);
  };

  if (typeof params.view === "string") {
    const s = libraryStrategy(params.view);
    if (!s || !isGame(s.draft)) return { status: "missing" };
    return {
      status: "ready",
      draft: s.draft,
      readOnly: true,
      update: () => undefined,
      fork: () => {
        const f = forkStrategy(
          s,
          drafts.map((d) => d.id),
        );
        saveDraft(f);
        router.replace(builderHref(game, f.id));
      },
    };
  }

  const id = typeof params.id === "string" ? params.id : EXAMPLE_IDS[game];
  const stored = drafts.find((d) => d.id === id);
  const draft = stored ?? (id === EXAMPLE_IDS[game] ? exampleDraft(game) : undefined);
  if (!isGame(draft)) return { status: "missing" };
  return { status: "ready", draft, readOnly: false, update, fork: () => undefined };
}
