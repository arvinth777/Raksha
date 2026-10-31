"use client";
import { CheckCircle2, Timer, Zap } from "lucide-react";
import { Chip, Panel, Row, btn, label } from "./ui";

// Ops console right column: selected session readouts and operator actions.
type Loc = { latitude: number; longitude: number; accuracyM: number };
export function OpsSidePanel({
  selectedSession,
  isEmergency,
  isPatrolDispatched,
  delivery,
  busy,
  onDispatch,
  onCheckIn,
  onResolve,
}: {
  selectedSession:
    | {
        userName: string;
        userPhone: string;
        battery: string;
        callState: string;
        monitoringState: string;
        ended: boolean;
        location?: Loc;
        incident: { state: string } | null;
        view: {
          checkIn: { status: string } | null;
          session: { battery?: unknown };
        };
      }
    | undefined;
  isEmergency: boolean;
  isPatrolDispatched: boolean;
  delivery: { state: string } | undefined;
  busy: boolean;
  onDispatch: () => void;
  onCheckIn: () => void;
  onResolve: () => void;
}) {
  return (
    <section className="w-full xl:w-80 bg-paper-2 border-l border-rule flex flex-col shrink-0 xl:overflow-y-auto custom-scrollbar">
      <div className="p-4 border-b border-rule">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-ink truncate">
            {selectedSession?.userName ?? "Select a session"}
          </h2>
          <Chip
            tone={
              isEmergency ? "danger" : isPatrolDispatched ? "accent" : "muted"
            }
            live={isEmergency}
          >
            {isEmergency
              ? "SOS"
              : isPatrolDispatched
                ? "Police alerted"
                : "Session"}
          </Chip>
        </div>
      </div>
      <div className="p-4 space-y-4 flex-1">
        <Panel label="Session">
          <dl>
            <Row label="Call">
              {selectedSession ? label(selectedSession.callState) : "—"}
            </Row>
            <Row label="Listening">
              {selectedSession ? label(selectedSession.monitoringState) : "—"}
            </Row>
            <Row label="Incident" tone={isEmergency ? "danger" : "ink"}>
              {selectedSession?.incident
                ? label(selectedSession.incident.state)
                : "none"}
            </Row>
            <Row label="Check-in">
              {selectedSession?.view.checkIn
                ? label(selectedSession.view.checkIn.status)
                : "none"}
            </Row>
            <Row
              label="Police alert"
              tone={delivery?.state === "failed" ? "danger" : "ink"}
            >
              {delivery?.state ?? "not sent"}
            </Row>
          </dl>
        </Panel>
        <Panel label="Caller">
          <dl>
            <Row label="Phone">{selectedSession?.userPhone || "—"}</Row>
            <Row
              label="Position"
              tone={selectedSession?.location ? "ink" : "muted"}
            >
              {selectedSession?.location
                ? `${selectedSession.location.latitude.toFixed(4)}, ${selectedSession.location.longitude.toFixed(4)}`
                : "unavailable"}
            </Row>
            {selectedSession?.location && (
              <Row label="Accuracy">
                ±{Math.round(selectedSession.location.accuracyM)} m
              </Row>
            )}
            <Row
              label="Battery"
              tone={selectedSession?.view.session.battery ? "ink" : "muted"}
            >
              {selectedSession?.battery ?? "—"}
            </Row>
            <Row label="Police">demo stand-in</Row>
          </dl>
        </Panel>
      </div>
      <div className="p-4 space-y-2 border-t border-rule">
        <button
          onClick={onDispatch}
          disabled={
            busy ||
            !selectedSession ||
            selectedSession.ended ||
            isPatrolDispatched
          }
          className={`${btn.primary} w-full disabled:bg-paper-3 disabled:text-ink-3 disabled:opacity-100`}
        >
          <Zap className="w-5 h-5" />
          {isPatrolDispatched
            ? `police · ${delivery?.state}`
            : "alert police (demo)"}
        </button>
        <button
          disabled={busy || !selectedSession || selectedSession.ended}
          onClick={onCheckIn}
          className={`${btn.outline} w-full border-warn/50 text-warn`}
        >
          <Timer className="w-4 h-4" />
          Start 30 s safety check-in
        </button>
        <button
          disabled={
            busy ||
            !selectedSession?.incident ||
            selectedSession.incident.state === "resolved"
          }
          onClick={onResolve}
          className={`${btn.quiet} w-full`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Resolve incident…
        </button>
      </div>
    </section>
  );
}
