export type StepType = 'premise' | 'derivation' | 'goal';
export type CheckSeverity = 'error' | 'warning' | 'info';

export interface ProofStep {
  id: string;
  type: StepType;
  statement: string;
  rule: string;
  references: string[];
  /** 勾选为依据的公共引理 id */
  lemmas: string[];
  note: string;
  counterexample: string;
  alternative: string;
}

export interface ProofVersion {
  id: string;
  name: string;
  createdAt: string;
  steps: ProofStep[];
  goal: string;
}

export interface ProofDocument {
  id: string;
  title: string;
  author: string;
  goal: string;
  symbols: Record<string, string>;
  steps: ProofStep[];
  versions: ProofVersion[];
  updatedAt: string;
}

/** 公共引理册中的一条引理，由某份稿子的某一步登记而来，可被任意稿子引用 */
export interface Lemma {
  id: string;
  name: string;
  /** 登记那一刻的命题快照，用于事后比对原稿是否变形 */
  statement: string;
  sourceDocId: string;
  sourceStepId: string;
  /** 这条引理依据的其他引理 */
  basisLemmaIds: string[];
  /** 是否被撤销（仍保留在册，但任何引用都会被检查器指出） */
  revoked: boolean;
  createdAt: string;
}

export type LemmaStatus =
  | { state: 'active' }
  | { state: 'revoked' }
  | { state: 'stale'; reason: 'missing' | 'changed'; detail: string };

export interface ProofCheck {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  stepId?: string;
}

export interface ProofDiff {
  kind: 'same' | 'added' | 'removed' | 'changed';
  label: string;
  before: string;
  after: string;
}
