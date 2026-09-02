// 跟随光标的圆点指针（纯视觉，不干扰阅读）

const cursor = document.createElement('div');
cursor.className = 'focus-cursor';
document.body.appendChild(cursor);

let cx = window.innerWidth / 2;
let cy = window.innerHeight / 2;
let visible = false;

window.addEventListener('mousemove', (e) => {
  cx = e.clientX;
  cy = e.clientY;
  if (!visible) {
    visible = true;
    cursor.classList.add('is-visible');
  }
});

function hideCursor() {
  visible = false;
  cursor.classList.remove('is-visible', 'is-hot');
}

// 鼠标离开文档（含移出窗口）时隐藏圆点：
// mouseleave 不冒泡，需挂在 documentElement 上；mouseout 检查 relatedTarget 兜底快速移出的场景
document.documentElement.addEventListener('mouseleave', hideCursor);
document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) hideCursor();
});

// 悬停在可点击元素时，圆点放大高亮
const interactiveSel = 'a, button, .post, .comment, .side-link, .filter-chip, input, textarea, .works-card, .status-bar, .search-clear, .act-btn, .modal-close, .brand, .auth-btn, .user-avatar-btn, .logout-btn, .btn-ghost, .publish-btn, .filter-select, .toast, .meta-btn';
document.addEventListener('mouseover', (e) => {
  if (e.target.closest(interactiveSel)) cursor.classList.add('is-hot');
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest(interactiveSel)) cursor.classList.remove('is-hot');
});

function loop() {
  cursor.style.transform = `translate(${cx}px, ${cy}px)`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
