import { useEffect, useRef, useState } from "react";

// Minimal ambient typing for the Web Speech API, which TypeScript's DOM lib
// doesn't ship definitions for.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Wraps the browser's built-in speech recognition (no server, no API key).
 * Calls onFinalTranscript with each finalized chunk of speech as it's
 * recognized, so callers can append it to whatever they're writing.
 */
export function useSpeechToText(onFinalTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinalTranscript);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const start = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) chunk += result[0].transcript;
      }
      if (chunk.trim()) onFinalRef.current(chunk.trim());
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const toggle = () => (isListening ? stop() : start());

  return { isSupported, isListening, start, stop, toggle };
}
