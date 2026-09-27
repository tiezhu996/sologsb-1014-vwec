import m, { type Component } from 'mithril';
import katex from 'katex';
import { compareVersion, findLemmaSource, lemmaStatus, ProofStore, RULES, usedLemmaOrder } from './store';
import type { Lemma, LemmaStatus, ProofDocument, ProofStep } from './types';

const store = new ProofStore();

const snippets = [
  { label: '∀', value: '\\forall ' },
  { label: '∃', value: '\\exists ' },
  { label: '→', value: '\\to ' },
  { label: '⇔', value: '\\iff ' },
  { label: '≠', value: '\\ne ' },
  { label: '≤', value: '\\le ' },
  { label: '≥', value: '\\ge ' },
  { label: '∈', value: '\\in ' },
  { label: '∑', value: '\\sum_{i=1}^{n} ' },
  { label: '√', value: '\\sqrt{}' },
  { label: '分式', value: '\\frac{}{}' },
  { label: '上标', value: '^{}' },
  { label: '下标', value: '_{}' },
];

const typeLabel: Record<ProofStep['type'], string> = {
  premise: '前提',
  derivation: '推导',
  goal: '目标 / 结论',
};

function renderRichText(text: string): m.Children {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts.map((part) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      try {
        return m.trust(katex.renderToString(part.slice(1, -1), { throwOnError: false, output: 'html' }));
      } catch {
        return part;
      }
    }
    return part;
  });
}

function shortId(id: string): string {
  return id.replace(/^step-/, '').slice(-4).toUpperCase();
}

function download(name: string, content: string, mime: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: mime }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lemmaStatusLabel(status: LemmaStatus): string {
  if (status.state === 'revoked') return '已撤销';
  if (status.state === 'stale') return `已失效（${status.detail}）`;
  return '有效';
}

function lemmaSourceLabel(lemma: Lemma, documents: ProofDocument[]): string {
  const source = findLemmaSource(lemma, documents);
  return source ? `${source.document.title} · 步骤 ${source.index + 1}` : '来源步骤已移除';
}

export function exportMarkdown(store: ProofStore, document: ProofDocument): string {
  const lines = [`# ${document.title}`, '', `**证明目标：** $${document.goal}$`, ''];
  const lemmaRefs = (step: ProofStep): string[] => step.lemmas.map((id) => store.lemmaById(id)?.name ?? `缺失引理 ${id}`);
  document.steps.forEach((step, index) => {
    const refs = step.references.map((id) => `步骤 ${document.steps.findIndex((item) => item.id === id) + 1}`).filter((ref) => ref !== '步骤 0');
    const lemmaBasis = lemmaRefs(step);
    lines.push(`## ${index + 1}. ${step.statement}`);
    lines.push('');
    lines.push(`- 类型：${typeLabel[step.type]}`);
    lines.push(`- 推理规则：${step.rule}`);
    if (refs.length) lines.push(`- 依据：${refs.join('、')}`);
    if (lemmaBasis.length) lines.push(`- 引理依据：${lemmaBasis.join('、')}`);
    if (step.note) lines.push(`- 旁注：${step.note}`);
    if (step.counterexample) lines.push(`- 反例：${step.counterexample}`);
    if (step.alternative) lines.push(`- 替代分支：${step.alternative}`);
    lines.push('');
  });
  lines.push('## 符号表');
  Object.entries(document.symbols).forEach(([symbol, meaning]) => lines.push(`- $${symbol}$：${meaning}`));
  lines.push('');

  const used = usedLemmaOrder(document, store.lemmas);
  if (used.length) {
    lines.push('## 引理清单');
    lines.push('');
    lines.push('> 仅列本稿用到的引理（含传递依赖），被依赖的排在前面。');
    lines.push('');
    used.forEach((lemma, index) => {
      const status = lemmaStatus(lemma, store.documents);
      const basis = lemma.basisLemmaIds
        .map((id) => used.findIndex((item) => item.id === id) + 1)
        .filter(Boolean)
        .map((order) => `引理 ${order}`);
      lines.push(`### 引理 ${index + 1}. ${lemma.name}`);
      lines.push('');
      lines.push(`- 命题：${lemma.statement}`);
      lines.push(`- 状态：${lemmaStatusLabel(status)}`);
      lines.push(`- 来源：${lemmaSourceLabel(lemma, store.documents)}`);
      if (basis.length) lines.push(`- 依据：${basis.join('、')}`);
      lines.push('');
    });
  }
  return lines.join('\n');
}

