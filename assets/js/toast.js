// 自定义消息弹窗：toast 轻提示 + confirm 确认框
// 替代浏览器原生 alert/confirm —— 原生弹窗会冻结页面事件，导致自定义圆点光标失效/闪现系统光标

const stack = document.createElement('div');
stack.className = 'toast-stack';
document.body.appendChild(stack);

// 轻提示：短暂展示后自动关闭，不打断阅读、不影响自定义光标
export function toast(message, type = 'info', duration = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 280);
  };

  el.addEventListener('click', close);
  stack.appendChild(el);
  // 限制同时可见数量，避免堆叠遮挡阅读
  while (stack.children.length > 3) stack.firstChild?.remove();
  setTimeout(close, duration);
  return close;
}

// 确认框：页面内轻量卡片，超时自动关闭（视为取消），不阻塞阅读
export function confirmBox({
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  timeout = 6000,
} = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'toast-confirm';
    box.setAttribute('role', 'dialog');
    box.innerHTML = `
      <p class="confirm-msg"></p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn ghost" data-act="cancel"></button>
        <button type="button" class="confirm-btn ${danger ? 'danger' : 'primary'}" data-act="ok"></button>
      </div>
      <div class="confirm-timer"></div>
    `;
    box.querySelector('.confirm-msg').textContent = message;
    box.querySelector('[data-act="cancel"]').textContent = cancelText;
    box.querySelector('[data-act="ok"]').textContent = confirmText;
    box.querySelector('.confirm-timer').style.animationDuration = `${timeout}ms`;

    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      box.classList.remove('is-in');
      box.classList.add('is-leaving');
      setTimeout(() => box.remove(), 280);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };

    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) done(btn.dataset.act === 'ok');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-in'));
    box.querySelector('[data-act="cancel"]').focus();

    const timer = setTimeout(() => done(false), timeout);
  });
}
