import { redraw } from 'mithril';
import type { Lemma, LemmaStatus, ProofCheck, ProofDocument, ProofStep, ProofVersion } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v2';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论', '引理'];

export interface Workspace {
  documents: ProofDocument[];
  lemmas: Lemma[];
}

function blankStep(type: ProofStep['type'], id = uid('step')): ProofStep {
  return {
    id,
    type,
    statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
    rule: type === 'goal' ? '结论' : '等式变形',
    references: [],
    lemmas: [],
    note: '',
    counterexample: '',
    alternative: '',
  };
}

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], lemmas: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], lemmas: [], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], lemmas: [], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], lemmas: [], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], lemmas: [], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], lemmas: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: ['i1'], lemmas: [], note: '归纳基例。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], lemmas: [], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i3'], lemmas: [], note: '尚未补齐归纳假设。', counterexample: '', alternative: '' },
  ];
}

function initialWorkspace(): Workspace {
  const now = new Date().toISOString();
  const documents: ProofDocument[] = [
    {
      id: 'doc-algebra',
      title: '完全平方公式证明',
      author: '数学组',
      goal: '$(a+b)^2=a^2+2ab+b^2$',
      symbols: { a: '实数', b: '实数', P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: sampleSteps(),
      versions: [],
      updatedAt: now,
    },
    {
      id: 'doc-induction',
      title: '数学归纳法待核对稿',
      author: '学生工作区',
      goal: '$P(n)$ 对所有正整数 $n$ 成立',
      symbols: { P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: issueSteps(),
      versions: [],
      updatedAt: now,
    },
  ];
  // 预置一条有效引理（来自完全平方稿的展开步骤），方便直接体验引用。
  const lemmas: Lemma[] = [
    { id: 'lemma-sample-1', name: '平方展开式', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', docId: 'doc-algebra', stepId: 's3', createdAt: now, revoked: false },
  ];
  return { documents, lemmas };
}

/** 兼容旧版本：v1 只存了文档数组 */
function migrate(raw: unknown): Workspace {
  if (Array.isArray(raw)) return { documents: raw as ProofDocument[], lemmas: [] };
  const workspace = raw as Workspace;
  return { documents: Array.isArray(workspace?.documents) ? workspace.documents : [], lemmas: Array.isArray(workspace?.lemmas) ? workspace.lemmas : [] };
}

/** 旧数据里的步骤没有 lemmas 字段，读取时补齐 */
function hydrate(documents: ProofDocument[]): ProofDocument[] {
  documents.forEach((document) => {
    document.steps.forEach((step) => {
      if (!Array.isArray(step.lemmas)) step.lemmas = [];
    });
  });
  return documents;
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('sologsb-1014-proof-workspace-v1');
    if (!raw) return initialWorkspace();
    const workspace = migrate(JSON.parse(raw));
    if (!workspace.documents.length) return initialWorkspace();
    return { documents: hydrate(workspace.documents), lemmas: workspace.lemmas };
  } catch {
    return initialWorkspace();
  }
}

/** 引理当前状态：revoked 优先于 stale，stale 由来源步骤被删除或命题改动自动判定 */
export function lemmaStatus(lemma: Lemma, documents: ProofDocument[]): LemmaStatus {
  if (lemma.revoked) return 'revoked';
  const source = documents.find((document) => document.id === lemma.docId)?.steps.find((step) => step.id === lemma.stepId);
  if (!source || source.statement !== lemma.statement) return 'stale';
  return 'active';
}

export const lemmaStatusLabel: Record<LemmaStatus, string> = {
  active: '有效',
  stale: '失效',
  revoked: '已撤销',
};

export class ProofStore {
  workspace = loadWorkspace();
  activeId = this.workspace.documents[0]?.id ?? '';
  selectedStepId = this.workspace.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: Workspace[] = [];
  redoStack: Workspace[] = [];
  toast = '';

  get documents(): ProofDocument[] {
    return this.workspace.documents;
  }

  get lemmas(): Lemma[] {
    return this.workspace.lemmas;
  }

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    if (!this.current) return [];
    return validate(this.current, this.workspace);
  }

  statusOf(lemma: Lemma): LemmaStatus {
    return lemmaStatus(lemma, this.documents);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.workspace));
  }

  update(mutator: (workspace: Workspace) => void): void {
    this.undoStack.push(clone(this.workspace));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.workspace);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.workspace));
    this.workspace = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.workspace));
    this.workspace = next;
    this.ensureSelection();
    this.save();
  }

  selectDocument(id: string): void {
    this.activeId = id;
    this.compareVersionId = '';
    this.selectedStepId = this.current?.steps[0]?.id ?? '';
  }

  selectStep(id: string): void {
    this.selectedStepId = id;
  }

  ensureSelection(): void {
    if (!this.documents.some((item) => item.id === this.activeId)) this.activeId = this.documents[0]?.id ?? '';
    if (!this.current?.steps.some((step) => step.id === this.selectedStepId)) {
      this.selectedStepId = this.current?.steps[0]?.id ?? '';
    }
  }

  addDocument(): void {
    const id = uid('doc');
    const document: ProofDocument = {
      id,
      title: '未命名证明',
      author: '本地用户',
      goal: '$A=B$',
      symbols: { A: '待定义对象', B: '待定义对象' },
      steps: [blankStep('premise')],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    document.steps[0].statement = '在这里输入前提';
    document.steps[0].rule = '前提';
    this.undoStack.push(clone(this.workspace));
    this.workspace.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.update((workspace) => {
      workspace.documents = workspace.documents.filter((item) => item.id !== id);
    });
    this.ensureSelection();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step = blankStep(type);
    this.update((workspace) => {
      const document = workspace.documents.find((item) => item.id === this.activeId);
      if (!document) return;
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      if (type !== 'goal' && this.selectedStepId && selectedIndex >= 0) step.references = [this.selectedStepId];
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((workspace) => {
      const document = workspace.documents.find((item) => item.id === this.activeId);
      if (!document) return;
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((workspace) => {
      const document = workspace.documents.find((item) => item.id === this.activeId);
      if (!document) return;
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((workspace) => {
      const step = workspace.documents.find((item) => item.id === this.activeId)?.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  /** 把选中的步骤登记成公共引理 */
  registerLemma(name: string): void {
    const step = this.selectedStep;
    if (!step) return;
    this.update((workspace) => {
      const existing = workspace.lemmas.find((lemma) => lemma.docId === this.activeId && lemma.stepId === step.id);
      if (existing) {
        existing.name = name;
        existing.statement = step.statement;
        existing.revoked = false;
      } else {
        workspace.lemmas.push({
          id: uid('lemma'),
          name,
          statement: step.statement,
          docId: this.activeId,
          stepId: step.id,
          createdAt: new Date().toISOString(),
          revoked: false,
        });
      }
    });
    this.notify('已登记到公共引理册');
  }

  revokeLemma(id: string): void {
    this.update((workspace) => {
      const lemma = workspace.lemmas.find((item) => item.id === id);
      if (lemma) lemma.revoked = true;
    });
    this.notify('引理已撤销');
  }

  /** 撤销后恢复为有效（来源步骤仍需存在且命题一致） */
  restoreLemma(id: string): void {
    this.update((workspace) => {
      const lemma = workspace.lemmas.find((item) => item.id === id);
      if (lemma) lemma.revoked = false;
    });
  }

  removeLemma(id: string): void {
    this.update((workspace) => {
      workspace.lemmas = workspace.lemmas.filter((lemma) => lemma.id !== id);
      workspace.documents.forEach((document) => document.steps.forEach((step) => {
        step.lemmas = step.lemmas.filter((lemmaId) => lemmaId !== id);
      }));
    });
  }

  toggleStepLemma(lemmaId: string, checked: boolean): void {
    const step = this.selectedStep;
    if (!step) return;
    const lemmas = checked ? [...new Set([...step.lemmas, lemmaId])] : step.lemmas.filter((id) => id !== lemmaId);
    this.updateStep({ lemmas });
  }

  createVersion(): void {
    this.update((workspace) => {
      const document = workspace.documents.find((item) => item.id === this.activeId);
      if (!document) return;
      const version: ProofVersion = {
        id: uid('version'),
        name: `版本 ${document.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        steps: clone(document.steps),
        goal: document.goal,
      };
      document.versions.unshift(version);
      this.compareVersionId = version.id;
    });
    this.notify('已保存当前证明快照');
  }

  notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = '';
        redraw();
      }
    }, 2200);
  }
}

function stripLatexCommands(text: string): string {
  return text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^]/g, ' ');
}

export function validate(document: ProofDocument, workspace?: Workspace): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);

  document.steps.forEach((step, index) => {
    const tokens = stripLatexCommands(step.statement).match(/\b[A-Za-z][A-Za-z0-9']*\b/g) ?? [];
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token) && !ignored.has(token)))];
    if (unknown.length) {
      checks.push({ id: `symbol-${step.id}`, severity: 'warning', title: '发现未定义符号', detail: `步骤 ${index + 1} 使用了：${unknown.join('、')}`, stepId: step.id });
    }

    step.references.forEach((reference) => {
      if (!ids.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}`, stepId: step.id });
      }
    });
  });

  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleStep = new Set<string>();
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      path.slice(path.indexOf(id)).forEach((item) => cycleStep.add(item));
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const hasCycle = (graph.get(id) ?? []).some((next) => visit(next, [...path, id]));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  [...graph.keys()].forEach((id) => visit(id, []));
  if (cycleStep.size) {
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: '引用链形成闭环，请调整步骤关系。', stepId: [...cycleStep][0] });
  }

  // —— 引理相关检查 ——
  const lemmas = workspace?.lemmas ?? [];
  const lemmaMap = new Map(lemmas.map((lemma) => [lemma.id, lemma]));
  const statusOf = (lemma: Lemma) => (workspace ? lemmaStatus(lemma, workspace.documents) : lemma.revoked ? 'revoked' : 'active');

  // 1) 引用了已经被撤销（或因来源变动而失效）的引理：逐条单独指出
  document.steps.forEach((step, index) => {
    step.lemmas.forEach((lemmaId) => {
      const lemma = lemmaMap.get(lemmaId);
      if (!lemma) {
        checks.push({ id: `lemma-missing-${step.id}-${lemmaId}`, severity: 'error', title: '引用的引理不存在', detail: `步骤 ${index + 1} 引用的引理 ${lemmaId} 已从引理册删除。`, stepId: step.id });
        return;
      }
      const status = statusOf(lemma);
      if (status === 'revoked') {
        checks.push({ id: `lemma-revoked-${step.id}-${lemmaId}`, severity: 'error', title: '引用了已撤销的引理', detail: `步骤 ${index + 1} 引用的「${lemma.name}」已被撤销，不能继续作为依据。`, stepId: step.id });
      } else if (status === 'stale') {
        checks.push({ id: `lemma-stale-${step.id}-${lemmaId}`, severity: 'error', title: '引用了已失效的引理', detail: `步骤 ${index + 1} 引用的「${lemma.name}」已失效：登记该引理的步骤被删除或命题已变更。`, stepId: step.id });
      }
    });
  });

  // 2) 引理互相拿对方当依据：在引理依赖图上找环，每个环单独报一条
  const lemmaGraph = new Map<string, string[]>();
  lemmas.forEach((lemma) => {
    const source = workspace?.documents.find((doc) => doc.id === lemma.docId)?.steps.find((step) => step.id === lemma.stepId);
    lemmaGraph.set(lemma.id, source ? source.lemmas.filter((id) => lemmaMap.has(id)) : []);
  });
  const lVisiting = new Set<string>();
  const lVisited = new Set<string>();
  const reportedCycles = new Set<string>();
  const lVisit = (id: string, path: string[]): void => {
    if (lVisiting.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id];
      const key = [...cycle].sort().join('|');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        const names = cycle.map((lemmaId) => lemmaMap.get(lemmaId)?.name ?? lemmaId).join(' → ');
        checks.push({ id: `lemma-cycle-${key}`, severity: 'error', title: '引理之间存在循环依据', detail: `以下引理互相把对方当作依据：${names}。` });
      }
      return;
    }
    if (lVisited.has(id)) return;
    lVisiting.add(id);
    (lemmaGraph.get(id) ?? []).forEach((next) => lVisit(next, [...path, id]));
    lVisiting.delete(id);
    lVisited.add(id);
  };
  lemmas.forEach((lemma) => lVisit(lemma.id, []));

  const goalStep = document.steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else if (goalStep.references.length === 0 && goalStep.lemmas.length === 0) {
    checks.push({ id: 'goal-unlinked', severity: 'warning', title: '结论尚无推导支撑', detail: '最终步骤没有引用任何前置步骤或引理。', stepId: goalStep.id });
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '未发现缺失引用、循环引用、失效引理或未证明目标。' });
  }
  return checks;
}

