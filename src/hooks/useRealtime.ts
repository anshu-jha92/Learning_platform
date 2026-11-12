"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Difficulty } from "@/core/scenarios";

/**
 * A live speech-to-speech call, over WebRTC straight to OpenAI.
 *
 * The audio does not pass through our server — that round trip is what would make it feel
 * like a walkie-talkie instead of a conversation. Our server only mints the short-lived
 * token; the browser does the rest.
 *
 * Event names in the Realtime API have changed before, so the handler below reacts to the
 * ones it knows and ignores everything else rather than failing. Unknown events are kept
 * in a debug log so a rename is visible instead of silent.
 */

export type LiveState = "idle" | "connecting" | "live" | "error";

export interface LiveLine {
  role: "user" | "assistant";
  text: string;
  /** Only on the learner's lines: how long they spoke, for words-per-minute. */
  durationMs?: number;
}

interface Item {
  role: "user" | "assistant";
  text: string;
  durationMs?: number;
}

export function useRealtime() {
  const [state, setState] = useState<LiveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LiveLine[]>([]);
  const [modelSpeaking, setModelSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Conversation order is kept by item id, because the learner's transcription often
  // lands AFTER the reply it triggered — appending on arrival would scramble the call.
  const itemsRef = useRef<Map<string, Item>>(new Map());
  const orderRef = useRef<string[]>([]);

  const speechStartRef = useRef<number | null>(null);
  const lastDurationRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unknownEventsRef = useRef<string[]>([]);

  const publish = useCallback(() => {
    const lines: LiveLine[] = [];
    for (const id of orderRef.current) {
      const item = itemsRef.current.get(id);
      if (item && item.text.trim()) lines.push({ ...item });
    }
    setTranscript(lines);
  }, []);

  const ensureItem = useCallback((id: string, role: "user" | "assistant") => {
    if (!itemsRef.current.has(id)) {
      itemsRef.current.set(id, { role, text: "" });
      orderRef.current.push(id);
    }
    return itemsRef.current.get(id)!;
  }, []);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      dcRef.current?.close();
    } catch {
      /* already closed */
    }
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    // Releasing the tracks is what turns off the browser's recording indicator.
    micRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    setModelSpeaking(false);
    setUserSpeaking(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleEvent = useCallback(
    (event: { type?: string; [k: string]: unknown }) => {
      const type = event.type ?? "";

      switch (type) {
        case "conversation.item.created": {
          const item = event.item as
            | { id?: string; role?: string }
            | undefined;
          if (item?.id && (item.role === "user" || item.role === "assistant")) {
            ensureItem(item.id, item.role);
          }
          break;
        }

        case "input_audio_buffer.speech_started":
          speechStartRef.current = Date.now();
          setUserSpeaking(true);
          break;

        case "input_audio_buffer.speech_stopped":
          if (speechStartRef.current) {
            lastDurationRef.current = Date.now() - speechStartRef.current;
            speechStartRef.current = null;
          }
          setUserSpeaking(false);
          break;

        case "conversation.item.input_audio_transcription.completed": {
          const id = event.item_id as string | undefined;
          const text = (event.transcript as string | undefined)?.trim();
          if (id && text) {
            const item = ensureItem(id, "user");
            item.text = text;
            item.durationMs = lastDurationRef.current;
            lastDurationRef.current = undefined;
            publish();
          }
          break;
        }

        case "response.created":
        case "output_audio_buffer.started":
          setModelSpeaking(true);
          break;

        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done": {
          const id = event.item_id as string | undefined;
          const text = (event.transcript as string | undefined)?.trim();
          if (id && text) {
            ensureItem(id, "assistant").text = text;
            publish();
          }
          break;
        }

        case "response.done":
        case "output_audio_buffer.stopped":
          setModelSpeaking(false);
          break;

        case "error": {
          const err = event.error as { message?: string } | undefined;
          setError(err?.message ?? "The live session reported an error.");
          break;
        }

        default:
          if (type && unknownEventsRef.current.length < 40) {
            unknownEventsRef.current.push(type);
          }
      }
    },
    [ensureItem, publish]
  );

  const start = useCallback(
    async (scenarioId: string, difficulty: Difficulty) => {
      setError(null);
      setTranscript([]);
      itemsRef.current = new Map();
      orderRef.current = [];
      unknownEventsRef.current = [];
      setState("connecting");

      try {
        const res = await apiFetch("/api/realtime/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId, difficulty }),
        });
        const session = await res.json();
        if (!res.ok) {
          setState("error");
          setError(session.error ?? "Could not start a live session.");
          return;
        }

        const mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micRef.current = mic;

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // Safari will not play a detached element reliably, so it goes in the document.
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioRef.current = audio;
        pc.ontrack = (e) => {
          audio.srcObject = e.streams[0];
        };

        for (const track of mic.getTracks()) pc.addTrack(track, mic);

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onmessage = (e) => {
          try {
            handleEvent(JSON.parse(e.data));
          } catch {
            /* not JSON; ignore */
          }
        };

        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setError("The connection dropped.");
            setState("error");
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch(
          `${session.callsUrl}?model=${encodeURIComponent(session.model)}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${session.clientSecret}`,
              "Content-Type": "application/sdp",
            },
          }
        );

        if (!sdpRes.ok) {
          const detail = await sdpRes.text();
          cleanup();
          setState("error");
          setError(
            `OpenAI refused the connection (${sdpRes.status}): ${detail.slice(0, 300)}`
          );
          return;
        }

        await pc.setRemoteDescription({
          type: "answer",
          sdp: await sdpRes.text(),
        });

        startedAtRef.current = Date.now();
        setElapsedMs(0);
        tickRef.current = setInterval(
          () => setElapsedMs(Date.now() - startedAtRef.current),
          500
        );
        setState("live");
      } catch (err) {
        cleanup();
        setState("error");
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in your browser's site settings and try again."
            : name === "NotFoundError"
              ? "No microphone was found."
              : err instanceof Error
                ? err.message
                : "Could not start the live session."
        );
      }
    },
    [cleanup, handleEvent]
  );

  /** Ends the call and hands back the transcript for the debrief. */
  const stop = useCallback((): LiveLine[] => {
    const lines: LiveLine[] = [];
    for (const id of orderRef.current) {
      const item = itemsRef.current.get(id);
      if (item && item.text.trim()) lines.push({ ...item });
    }
    cleanup();
    setState("idle");
    setElapsedMs(0);
    return lines;
  }, [cleanup]);

  return {
    state,
    error,
    transcript,
    modelSpeaking,
    userSpeaking,
    elapsedMs,
    start,
    stop,
    /** Event types the handler did not recognise — useful if the API renames things. */
    unknownEvents: unknownEventsRef,
  };
}
