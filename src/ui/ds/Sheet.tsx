import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow, surfaces } from "./tokens";

const NATIVE = Platform.OS !== "web";
/** How far below its resting place the sheet starts, and where a dismissing drag sends it. */
const OFFSCREEN = 640;
/** A drag past this distance, or flicked faster than this, closes the sheet. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 1;

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (!NATIVE) return;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
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
 * Callers draw the header (with a visible Close or Done) and the body.
 */
export function Sheet({
  visible,
  onClose,
  accessibilityLabel,
  scrimLabel = "Dismiss",
  maxWidth = 560,
  maxHeight = "88%",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** The dialog's accessible name, e.g. "Table panel". */
  accessibilityLabel: string;
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

  const [drag] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          Animated.timing(offset, {
            toValue: OFFSCREEN,
            duration: 180,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => closing.current());
        } else {
          Animated.spring(offset, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () =>
        Animated.spring(offset, { toValue: 0, bounciness: 0, useNativeDriver: true }).start(),
    }),
  );

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
          {NATIVE ? (
            <View
              style={styles.grabArea}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              {...drag.panHandlers}
            >
              <View style={styles.grabber} />
            </View>
          ) : null}
          {children}
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
});