/** 收集一份证明稿实际用到的引理（含传递依赖），按依赖顺序返回：被依赖的排在前面 */
export function collectUsedLemmas(document: ProofDocument, workspace: Workspace): Lemma[] {
  const lemmaMap = new Map(workspace.lemmas.map((lemma) => [lemma.id, lemma]));
  const result: Lemma[] = [];
  const placed = new Set<string>();

  const place = (id: string, guard: Set<string>): void => {
    if (placed.has(id)) return;
    if (guard.has(id)) return; // 引理间存在循环依据时不无限递归，环上的检查另有报错
    const lemma = lemmaMap.get(id);
    if (!lemma) return;
    const nextGuard = new Set(guard);
    nextGuard.add(id);
    const source = workspace.documents.find((doc) => doc.id === lemma.docId)?.steps.find((step) => step.id === lemma.stepId);
    (source?.lemmas ?? []).forEach((dep) => place(dep, nextGuard));
    if (!placed.has(id)) {
      placed.add(id);
      result.push(lemma);
    }
  };

  document.steps.forEach((step) => step.lemmas.forEach((id) => place(id, new Set())));
  return result;
}

export function compareVersion(document: ProofDocument, version: ProofVersion) {
  const result = [];
  const size = Math.max(document.steps.length, version.steps.length);
  for (let index = 0; index < size; index += 1) {
    const before = version.steps[index]?.statement ?? '';
    const after = document.steps[index]?.statement ?? '';
    const kind = !before ? 'added' : !after ? 'removed' : before === after ? 'same' : 'changed';
    result.push({ kind, label: `步骤 ${index + 1}`, before, after } as const);
  }
  return result;
}

export function createId(prefix: string): string {
  return uid(prefix);
}
