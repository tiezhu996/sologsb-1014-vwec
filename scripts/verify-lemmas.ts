import { collectUsedLemmas, lemmaStatus, validate, type Workspace } from '../src/store';
import type { ProofDocument, ProofStep, Lemma } from '../src/types';

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ ${message}`);
  } else {
    failures += 1;
    console.error(`✗ ${message}`);
  }
}

function step(id: string, statement: string, refs: string[] = [], lemmaRefs: string[] = []): ProofStep {
  return { id, type: 'derivation', statement, rule: '等式变形', references: refs, lemmas: lemmaRefs, note: '', counterexample: '', alternative: '' };
}

function doc(id: string, steps: ProofStep[]): ProofDocument {
  return { id, title: id, author: 't', goal: '$G$', symbols: {}, steps, versions: [], updatedAt: '' };
}

function lemma(id: string, docId: string, stepId: string, statement = '$X$'): Lemma {
  return { id, name: id, statement, docId, stepId, createdAt: '', revoked: false };
}

// 1) 有效引理不报错；被撤销后，引用它的每一步单独报错
{
  const s1 = step('s1', '$1=1$');
  const s2 = step('s2', '$2=2$', [], ['L1']);
  const d = doc('d1', [s1, s2]);
  const L1 = lemma('L1', 'd1', 's1', '$1=1$');
  const workspace: Workspace = { documents: [d], lemmas: [L1] };
  assert(lemmaStatus(L1, workspace.documents) === 'active', '登记步骤完好时引理为有效');
  assert(!validate(d, workspace).some((c) => c.title === '引用了已撤销的引理'), '引用有效引理不报错');
  L1.revoked = true;
  assert(lemmaStatus(L1, workspace.documents) === 'revoked', '撤销后状态为已撤销');
  const checks = validate(d, workspace);
  assert(checks.some((c) => c.title === '引用了已撤销的引理' && c.stepId === 's2'), '引用已撤销引理被单独指出');
}

// 2) 两条引理互相拿对方当依据 → 单独报循环
{
  const p1 = step('p1', '$A$', [], ['LB']);
  const p2 = step('p2', '$B$', [], ['LA']);
  const d1 = doc('d1', [p1]);
  const d2 = doc('d2', [p2]);
  const LA = lemma('LA', 'd1', 'p1');
  const LB = lemma('LB', 'd2', 'p2');
  const workspace: Workspace = { documents: [d1, d2], lemmas: [LA, LB] };
  const checks = validate(d1, workspace);
  const cycle = checks.filter((c) => c.title === '引理之间存在循环依据');
  assert(cycle.length === 1, '互引的两条引理被报为一条循环依据问题');
  assert(cycle[0]?.detail.includes('LA') && cycle[0].detail.includes('LB'), '循环详情列出两条引理');
  p2.lemmas = [];
  assert(!validate(d1, workspace).some((c) => c.title === '引理之间存在循环依据'), '解除互引后循环消失');
}

// 3) 登记步骤被删除或命题变样 → 失效；引用失效引理报错
{
  const p1 = step('p1', '$A=A$');
  const s2 = step('s2', '$B$', [], ['LA']);
  const d1 = doc('d1', [p1, s2]);
  const LA = lemma('LA', 'd1', 'p1', '$A=A$');
  const workspace: Workspace = { documents: [d1], lemmas: [LA] };
  p1.statement = '$A=A+1$';
  assert(lemmaStatus(LA, workspace.documents) === 'stale', '命题变样后引理失效');
  assert(validate(d1, workspace).some((c) => c.title === '引用了已失效的引理'), '引用失效引理被指出');
  p1.statement = '$A=A$';
  assert(lemmaStatus(LA, workspace.documents) === 'active', '命题恢复后引理重新有效');
  d1.steps = d1.steps.filter((s) => s.id !== 'p1');
  assert(lemmaStatus(LA, workspace.documents) === 'stale', '来源步骤被删除后引理失效');
}

// 4) 导出清单：只含用到的（含传递依赖），被依赖的排在前面
{
  const pA = step('pA', '$A$');
  const pB = step('pB', '$B$', [], ['LA']); // LB 的来源步骤依赖 LA
  const use = step('u1', '$U$', [], ['LB']); // 稿件直接用 LB，间接用 LA
  const d1 = doc('d1', [pA, use]);
  const d2 = doc('d2', [pB]);
  const LA = lemma('LA', 'd1', 'pA');
  const LB = lemma('LB', 'd2', 'pB');
  const LC = lemma('LC', 'd1', 'pA'); // 未被使用
  const workspace: Workspace = { documents: [d1, d2], lemmas: [LC, LB, LA] };
  const used = collectUsedLemmas(d1, workspace).map((l) => l.id);
  assert(JSON.stringify(used) === JSON.stringify(['LA', 'LB']), `清单只列用到的引理且依赖在前，实际：${used.join(',')}`);
  assert(!used.includes('LC'), '未使用的引理不出现在清单中');
}

process.exit(failures ? 1 : 0);
