import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./app";
import { emptyPersonal, loadPersonal, personalDraft, type PersonalDraft } from "./accessibility";

export function patientFeatures(draft: PersonalDraft) {
  return {
    textSize: draft.preferences.text_size ?? "standard",
    highContrast: draft.preferences.contrast === "high",
    reducedMotion: draft.preferences.reduced_motion === true,
    simplified: draft.preferences.simplified_navigation === true,
    pictures: draft.communication_methods.includes("pictures"),
    voice: draft.communication_methods.includes("voice"),
    tts: draft.communication_methods.includes("tts"),
  };
}
const Context = createContext({ draft: emptyPersonal(), loading: false, failed: false, reload: async () => {} });
export function PatientAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const identity = user?.role === "patient" ? user.id : null;
  const patientId = user?.role === "patient" ? user.patientId : null;
  const [state, setState] = useState<{ identity: string | null; draft: PersonalDraft; loading: boolean; failed: boolean }>({ identity: null, draft: emptyPersonal(), loading: false, failed: false });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    if (!identity || !patientId) { setState({ identity: null, draft: emptyPersonal(), loading: false, failed: false }); return; }
    setState((s) => ({ identity, draft: s.identity === identity ? s.draft : emptyPersonal(), loading: true, failed: false }));
    try {
      const draft = personalDraft(await loadPersonal(patientId));
      if (version === generation.current) setState({ identity, draft, loading: false, failed: false });
    } catch { if (version === generation.current) setState({ identity, draft: emptyPersonal(), loading: false, failed: true }); }
  }, [identity, patientId]);
  useEffect(() => { void reload(); const focus = () => void reload(); window.addEventListener("focus", focus); return () => { generation.current++; window.removeEventListener("focus", focus); }; }, [reload]);
  const draft = state.identity === identity ? state.draft : emptyPersonal();
  const features = patientFeatures(draft);
  useEffect(() => {
    const root = document.documentElement;
    if (identity) {
      root.dataset.patientText = features.textSize;
      root.dataset.patientContrast = features.highContrast ? "high" : "standard";
      root.dataset.patientMotion = features.reducedMotion ? "reduced" : "standard";
      root.dataset.patientSimple = features.simplified ? "true" : "false";
    }
    return () => { delete root.dataset.patientText; delete root.dataset.patientContrast; delete root.dataset.patientMotion; delete root.dataset.patientSimple; };
  }, [identity, features.textSize, features.highContrast, features.reducedMotion, features.simplified]);
  return <Context.Provider value={{ draft, loading: !!identity && (state.identity !== identity || state.loading), failed: state.identity === identity && state.failed, reload }}>{children}</Context.Provider>;
}
export const usePatientAccess = () => useContext(Context);