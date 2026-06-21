(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- scroll reveal ----
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  }

  // ---- stat count-up ----
  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduceMotion) { el.textContent = target; return; }
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(progress * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const statEls = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const statIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    statEls.forEach(el => statIo.observe(el));
  } else {
    statEls.forEach(el => { el.textContent = el.dataset.count; });
  }

  // ---- hero chat demo typewriter ----
  const SCRIPT = [
    { who: 'user', text: 'Apa saja syarat daftar sidang Tugas Akhir?' },
    { who: 'bot', text: 'Syarat sidang TA: minimal 4x bimbingan, similaritas di bawah 25%, dan bebas administrasi. Mau saya cek status kamu?' },
    { who: 'user', text: 'Boleh, kirim juga form pendaftarannya' },
    { who: 'bot', text: 'Form pendaftaran sidang TA siap diunduh. Berikut link dokumennya 📄' }
  ];

  const mockChat = document.getElementById('mockChat');
  if (!mockChat) return;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function makeBubble(who) {
    const div = document.createElement('div');
    div.className = 'mock-msg ' + who;
    mockChat.appendChild(div);
    while (mockChat.children.length > 3) mockChat.removeChild(mockChat.firstChild);
    return div;
  }

  async function typeInto(el, text) {
    if (reduceMotion) { el.textContent = text; return; }
    let buf = '';
    for (let i = 0; i < text.length; i++) {
      buf += text[i];
      el.innerHTML = buf + '<span class="caret"></span>';
      await sleep(18 + Math.random() * 22);
    }
    el.textContent = text;
  }

  async function runScript() {
    for (;;) {
      for (const line of SCRIPT) {
        const bubble = makeBubble(line.who);
        if (line.who === 'bot') {
          await sleep(450);
          await typeInto(bubble, line.text);
        } else {
          bubble.textContent = line.text;
        }
        await sleep(900);
      }
      await sleep(1800);
      mockChat.innerHTML = '';
      await sleep(400);
    }
  }

  runScript();
})();
