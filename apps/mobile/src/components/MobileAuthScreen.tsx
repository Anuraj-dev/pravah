import { StatusBar } from "expo-status-bar";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GoogleIconAsset from "../assets/icons/provider-google.svg";
import {
  colors,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import { getThemeRuntimeSnapshot } from "../theme/themeRuntime";
import { createThemedStyles } from "../theme/themeRuntime";
import { SoftWaveField } from "./SoftWaveField";
import { BrandMark } from "./BrandMark";

type MobileAuthScreenProps = {
  canGoogleSignIn: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => void;
  onOpenDiagnostics?: () => void;
};

export function MobileAuthScreen({
  canGoogleSignIn,
  isSigningIn,
  onGoogleSignIn,
  onOpenDiagnostics,
}: MobileAuthScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar
        style={getThemeRuntimeSnapshot().appearance === "dark" ? "light" : "dark"}
      />
      <SoftWaveField />

      <View style={[styles.brandZone, { paddingTop: insets.top + spacing.section * 2 }]}>
        <BrandMark size={64} />
        <Pressable
          onLongPress={onOpenDiagnostics}
          delayLongPress={450}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Pravah"
          accessibilityHint="Long press or use the diagnostics action to export diagnostics."
          accessibilityActions={
            onOpenDiagnostics ? [{ name: "longpress", label: "Export diagnostics" }] : undefined
          }
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "longpress") {
              onOpenDiagnostics?.();
            }
          }}
        >
          <Text style={styles.wordmark}>Pravah</Text>
        </Pressable>
      </View>

      <View style={[styles.buttonZone, { paddingBottom: insets.bottom + spacing.section }]}>
        <Pressable
          onPress={onGoogleSignIn}
          disabled={!canGoogleSignIn || isSigningIn}
          accessibilityRole="button"
          accessibilityLabel={isSigningIn ? "Signing in with Google" : "Sign in with Google"}
          accessibilityState={{ disabled: !canGoogleSignIn || isSigningIn, busy: isSigningIn }}
          style={({ pressed }) => [
            styles.googleButton,
            (!canGoogleSignIn || isSigningIn) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
        >
          <GoogleIconAsset
            width={18}
            height={18}
            style={(!canGoogleSignIn || isSigningIn) && styles.disabledButtonIcon}
          />
          <Text
            style={[
              styles.googleButtonText,
              (!canGoogleSignIn || isSigningIn) && styles.disabledButtonText,
            ]}
          >
            {isSigningIn ? "Signing in..." : "Continue with Google"}
          </Text>
        </Pressable>
        {!canGoogleSignIn ? (
          <Text style={styles.hint}>Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in mobile env.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = createThemedStyles({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  brandZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  wordmark: {
    color: colors.textPrimary,
    ...typography.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  buttonZone: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  googleButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  googleButtonText: {
    color: colors.textInverse,
    ...typography.title,
  },
  disabledButton: {
    backgroundColor: colors.border,
  },
  disabledButtonText: {
    color: colors.textMuted,
  },
  disabledButtonIcon: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  hint: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
  },
});
