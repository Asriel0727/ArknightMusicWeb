export function parseStoryScript(source) {
  return String(source || '').split(/\r?\n/).flatMap((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return [];
    if (!trimmed.startsWith('[')) return [{ kind: 'dialogue', attributes: {}, text: trimmed, line: lineIndex + 1 }];
    let closing = -1;
    let quoted = false;
    for (let index = 1; index < trimmed.length; index += 1) {
      if (trimmed[index] === '"' && trimmed[index - 1] !== '\\') quoted = !quoted;
      if (trimmed[index] === ']' && !quoted) { closing = index; break; }
    }
    if (closing < 0) return [];
    const header = trimmed.slice(1, closing);
    const command = header.match(/^([A-Za-z]+)(?:\((.*)\))?$/);
    const kind = command ? command[1].toLowerCase() : 'dialogue';
    const attributes = {};
    const params = command?.[2] ?? header;
    for (const item of params.matchAll(/([A-Za-z]\w*)\s*=\s*(?:"([^"]*)"|([^,]+))(?:,|$)/g)) {
      attributes[item[1].toLowerCase()] = (item[2] ?? item[3]).trim().replace(/^"|"$/g, '');
    }
    return [{ kind, attributes, text: trimmed.slice(closing + 1).trim(), line: lineIndex + 1 }];
  });
}

export function createStoryRunner(commands) {
  let cursor = 0;
  let selectedValue = null;
  let predicateActive = true;
  let state = { background: '', image: '', portraits: [], focus: 0, grayscale: false, shade: null, speaker: '', music: null };
  let history = [];
  let historyIndex = -1;

  function capture(command, events, extra = {}) {
    return { command, state: structuredClone(state), cursor, predicateActive, events: [...events], ...extra };
  }

  function apply(command) {
    const { kind, attributes: a } = command;
    if (kind === 'background') state.background = a.image || '';
    if (kind === 'image') state.image = a.image || '';
    if (kind === 'character') {
      state.portraits = [a.name, a.name2, a.name3].filter(Boolean).map((name) => name.split('#')[0]);
      state.focus = Number(a.focus) || 0;
    }
    if (kind === 'cameraeffect' && a.effect?.toLowerCase() === 'grayscale') {
      state.grayscale = Number(a.amount) > 0;
    }
    if (kind === 'blocker') {
      const alpha = Number(a.a || 0);
      state.shade = alpha > 0 ? {
        alpha,
        red: Math.min(255, Number(a.r || 0)),
        green: Math.min(255, Number(a.g || 0)),
        blue: Math.min(255, Number(a.b || 0)),
      } : null;
    }
    if (kind === 'playmusic') {
      state.music = { key: (a.key || '').replace(/^\$/, ''), intro: (a.intro || '').replace(/^\$/, ''), volume: Number(a.volume ?? 1) };
    }
    if (kind === 'stopmusic') state.music = null;
  }

  function scan() {
    const events = [];
    while (cursor < commands.length) {
      const command = commands[cursor++];
      const { kind, attributes: a } = command;
      if (kind === 'predicate') {
        predicateActive = selectedValue === null || (a.references || '').split(';').includes(selectedValue);
        continue;
      }
      if (!predicateActive) continue;
      if (kind === 'playsound') {
        events.push({ type: 'sound', key: (a.key || '').replace(/^\$/, ''), volume: Number(a.volume ?? 1) });
        continue;
      }
      if (kind === 'decision') {
        const labels = (a.options || '').split(';');
        const values = (a.values || '').split(';');
        return capture(command, events, { type: 'decision', options: labels.map((label, index) => ({ label, value: values[index] || String(index + 1) })) });
      }
      if (kind === 'dialogue') {
        state.speaker = a.name || '';
        return capture(command, events, { type: 'dialogue', speaker: state.speaker, text: command.text });
      }
      if (kind === 'playvideo' || kind === 'video') return capture(command, events, { type: 'video', videoId: a.key || a.name || a.video || a.res });
      if (kind === 'startbattle') return capture(command, events, { type: 'end' });
      apply(command);
    }
    return { type: 'end', state: structuredClone(state), events };
  }

  function next() {
    if (historyIndex < history.length - 1) return history[++historyIndex];
    const frame = scan();
    history.push(frame);
    historyIndex += 1;
    return frame;
  }

  function choose(value) {
    if (history[historyIndex]?.type !== 'decision') return history[historyIndex];
    const decision = history[historyIndex];
    cursor = decision.cursor;
    predicateActive = decision.predicateActive;
    state = structuredClone(decision.state);
    selectedValue = String(value);
    history = history.slice(0, historyIndex + 1);
    return next();
  }

  function previous() {
    if (historyIndex > 0) historyIndex -= 1;
    return history[historyIndex];
  }

  function current() { return history[historyIndex] || null; }
  function canPrevious() { return historyIndex > 0; }
  return { next, choose, previous, current, canPrevious };
}
