import { Mic, MicOff } from "lucide-react";
import { useSpeechToText } from "../../hooks/useSpeechToText";

/**
 * A voice-capture button backed by the browser's built-in speech
 * recognition — no backend or API key involved. Falls back to a disabled,
 * clearly-labeled state in browsers that don't support it.
 */
export function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { isSupported, isListening, toggle } = useSpeechToText(onTranscript);

  if (!isSupported) {
    return (
      <button
        type="button"
        title="Voice input isn't supported in this browser"
        aria-label="Voice input isn't supported in this browser"
        disabled
        className="rounded-full p-2.5 text-ink/30 border border-plum/15 cursor-not-allowed"
      >
        <MicOff size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={isListening ? "Stop listening" : "Speak your thoughts"}
      aria-label={isListening ? "Stop listening" : "Speak your thoughts"}
      aria-pressed={isListening}
      className={`rounded-full p-2.5 border transition-colors ${
        isListening
          ? "border-rose/60 bg-rose/10 text-rose animate-pulse"
          : "border-plum/20 text-plum hover:bg-plum/10"
      }`}
    >
      <Mic size={16} />
    </button>
  );
}