export function exportLatex(store: ProofStore, document: ProofDocument): string {
  const lines = ['\\documentclass{article}', '\\usepackage{amsmath,amssymb}', '\\begin{document}', `\\section*{${document.title}}`, `\\textbf{证明目标：} $${document.goal}$`, '\\begin{enumerate}'];
  document.steps.forEach((step) => {
    const refs = step.references.map((id) => document.steps.findIndex((item) => item.id === id) + 1).filter(Boolean);
    const lemmaBasis = step.lemmas.map((id) => store.lemmaById(id)?.name ?? `缺失引理 ${id}`);
    const supportParts: string[] = [];
    if (refs.length) supportParts.push(`依据 ${refs.join(', ')}`);
    if (lemmaBasis.length) supportParts.push(`引理：${lemmaBasis.join('、')}`);
    supportParts.push(step.rule);
    lines.push(`  \\item ${step.statement} （${supportParts.join('；')}）`);
    if (step.note) lines.push(`  \\par\\small 旁注：${step.note}`);
  });
  lines.push('\\end{enumerate}');

  const used = usedLemmaOrder(document, store.lemmas);
  if (used.length) {
    lines.push('\\section*{引理清单}');
    lines.push('\\begin{enumerate}');
    used.forEach((lemma) => {
      const status = lemmaStatus(lemma, store.documents);
      lines.push(`  \\item \\textbf{${lemma.name}}：${lemma.statement}（${lemmaStatusLabel(status)}；来源：${lemmaSourceLabel(lemma, store.documents)}）`);
    });
    lines.push('\\end{enumerate}');
  }
  lines.push('\\end{document}');
  return lines.join('\n');
}

