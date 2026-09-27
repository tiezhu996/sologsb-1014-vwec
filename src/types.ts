export type StepType = 'premise' | 'derivation' | 'goal';
export type CheckSeverity = 'error' | 'warning' | 'info';

/** 引理当前状态：active 有效；stale 源步骤被删除或命题已变更（失效）；revoked 已被撤销 */
export type LemmaStatus = 'active' | 'stale' | 'revoked';

export interface ProofStep {
  id: string;
  type: StepType;
  statement: string;
  rule: string;
  references: string[];
  /** 作为依据引用的公共引理 id 列表 */
  lemmas: string[];
  note: string;
  counterexample: string;
  alternative: string;
}

/** 公共引理册中的一条引理，登记自某份证明稿的某个步骤 */
export interface Lemma {
  id: string;
  name: string;
  /** 登记时该步骤的命题快照，与当前步骤命题不一致即判定为失效 */
  statement: string;
  docId: string;
  stepId: string;
  createdAt: string;
  /** 人工撤销标记；失效由来源步骤的现状自动判定 */
  revoked: boolean;
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
