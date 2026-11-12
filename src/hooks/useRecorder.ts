"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "error";

export interface Recording {
  blob: Blob;
  /** Extension matching the blob's codec — OpenAI sniffs the format from the filename. */
  extension: string;
  durationMs: number;
}

/**
 * Codecs in preference order. Chrome and Firefox take webm/opus; Safari only does mp4.
 * All of these are formats the transcription endpoint accepts.
 */
const CANDIDATES: { mimeType: string; extension: string }[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "mp4" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
];

function pickFormat() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null
  );
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    // Releasing the tracks is what turns off the browser's recording indicator.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);

    const format = pickFormat();
    if (!format) {
      setState("error");
      setError("This browser cannot record audio. Try Chrome, Edge, or Safari.");
      return;
    }

    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickRef.current = setInterval(
        () => setElapsedMs(Date.now() - startedAtRef.current),
        200
      );
      setState("recording");
    } catch (err) {
      cleanup();
      setState("error");
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser's site settings and try again."
          : name === "NotFoundError"
            ? "No microphone was found."
            : "Could not start recording."
      );
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setState("idle");
      return Promise.resolve(null);
    }

    const format = pickFormat();
    const durationMs = Date.now() - startedAtRef.current;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: format?.mimeType ?? "audio/webm",
        });
        chunksRef.current = [];
        cleanup();
        setState("idle");
        setElapsedMs(0);
        resolve(
          blob.size > 0
            ? { blob, extension: format?.extension ?? "webm", durationMs }
            : null
        );
      };
      recorder.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    cleanup();
    setState("idle");
    setElapsedMs(0);
  }, [cleanup]);

  return { state, error, elapsedMs, start, stop, cancel };
}