export class ProofApp implements Component {
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const inEditor = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? store.redo() : store.undo();
      m.redraw();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      store.redo();
      m.redraw();
      return;
    }
    if (command && event.key === 'Enter') {
      event.preventDefault();
      store.addStep(event.shiftKey ? 'goal' : 'derivation');
      m.redraw();
      return;
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault();
      store.save();
      store.notify('已保存到浏览器');
      m.redraw();
      return;
    }
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && !inEditor) {
      event.preventDefault();
      const steps = store.current.steps;
      const index = steps.findIndex((step) => step.id === store.selectedStepId);
      const next = event.key === 'ArrowDown' ? Math.min(index + 1, steps.length - 1) : Math.max(index - 1, 0);
      store.selectStep(steps[next]?.id ?? '');
      document.querySelector(`[data-step="${store.selectedStepId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      m.redraw();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !inEditor && store.selectedStepId) {
      event.preventDefault();
      store.removeStep(store.selectedStepId);
      m.redraw();
    }
  };

  oncreate(): void {
    window.addEventListener('keydown', this.onKeyDown);
  }

  onremove(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  view(): m.Children {
    const document = store.current;
    const selected = store.selectedStep;
    const checks = store.checks;
    const errors = checks.filter((check) => check.severity === 'error').length;
    const warnings = checks.filter((check) => check.severity === 'warning').length;
    const selectedVersion = document.versions.find((version) => version.id === store.compareVersionId);
    const diff = selectedVersion ? compareVersion(document, selectedVersion) : [];

    return m('div.app-shell', [
      m('header.topbar', [
        m('div.brand', [
          m('div.brand-mark', '∑'),
          m('div', [m('p.eyebrow', 'FORMAL NOTEBOOK'), m('h1', '格致 · 证明编辑器')]),
        ]),
        m('div.topbar-center', [
          m('span.status-dot', { class: errors ? 'has-error' : 'is-ok' }),
          errors ? `${errors} 个结构错误` : '证明结构可检查',
          m('span.topbar-separator'),
          `自动保存于 ${new Date(document.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        ]),
        m('div.actions', [
          m('button.button.is-light', { onclick: () => { store.undo(); m.redraw(); }, disabled: !store.undoStack.length, title: '撤销 Ctrl+Z' }, '↶ 撤销'),
          m('button.button.is-light', { onclick: () => { store.redo(); m.redraw(); }, disabled: !store.redoStack.length, title: '重做 Ctrl+Y' }, '↷ 重做'),
          m('button.button.is-link', { onclick: () => { store.addStep('derivation'); m.redraw(); }, title: '添加步骤 Ctrl+Enter' }, '+ 添加步骤'),
        ]),
      ]),
      m('main.workspace', [
        m('aside.left-rail', [
          m('section.panel.document-panel', [
            m('div.panel-heading', [m('span', '证明文档'), m('button.icon-button', { onclick: () => { store.addDocument(); m.redraw(); }, title: '新建证明' }, '+')]),
            m('div.document-list', store.documents.map((item) => m('button.document-item', {
              class: item.id === document.id ? 'is-active' : '',
              onclick: () => { store.selectDocument(item.id); m.redraw(); },
            }, [
              m('span.document-glyph', item.steps.length),
              m('span.document-copy', [m('strong', item.title), m('small', `${item.steps.length} 步 · ${item.author}`)]),
              m('span.chevron', '›'),
            ]))),
          ]),
          m('section.panel.version-panel', [
            m('div.panel-heading', [m('span', '版本快照'), m('span.count-badge', document.versions.length)]),
            document.versions.length === 0 && m('p.empty-copy', '保存快照后，可以并排查看改动。'),
            m('div.version-list', document.versions.map((version) => m('button.version-item', {
              class: version.id === store.compareVersionId ? 'is-active' : '',
              onclick: () => { store.compareVersionId = store.compareVersionId === version.id ? '' : version.id; m.redraw(); },
            }, [
              m('span', version.name),
              m('small', new Date(version.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
            ]))),
            m('button.button.is-fullwidth.is-small', { onclick: () => { store.createVersion(); m.redraw(); } }, '＋ 保存当前版本'),
          ]),
          m('section.check-summary', [
            m('div.check-summary-head', [
              m('div', [m('span.eyebrow', 'LIVE CHECK'), m('h2', '证明检查')]),
              m('span.check-total', { class: errors ? 'has-error' : '' }, errors + warnings),
            ]),
            m('div.check-summary-bars', [
              m('span', { style: { width: `${Math.max(8, 100 - errors * 24 - warnings * 12)}%` } }),
            ]),
            m('p', errors ? '修正错误后再保存为定稿。' : warnings ? '结构有效，仍有待核对项。' : '当前结构与引用关系完整。'),
          ]),
        ]),
        m('section.editor-column', [
          m('div.editor-titlebar', [
            m('div', [
              m('input.title-input', { value: document.title, oninput: (event: Event) => { store.update((item) => { item.title = (event.target as HTMLInputElement).value; }); } }),
              m('div.editor-meta', [`${document.author} · ${document.steps.length} 个步骤`, m('span.keyboard-hint', '拖动 ⠿ 排序')]),
            ]),
            m('div.export-actions', [
              m('button.button.is-small', { onclick: () => download(`${document.title}.md`, exportMarkdown(store, document), 'text/markdown;charset=utf-8') }, '导出 Markdown'),
              m('button.button.is-small', { onclick: () => download(`${document.title}.tex`, exportLatex(store, document), 'application/x-tex;charset=utf-8') }, '导出 LaTeX'),
            ]),
          ]),
          m('section.goal-card', [
            m('div.goal-label', '证明目标'),
            m('div.goal-formula', renderRichText(`$${document.goal}$`)),
            m('input.formula-input', {
              value: document.goal,
              onfocus: (event: Event) => { store.lastInput = event.target as HTMLInputElement; },
              oninput: (event: Event) => store.update((item) => { item.goal = (event.target as HTMLInputElement).value; }),
              'aria-label': '证明目标',
            }),
          ]),
          m('div.steps-toolbar', [
            m('div', [m('strong', '证明步骤'), m('span.steps-count', `${document.steps.length} 步`)]),
            m('div.steps-toolbar-actions', [
              m('button.button.is-small.is-white', { onclick: () => { store.addStep('premise'); m.redraw(); } }, '＋ 前提'),
              m('button.button.is-small.is-white', { onclick: () => { store.addStep('derivation'); m.redraw(); } }, '＋ 推导'),
              m('button.button.is-small.is-white', { onclick: () => { store.addStep('goal'); m.redraw(); } }, '＋ 结论'),
            ]),
          ]),
          m('div.steps-list', document.steps.length === 0 && m('div.empty-state', '尚无步骤。按 Ctrl+Enter 开始添加。'), document.steps.map((step, index) => {
            const stepChecks = checks.filter((check) => check.stepId === step.id);
            return m('article.step-card', {
              'data-step': step.id,
              class: step.id === store.selectedStepId ? 'is-selected' : '',
              draggable: true,
              onclick: () => { store.selectStep(step.id); m.redraw(); },
              ondragstart: () => { store.dragStepId = step.id; },
              ondragover: (event: DragEvent) => event.preventDefault(),
              ondrop: (event: DragEvent) => { event.preventDefault(); store.moveStep(store.dragStepId, step.id); store.dragStepId = ''; m.redraw(); },
            }, [
              m('div.step-rail', [
                m('span.drag-handle', { title: '拖动排序' }, '⠿'),
                m('span.step-number', String(index + 1).padStart(2, '0')),
              ]),
              m('div.step-body', [
                m('div.step-head', [
                  m('span.tag', { class: step.type === 'goal' ? 'is-success' : step.type === 'premise' ? 'is-info' : 'is-light' }, typeLabel[step.type]),
                  m('span.rule-chip', step.rule),
                  m('span.step-id', `#${shortId(step.id)}`),
                  stepChecks.length > 0 && m('span.issue-badge', `${stepChecks.length} 项检查`),
                  m('button.step-menu', { onclick: (event: Event) => { event.stopPropagation(); store.removeStep(step.id); m.redraw(); }, title: '删除步骤' }, '×'),
                ]),
                m('div.step-statement', renderRichText(step.statement)),
                m('div.step-footer', [
                  m('span', step.references.length ? `依据：${step.references.map((reference) => {
                    const referenceIndex = document.steps.findIndex((item) => item.id === reference);
                    return referenceIndex >= 0 ? `步骤 ${referenceIndex + 1}` : `缺失 ${shortId(reference)}`;
                  }).join('、')}` : '独立前提'),
                  ...step.lemmas.map((lemmaId) => {
                    const lemma = store.lemmaById(lemmaId);
                    const status = lemma ? lemmaStatus(lemma, store.documents) : undefined;
                    return m('span.lemma-chip', { class: !lemma ? 'is-missing' : status?.state === 'revoked' ? 'is-revoked' : status?.state === 'stale' ? 'is-stale' : 'is-active' },
                      lemma ? `引理·${lemma.name}${status?.state === 'revoked' ? '（已撤销）' : status?.state === 'stale' ? '（已失效）' : ''}` : `引理 ${shortId(lemmaId)}（已删除）`);
                  }),
                  step.note && m('span.has-note', '含旁注'),
                  step.counterexample && m('span.has-counterexample', '含反例'),
                  step.alternative && m('span.has-branch', '含替代分支'),
                ]),
              ]),
            ]);
          })),
        ]),
        m('aside.right-rail', [
          selected ? m('section.panel.inspector', [
            m('div.panel-heading', [m('span', '步骤检查器'), m('span.inspector-step', `#${shortId(selected.id)}`)]),
            m('label.field-label', '步骤类型'),
            m('div.select.is-fullwidth', m('select', { value: selected.type, onchange: (event: Event) => store.updateStep({ type: (event.target as HTMLSelectElement).value as ProofStep['type'] }) }, Object.entries(typeLabel).map(([value, label]) => m('option', { value }, label)))),
            m('label.field-label', '推理规则'),
            m('div.select.is-fullwidth', m('select', { value: selected.rule, onchange: (event: Event) => store.updateStep({ rule: (event.target as HTMLSelectElement).value }) }, RULES.map((rule) => m('option', { value: rule }, rule)))),
            m('label.field-label', '命题或推导式'),
            m('textarea.textarea.formula-textarea', {
              value: selected.statement,
              rows: 4,
              onfocus: (event: Event) => { store.lastInput = event.target as HTMLTextAreaElement; },
              oninput: (event: Event) => store.updateStep({ statement: (event.target as HTMLTextAreaElement).value }),
            }),
            m('div.formula-toolbar', snippets.map((snippet) => m('button.formula-key', {
              title: `插入 ${snippet.label}`,
              onclick: (event: Event) => {
                event.preventDefault();
                const input = store.lastInput;
                if (!input) return;
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? start;
                const next = input.value.slice(0, start) + snippet.value + input.value.slice(end);
                input.value = next;
                if (input instanceof HTMLTextAreaElement) store.updateStep({ statement: next });
                else store.update((document) => { document.goal = next; });
                input.focus();
                const cursor = start + snippet.value.length;
                input.setSelectionRange(cursor, cursor);
                m.redraw();
              },
            }, snippet.label))),
            m('label.field-label', '引用步骤'),
            m('div.reference-list', document.steps.filter((step) => step.id !== selected.id).map((step) => m('label.reference-item', [
              m('input', {
                type: 'checkbox',
                checked: selected.references.includes(step.id),
                onchange: (event: Event) => {
                  const checked = (event.target as HTMLInputElement).checked;
                  const references = checked ? [...selected.references, step.id] : selected.references.filter((id) => id !== step.id);
                  store.updateStep({ references });
                },
              }),
              m('span', `步骤 ${document.steps.indexOf(step) + 1}`),
              m('small', step.statement.replace(/\$/g, '')),
            ]))),
            m('label.field-label', '引理依据（公共引理册）'),
            m('div.reference-list', store.lemmas.length === 0 && m('p.empty-copy', '引理册还是空的，先在下方把某一步登记为引理。'), store.lemmas.map((lemma) => {
              const status = lemmaStatus(lemma, store.documents);
              return m('label.reference-item', [
                m('input', {
                  type: 'checkbox',
                  checked: selected.lemmas.includes(lemma.id),
                  onchange: (event: Event) => store.toggleStepLemma(selected.id, lemma.id, (event.target as HTMLInputElement).checked),
                }),
                m('span.lemma-pick-name', lemma.name),
                m('small', { class: status.state === 'revoked' ? 'is-revoked-text' : status.state === 'stale' ? 'is-stale-text' : '' },
                  status.state === 'revoked' ? '已撤销' : status.state === 'stale' ? `已失效·${status.reason === 'missing' ? '来源缺失' : '命题变样'}` : lemma.statement.replace(/\$/g, '')),
              ]);
            })),
            (() => {
              const registered = store.lemmas.find((lemma) => lemma.sourceDocId === document.id && lemma.sourceStepId === selected.id);
              return registered
                ? m('div.registered-lemma-hint', [
                    m('span.lemma-chip.is-active', `本步已登记为引理：${registered.name}`),
                    m('span.lemma-register-btn', { onclick: () => { globalThis.document.querySelector(`[data-lemma="${registered.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, '在引理册中查看 ↑'),
                  ])
                : m('button.button.is-small.is-white.is-fullwidth', {
                    class: 'register-lemma',
                    onclick: () => {
                      const name = window.prompt('为这条引理起个名字', selected.statement.replace(/\$/g, '').slice(0, 20) || `引理 ${store.lemmas.length + 1}`);
                      if (name === null) return;
                      store.registerLemma(selected.id, name);
                      m.redraw();
                    },
                  }, '＋ 把当前步骤登记为引理');
            })(),
            m('div.field-grid', [
              m('div', [m('label.field-label', '旁注'), m('textarea.textarea.is-small', { rows: 2, value: selected.note, placeholder: '记录思路或条件', oninput: (event: Event) => store.updateStep({ note: (event.target as HTMLTextAreaElement).value }) })]),
              m('div', [m('label.field-label', '反例 / 边界情况'), m('textarea.textarea.is-small', { rows: 2, value: selected.counterexample, placeholder: '尝试寻找反例', oninput: (event: Event) => store.updateStep({ counterexample: (event.target as HTMLTextAreaElement).value }) })]),
              m('div', [m('label.field-label', '替代分支'), m('textarea.textarea.is-small', { rows: 2, value: selected.alternative, placeholder: '另一种可行推导', oninput: (event: Event) => store.updateStep({ alternative: (event.target as HTMLTextAreaElement).value }) })]),
            ]),
            m('button.button.is-small.is-white.is-fullwidth.add-symbol', {
              onclick: () => {
                const symbol = window.prompt('输入符号名称');
                if (!symbol) return;
                const meaning = window.prompt('输入符号含义') ?? '待补充';
                store.update((document) => { document.symbols[symbol] = meaning; });
                m.redraw();
              },
            }, '＋ 登记新符号'),
          ]) : m('section.panel.inspector', m('p.empty-copy', '选择一个步骤进行检查。')),
          m('section.panel.lemma-book', [
            m('div.panel-heading', [m('span', '公共引理册'), m('span.count-badge', store.lemmas.length)]),
            store.lemmas.length === 0 && m('p.empty-copy', '把稿子里选中的步骤登记为引理，起个名字，其他稿子就能直接引用。'),
            m('div.lemma-list', store.lemmas.map((lemma) => {
              const status = lemmaStatus(lemma, store.documents);
              const source = findLemmaSource(lemma, store.documents);
              const statusText = status.state === 'revoked' ? '已撤销' : status.state === 'stale' ? (status.reason === 'missing' ? '已失效·步骤缺失' : '已失效·命题变样') : '有效';
              return m('article.lemma-card', { 'data-lemma': lemma.id, class: `is-${status.state}` }, [
                m('div.lemma-card-head', [
                  m('input.lemma-name-input', {
                    value: lemma.name,
                    title: '点击可重命名引理',
                    onchange: (event: Event) => store.renameLemma(lemma.id, (event.target as HTMLInputElement).value),
                  }),
                  m('span.lemma-status-tag', { class: `is-${status.state}` }, statusText),
                ]),
                m('div.lemma-statement', renderRichText(lemma.statement)),
                m('div.lemma-source', source
                  ? `来源：${source.document.title} · 步骤 ${source.index + 1}`
                  : '来源：来源步骤已从稿子中移除'),
                status.state === 'stale' && status.reason === 'changed' && source && m('div.lemma-drift', [
                  m('span', '当前命题：'),
                  m('span.lemma-drift-now', renderRichText(source.step.statement)),
                ]),
                m('details.lemma-basis', [
                  m('summary', lemma.basisLemmaIds.length ? `依据 ${lemma.basisLemmaIds.length} 条引理` : '设置引理依据'),
                  m('div.reference-list', store.lemmas.filter((other) => other.id !== lemma.id).map((other) => m('label.reference-item', [
                    m('input', {
                      type: 'checkbox',
                      checked: lemma.basisLemmaIds.includes(other.id),
                      onchange: () => store.toggleLemmaBasis(lemma.id, other.id),
                    }),
                    m('span.lemma-pick-name', other.name),
                    m('small', other.revoked ? '已撤销' : other.statement.replace(/\$/g, '')),
                  ]))),
                ]),
                m('div.lemma-actions', [
                  status.state === 'stale' && status.reason === 'changed'
                    && m('button.button.is-small.is-info.is-light', { onclick: () => { store.refreshLemma(lemma.id); m.redraw(); } }, '按当前稿刷新'),
                  m('button.button.is-small.is-light', {
                    class: lemma.revoked ? '' : 'is-danger',
                    onclick: () => { store.setLemmaRevoked(lemma.id, !lemma.revoked); m.redraw(); },
                  }, lemma.revoked ? '恢复使用' : '撤销引理'),
                ]),
              ]);
            })),
          ]),
          m('section.panel.symbol-panel', [
            m('div.panel-heading', [m('span', '符号表'), m('span.count-badge', Object.keys(document.symbols).length)]),
            m('div.symbol-list', Object.entries(document.symbols).map(([symbol, meaning]) => m('div.symbol-row', [
              m('code', symbol),
              m('input.symbol-meaning', { value: meaning, oninput: (event: Event) => store.update((item) => { item.symbols[symbol] = (event.target as HTMLInputElement).value; }) }),
            ]))),
          ]),
          m('section.panel.checks-panel', [
            m('div.panel-heading', [m('span', '检查结果'), m('span.count-badge', checks.length)]),
            m('div.check-list', checks.map((check) => m('button.check-item', {
              class: check.severity,
              onclick: () => { if (check.stepId) { store.selectStep(check.stepId); globalThis.document.querySelector(`[data-step="${check.stepId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } m.redraw(); },
            }, [
              m('span.check-icon', check.severity === 'error' ? '×' : check.severity === 'warning' ? '!' : '✓'),
              m('span', [m('strong', check.title), m('small', check.detail)]),
            ]))),
          ]),
          m('section.shortcut-card', [
            m('span.eyebrow', 'KEYBOARD'),
            m('p', [m('kbd', 'Ctrl'), ' + ', m('kbd', 'Enter'), ' 新步骤']),
            m('p', [m('kbd', 'Alt'), ' + ', m('kbd', '↑↓'), ' 切换步骤']),
            m('p', [m('kbd', 'Ctrl'), ' + ', m('kbd', 'Z'), ' 撤销']),
          ]),
        ]),
      ]),
      selectedVersion && m('div.diff-overlay', { onclick: () => { store.compareVersionId = ''; m.redraw(); } }, [
        m('section.diff-dialog', { onclick: (event: Event) => event.stopPropagation() }, [
          m('header.diff-head', [
            m('div', [m('span.eyebrow', 'VERSION DIFF'), m('h2', `${selectedVersion.name} ↔ 当前版本`)]),
            m('button.delete', { onclick: () => { store.compareVersionId = ''; m.redraw(); } }),
          ]),
          m('div.diff-summary', [
            m('span.tag.is-danger', `删除 ${diff.filter((item) => item.kind === 'removed').length}`),
            m('span.tag.is-success', `新增 ${diff.filter((item) => item.kind === 'added').length}`),
            m('span.tag.is-warning', `修改 ${diff.filter((item) => item.kind === 'changed').length}`),
            m('span.tag.is-light', `未变 ${diff.filter((item) => item.kind === 'same').length}`),
          ]),
          m('div.diff-table', [
            m('div.diff-row.diff-header', [m('span', '位置'), m('span', '旧版本'), m('span', '当前版本')]),
            ...diff.map((item) => m('div.diff-row', { class: `is-${item.kind}` }, [
              m('span.diff-label', item.label),
              m('span', item.before || '—'),
              m('span', item.after || '—'),
            ])),
          ]),
        ]),
      ]),
      store.toast && m('div.toast-notification', store.toast),
    ]);
  }
}
