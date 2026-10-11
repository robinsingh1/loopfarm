import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildAutoresearchPrompt } from "@t3tools/client-runtime/operations";
import { AppText as Text } from "../../components/AppText";

export function AutoresearchLauncher({
  enabled,
  prompt,
  onPrepare,
}: {
  enabled: boolean;
  prompt: string;
  onPrepare: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [metric, setMetric] = useState("");
  const [checks, setChecks] = useState("");
  const [iterations, setIterations] = useState("3");
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    placeholder: string,
  ) => (
    <View className="gap-2">
      <Text className="text-sm font-t3-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor="#888"
        multiline
        className="rounded-xl border border-border p-3 text-foreground"
      />
    </View>
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New Autoresearch session"
        disabled={!enabled}
        onPress={() => {
          setGoal(prompt.startsWith("/autoresearch") ? "" : prompt);
          setError("");
          setOpen(true);
        }}
        className="mx-3 mb-2 rounded-xl border border-border px-3 py-2"
        style={{ opacity: enabled ? 1 : 0.5 }}
      >
        <Text className="font-t3-medium text-foreground">Autoresearch</Text>
        <Text className="text-xs text-muted-foreground">
          {enabled
            ? "Set a goal, measure experiments, let Clef review."
            : "Choose a Pi model and project to start."}
        </Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="flex-1 bg-background"
          contentContainerStyle={{
            padding: 22,
            paddingTop: insets.top + 22,
            paddingBottom: insets.bottom + 32,
            gap: 20,
          }}
        >
          <Text className="text-2xl font-t3-semibold text-foreground">
            New Autoresearch session
          </Text>
          <Text className="text-muted-foreground">
            Use a dedicated clean project or a new worktree. Pi measures and keeps or reverts
            changes; Clef decides whether to continue, verify, or stop.
          </Text>
          {field("Goal", goal, setGoal, "Reduce test runtime")}
          {field(
            "Metric and direction",
            metric,
            setMetric,
            "Test duration in seconds; lower is better",
          )}
          {field("Correctness checks", checks, setChecks, "All existing tests must pass")}
          {field("Experiments (2–5, including baseline)", iterations, setIterations, "3")}
          {error ? (
            <Text accessibilityRole="alert" className="text-destructive">
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-primary p-4"
            onPress={() => {
              try {
                const message = buildAutoresearchPrompt({
                  goal,
                  metric,
                  checks,
                  iterations: Number(iterations),
                });
                onPrepare(message);
                setOpen(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Check the session settings.");
              }
            }}
          >
            <Text className="text-center font-t3-semibold text-primary-foreground">
              Use in new thread
            </Text>
          </Pressable>
          <Text className="text-sm text-muted-foreground">
            Review the prepared prompt, then tap Send to start. The thread is labeled Autoresearch
            and results stay in its conversation. No search API key is required.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} className="p-3">
            <Text className="text-center text-foreground">Cancel</Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </>
  );
}
