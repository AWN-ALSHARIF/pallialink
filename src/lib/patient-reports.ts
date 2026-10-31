import { listReports, type Report, type Status, type Symptom, type User } from "./store";

export interface PatientReport {
  id: string;
  createdAt: string;
  lastUpdate: string;
  pain: number;
  symptoms: Symptom[];
  notes: string;
  audioPath?: string | undefined;
  audioDurationS?: number | undefined;
  status: Status;
  milestones: { at: string; status: Status }[];
}

/** Presentation projection only. Raw table restrictions await the coordinated Phase 4 rollout. */
export function patientReportProjection(report: Report): PatientReport {
  const milestones: PatientReport["milestones"] = [{ at: report.createdAt, status: "submitted" }];
  for (const event of [...report.activity].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!event.status || !["status", "escalated", "returned", "return_ack", "assessment", "closure_approved"].includes(event.type)) continue;
    if (milestones.some((m) => m.at === event.at && m.status === event.status)) continue;
    if (milestones[milestones.length - 1]?.status !== event.status) milestones.push({ at: event.at, status: event.status });
  }
  milestones.sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: report.id, createdAt: report.createdAt, lastUpdate: milestones[milestones.length - 1]?.at ?? report.createdAt,
    pain: report.pain, symptoms: [...report.symptoms], notes: report.notes, status: report.status, milestones,
    audioPath: report.audioPath, audioDurationS: report.audioDurationS,
  };
}

export function patientReports(user: User): PatientReport[] {
  if (user.role !== "patient" && user.role !== "caregiver") return [];
  return listReports(user).filter((r) => r.patientId === user.patientId).map(patientReportProjection)
    .sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate));
}