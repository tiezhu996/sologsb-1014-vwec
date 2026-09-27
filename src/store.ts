import { redraw } from 'mithril';
import type { Lemma, LemmaStatus, ProofCheck, ProofDocument, ProofStep, ProofVersion } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v2';
const LEGACY_STORAGE_KEY = 'sologsb-1014-proof-workspace-v1';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论'];

interface Workspace {
  documents: ProofDocument[];
  lemmas: Lemma[];
}

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], lemmas: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], lemmas: [], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], lemmas: [], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], lemmas: [], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], lemmas: ['lem-expand'], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], lemmas: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: ['i1'], lemmas: [], note: '归纳基例。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], lemmas: ['lem-revoked-demo'], note: '这里故意保留一个失效引用和一条已撤销引理，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i3'], lemmas: [], note: '尚未补齐归纳假设。', counterexample: '', alternative: '' },
  ];
}

function initialDocuments(): ProofDocument[] {
  const now = new Date().toISOString();
  return [
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
}

function seedLemmas(documents: ProofDocument[]): Lemma[] {
  const algebra = documents.find((item) => item.id === 'doc-algebra');
  const s3 = algebra?.steps.find((step) => step.id === 's3');
  const s4 = algebra?.steps.find((step) => step.id === 's4');
  return [
    {
      id: 'lem-expand',
      name: '分配展开引理',
      statement: s3?.statement ?? '$(a+b)(a+b)=a^2+ab+ba+b^2$',
      sourceDocId: 'doc-algebra',
      sourceStepId: 's3',
      basisLemmaIds: [],
      revoked: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'lem-merge',
      name: '交换合并引理',
      statement: s4?.statement ?? '$a^2+ab+ba+b^2=a^2+2ab+b^2$',
      sourceDocId: 'doc-algebra',
      sourceStepId: 's4',
      basisLemmaIds: ['lem-expand'],
      revoked: false,
      createdAt: new Date().toISOString(),
    },
    {
      // 来源步骤在稿子里已被拿掉，登记后即为失效状态，用于演示。
      id: 'lem-missing-demo',
      name: '平方定义引理（旧版）',
      statement: '$(a+b)^2=(a+b)(a+b)$',
      sourceDocId: 'doc-algebra',
      sourceStepId: 'step-removed-demo',
      basisLemmaIds: [],
      revoked: false,
      createdAt: new Date().toISOString(),
    },
    {
      // 已被撤销，且被“待核对稿”引用，用于演示检查项。
      id: 'lem-revoked-demo',
      name: '归纳传递引理（已废弃）',
      statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立',
      sourceDocId: 'doc-induction',
      sourceStepId: 'i3',
      basisLemmaIds: [],
      revoked: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeDocuments(documents: ProofDocument[]): ProofDocument[] {
  documents.forEach((document) => {
    document.steps.forEach((step) => {
      if (!Array.isArray(step.references)) step.references = [];
      if (!Array.isArray(step.lemmas)) step.lemmas = [];
    });
    document.versions.forEach((version) => {
      version.steps.forEach((step) => {
        if (!Array.isArray(step.references)) step.references = [];
        if (!Array.isArray(step.lemmas)) step.lemmas = [];
      });
    });
  });
  return documents;
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Workspace>;
      if (Array.isArray(parsed.documents) && parsed.documents.length) {
        return { documents: normalizeDocuments(parsed.documents), lemmas: Array.isArray(parsed.lemmas) ? parsed.lemmas : [] };
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as ProofDocument[];
      if (Array.isArray(parsed) && parsed.length) {
        const documents = normalizeDocuments(parsed);
        return { documents, lemmas: seedLemmas(documents) };
      }
    }
  } catch {
    // 数据损坏时回落到示例工作区。
  }
  const documents = initialDocuments();
  return { documents, lemmas: seedLemmas(documents) };
}

/** 找到引理登记来源所在的文档与步骤；找不到返回 undefined。 */
export function findLemmaSource(lemma: Lemma, documents: ProofDocument[]): { document: ProofDocument; step: ProofStep; index: number } | undefined {
  const document = documents.find((item) => item.id === lemma.sourceDocId);
  if (!document) return undefined;
  const index = document.steps.findIndex((step) => step.id === lemma.sourceStepId);
  if (index < 0) return undefined;
  return { document, step: document.steps[index], index };
}

/** 引理当前状态：撤销优先，其次检查来源步骤是否被拿掉、命题是否变样。 */
export function lemmaStatus(lemma: Lemma, documents: ProofDocument[]): LemmaStatus {
  if (lemma.revoked) return { state: 'revoked' };
  const source = findLemmaSource(lemma, documents);
  if (!source) return { state: 'stale', reason: 'missing', detail: '登记它的那一步已从稿子里拿掉' };
  if (source.step.statement !== lemma.statement) {
    return { state: 'stale', reason: 'changed', detail: '登记命题与来源步骤当前命题不一致' };
  }
  return { state: 'active' };
}

/** 在引理互引图上找出所有规模大于 1（含自环）的强连通分量，即互相拿对方当依据的环。 */
export function findLemmaCycles(lemmas: Lemma[]): string[][] {
  const ids = new Set(lemmas.map((lemma) => lemma.id));
  const graph = new Map(lemmas.map((lemma) => [lemma.id, lemma.basisLemmaIds.filter((id) => ids.has(id))]));
  let indexCounter = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const strongConnect = (id: string): void => {
    indices.set(id, indexCounter);
    low.set(id, indexCounter);
    indexCounter += 1;
    stack.push(id);
    onStack.add(id);
    (graph.get(id) ?? []).forEach((next) => {
      if (!indices.has(next)) {
        strongConnect(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id)!, indices.get(next)!));
      }
    });
    if (low.get(id) === indices.get(id)) {
      const component: string[] = [];
      let current = '';
      do {
        current = stack.pop()!;
        onStack.delete(current);
        component.push(current);
      } while (current !== id);
      const selfLoop = component.length === 1 && (graph.get(component[0]) ?? []).includes(component[0]);
      if (component.length > 1 || selfLoop) cycles.push(component);
    }
  };

  lemmas.forEach((lemma) => {
    if (!indices.has(lemma.id)) strongConnect(lemma.id);
  });
  return cycles;
}

export class ProofStore {
  workspace = loadWorkspace();
  lemmas = this.workspace.lemmas;
  documents = this.workspace.documents;
  activeId = this.documents[0]?.id ?? '';
  selectedStepId = this.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: ProofDocument[][] = [];
  redoStack: ProofDocument[][] = [];
  toast = '';

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    return validate(this.documents, this.current, this.lemmas);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ documents: this.documents, lemmas: this.lemmas }));
  }

  update(mutator: (document: ProofDocument) => void): void {
    this.undoStack.push(clone(this.documents));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.current);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.documents));
    this.documents = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.documents));
    this.documents = next;
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
      steps: [{ id: uid('step'), type: 'premise', statement: '在这里输入前提', rule: '前提', references: [], lemmas: [], note: '', counterexample: '', alternative: '' }],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    this.undoStack.push(clone(this.documents));
    this.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.undoStack.push(clone(this.documents));
    this.documents = this.documents.filter((item) => item.id !== id);
    this.ensureSelection();
    this.save();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step: ProofStep = {
      id: uid('step'),
      type,
      statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
      rule: type === 'goal' ? '结论' : '等式变形',
      references: this.selectedStepId ? [this.selectedStepId] : [],
      lemmas: [],
      note: '',
      counterexample: '',
      alternative: '',
    };
    this.update((document) => {
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((document) => {
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((document) => {
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((document) => {
      const step = document.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  createVersion(): void {
    this.update((document) => {
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

  // ---- 公共引理册 ----

  lemmaById(id: string): Lemma | undefined {
    return this.lemmas.find((lemma) => lemma.id === id);
  }

  /** 把选中步骤登记为引理；同一步骤重复登记时直接返回已有的引理。 */
  registerLemma(stepId: string, name: string): Lemma {
    const document = this.current;
    const existing = this.lemmas.find((lemma) => lemma.sourceDocId === document.id && lemma.sourceStepId === stepId);
    if (existing) {
      this.notify(`该步骤已登记为引理“${existing.name}”`);
      return existing;
    }
    const step = document.steps.find((item) => item.id === stepId);
    const lemma: Lemma = {
      id: uid('lem'),
      name: name.trim() || `引理 ${this.lemmas.length + 1}`,
      statement: step?.statement ?? '',
      sourceDocId: document.id,
      sourceStepId: stepId,
      basisLemmaIds: [],
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    this.lemmas.unshift(lemma);
    this.save();
    this.notify(`已登记引理“${lemma.name}”`);
    return lemma;
  }

  renameLemma(lemmaId: string, name: string): void {
    const lemma = this.lemmaById(lemmaId);
    if (!lemma) return;
    lemma.name = name.trim() || lemma.name;
    this.save();
  }

  /** 登记命题变样后，用来源步骤的当前命题刷新快照，使引理重新生效。 */
  refreshLemma(lemmaId: string): void {
    const lemma = this.lemmaById(lemmaId);
    if (!lemma) return;
    const source = findLemmaSource(lemma, this.documents);
    if (!source) {
      this.notify('来源步骤已不存在，无法刷新');
      return;
    }
    lemma.statement = source.step.statement;
    this.save();
    this.notify(`已按当前稿件刷新引理“${lemma.name}”`);
  }

  setLemmaRevoked(lemmaId: string, revoked: boolean): void {
    const lemma = this.lemmaById(lemmaId);
    if (!lemma) return;
    lemma.revoked = revoked;
    this.save();
    this.notify(revoked ? `已撤销引理“${lemma.name}”` : `已恢复引理“${lemma.name}”`);
  }

  toggleLemmaBasis(lemmaId: string, basisId: string): void {
    if (lemmaId === basisId) return;
    const lemma = this.lemmaById(lemmaId);
    if (!lemma) return;
    lemma.basisLemmaIds = lemma.basisLemmaIds.includes(basisId)
      ? lemma.basisLemmaIds.filter((id) => id !== basisId)
      : [...lemma.basisLemmaIds, basisId];
    this.save();
  }

  toggleStepLemma(stepId: string, lemmaId: string, checked: boolean): void {
    this.update((document) => {
      const step = document.steps.find((item) => item.id === stepId);
      if (!step) return;
      step.lemmas = checked ? [...new Set([...step.lemmas, lemmaId])] : step.lemmas.filter((id) => id !== lemmaId);
    });
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

export function validate(documents: ProofDocument[], document: ProofDocument, lemmas: Lemma[]): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);
  const lemmaMap = new Map(lemmas.map((lemma) => [lemma.id, lemma]));
  const lemmaName = (id: string) => lemmaMap.get(id)?.name ?? `未知引理 ${id.slice(-4)}`;

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

    // 逐条核对勾为依据的引理：不存在、已撤销、已失效分别单独报告。
    step.lemmas.forEach((lemmaId) => {
      const lemma = lemmaMap.get(lemmaId);
      if (!lemma) {
        checks.push({ id: `lemma-missing-${step.id}-${lemmaId}`, severity: 'error', title: '引用的引理不存在', detail: `步骤 ${index + 1} 勾选的引理已从引理册删除。`, stepId: step.id });
        return;
      }
      const status = lemmaStatus(lemma, documents);
      if (status.state === 'revoked') {
        checks.push({ id: `lemma-revoked-${step.id}-${lemmaId}`, severity: 'error', title: '引用了已撤销的引理', detail: `步骤 ${index + 1} 以已撤销的引理“${lemma.name}”为依据。`, stepId: step.id });
      } else if (status.state === 'stale') {
        checks.push({ id: `lemma-stale-${step.id}-${lemmaId}`, severity: 'warning', title: '引用了已失效的引理', detail: `步骤 ${index + 1} 使用的引理“${lemma.name}”已失效：${status.detail}。`, stepId: step.id });
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

  // 引理互相拿对方当依据：每个强连通环单独列一条。
  findLemmaCycles(lemmas).forEach((cycle, cycleIndex) => {
    checks.push({
      id: `lemma-cycle-${cycleIndex}-${cycle.join('-')}`,
      severity: 'error',
      title: '引理依据互相循环',
      detail: `以下引理彼此（或经若干条引理）拿对方当依据：${cycle.map(lemmaName).join('、')}。`,
    });
  });

  // 引理本身依据的其他引理若已撤销/失效/缺失，也单独指出。
  lemmas.forEach((lemma) => {
    lemma.basisLemmaIds.forEach((basisId) => {
      const basis = lemmaMap.get(basisId);
      if (!basis) {
        checks.push({ id: `lemma-basis-missing-${lemma.id}-${basisId}`, severity: 'error', title: '引理依据不存在', detail: `引理“${lemma.name}”依据的引理已从引理册删除。` });
        return;
      }
      const status = lemmaStatus(basis, documents);
      if (status.state === 'revoked') {
        checks.push({ id: `lemma-basis-revoked-${lemma.id}-${basisId}`, severity: 'error', title: '引理依据了已撤销引理', detail: `引理“${lemma.name}”以已撤销的引理“${basis.name}”为依据。` });
      } else if (status.state === 'stale') {
        checks.push({ id: `lemma-basis-stale-${lemma.id}-${basisId}`, severity: 'warning', title: '引理依据了已失效引理', detail: `引理“${lemma.name}”依据的“${basis.name}”已失效：${status.detail}。` });
      }
    });
  });

  const goalStep = document.steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else if (goalStep.references.length === 0 && goalStep.lemmas.length === 0) {
    checks.push({ id: 'goal-unlinked', severity: 'warning', title: '结论尚无推导支撑', detail: '最终步骤没有引用任何前置步骤或引理。', stepId: goalStep.id });
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '未发现缺失引用、循环引用或未证明目标。' });
  }
  return checks;
}

/**
 * 导出用：收集稿子用到的引理（含传递依赖），按“被依赖的排在前面”做拓扑排序。
 */
export function usedLemmaOrder(document: ProofDocument, lemmas: Lemma[]): Lemma[] {
  const lemmaMap = new Map(lemmas.map((lemma) => [lemma.id, lemma]));
  const collected = new Set<string>();
  const walk = (id: string): void => {
    if (collected.has(id) || !lemmaMap.has(id)) return;
    collected.add(id);
    lemmaMap.get(id)!.basisLemmaIds.forEach(walk);
  };
  document.steps.forEach((step) => step.lemmas.forEach(walk));

  const result: Lemma[] = [];
  const placed = new Set<string>();
  const place = (id: string, guard: Set<string>): void => {
    if (placed.has(id)) return;
    if (guard.has(id)) return; // 存在循环依据时也不要卡死，环上的节点按册中顺序兜底。
    const lemma = lemmaMap.get(id);
    if (!lemma) return;
    const nextGuard = new Set(guard);
    nextGuard.add(id);
    lemma.basisLemmaIds.forEach((basisId) => place(basisId, nextGuard));
    if (!placed.has(id)) {
      placed.add(id);
      result.push(lemma);
    }
  };
  lemmas.forEach((lemma) => {
    if (collected.has(lemma.id)) place(lemma.id, new Set());
  });
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
