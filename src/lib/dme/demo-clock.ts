import type { Case } from "../cases";

export function caseNowMs(current: Case, realNow = Date.now()) {
  return realNow + current.demoClockOffsetMs;
}

export function caseNowIso(current: Case) {
  return new Date(caseNowMs(current)).toISOString();
}

export function realWakeTime(current: Case, caseTime: string) {
  return new Date(Date.parse(caseTime) - current.demoClockOffsetMs).toISOString();
}
