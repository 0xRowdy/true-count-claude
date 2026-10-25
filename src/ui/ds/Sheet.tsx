import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "./icons";
import { MIN_TAP } from "./tap";
import { colors, display, shadow, surfaces } from "./tokens";

const NATIVE = Platform.OS !== "web";
/** How far below its resting place the sheet starts, and where a dismissing drag sends it. */
const OFFSCREEN = 640;
/** A drag past this distance, or flicked faster than this, closes the sheet. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 1;

// Reduce Motion, asked once for every sheet: one query at launch and one listener, so a sheet
// knows the answer the moment it mounts instead of animating before it arrives.
let reduceMotion = false;
const motionListeners = new Set<() => void>();
if (NATIVE) {
  const set = (on: boolean) => {
    reduceMotion = on;
    motionListeners.forEach((listener) => listener());
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(set);
  AccessibilityInfo.addEventListener("reduceMotionChanged", set);
}

function subscribeReduceMotion(listener: () => void): () => void {
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduceMotion,
    () => reduceMotion,
    () => false,
  );
}

/**
 * The grabber's drag: the sheet follows the finger down, then closes past a distance or speed,
 * or settles back. Built from the two values it moves, so it holds nothing else of the caller.
 */
function dragToDismiss(offset: Animated.Value, close: { readonly current: () => void }) {
  const settle = () =>
    Animated.spring(offset, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
        Animated.timing(offset, {
          toValue: OFFSCREEN,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => close.current());
      } else {
        settle();
      }
    },
    onPanResponderTerminate: settle,
  });
}

/**
 * The bottom sheet: the one modal surface for table panels, rules and forms (a layer above the
 * page, so it takes the Loupe shadow). It behaves as each platform's sheet does:
 *
 * - it rises from the bottom over a fading scrim; with Reduce Motion it appears in place;
 * - Back (Android), Escape (web) and a tap on the scrim close it;
 * - on iOS and Android the grabber drags it down, and a long or quick drag dismisses it;
 * - it lifts above the keyboard, and its bottom edge clears the home indicator.
 *
 * Given a `title`, the sheet draws it with a close button and scrolls `children` beneath.
 * Without one, callers draw the header (with a visible Close or Done) and the body.
 */
export function Sheet({
  visible,
  onClose,
  title,
  accessibilityLabel = title,
  scrimLabel = "Dismiss",
  maxWidth = 560,
  maxHeight = "88%",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** A plain text title, drawn with a close button above a scrolling body. */
  title?: string;
  /** The dialog's accessible name, e.g. "Table panel". Defaults to `title`. */
  accessibilityLabel?: string;
  /**
   * The scrim's accessible name: it is a close button for pointer and screen-reader users. Keep
   * it distinct from the header's own Close, so the two are never announced alike.
   */
  scrimLabel?: string;
  maxWidth?: number;
  maxHeight?: DimensionValue;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [offset] = useState(() => new Animated.Value(NATIVE ? OFFSCREEN : 0));
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    if (!NATIVE || reduceMotion) {
      offset.setValue(0);
      return;
    }
    offset.setValue(OFFSCREEN);
    Animated.timing(offset, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, offset]);

  // The web has no grabber to drag.
  const [drag] = useState(() => (NATIVE ? dragToDismiss(offset, closing) : null));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.scrim}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={scrimLabel}
          onPress={onClose}
        />
        <Animated.View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.sheet,
            { maxWidth, maxHeight, paddingBottom: insets.bottom },
            { transform: [{ translateY: offset }] },
          ]}
        >
          {drag ? (
            <View
              style={styles.grabArea}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              {...drag.panHandlers}
            >
              <View style={styles.grabber} />
            </View>
          ) : null}
          {title === undefined ? (
            children
          ) : (
            <>
              <View style={styles.head}>
                <Text accessibilityRole="header" style={[display(22, 500), styles.title]}>
                  {title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${title.toLowerCase()}`}
                  onPress={onClose}
                  style={styles.close}
                >
                  <X size={20} color={colors.mutedForeground} strokeWidth={2} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: surfaces.scrim,
  },
  sheet: {
    width: "100%",
    backgroundColor: colors.popover,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    boxShadow: shadow.loupe,
    overflow: "hidden",
  },
  grabArea: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: surfaces.grabber },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 8 },
  title: { flex: 1, color: colors.foreground },
  close: { width: MIN_TAP, height: MIN_TAP, alignItems: "center", justifyContent: "center" },
  body: { gap: 10, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
});
